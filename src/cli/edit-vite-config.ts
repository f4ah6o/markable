/**
 * Narrowly-scoped, byte-range editor for `vite.config.*` files.
 *
 * Rather than re-printing an AST (which would touch unrelated formatting,
 * comments, quote style and plugin order), this module locates a small set of
 * supported config shapes with a string scanner that is aware of strings and
 * comments, then applies pure insertions. Every attach is verified against the
 * equivalence invariant:
 *
 *     detach(attach(before)) === before
 *
 * If the round trip is not byte-exact, or the result would not parse, the edit
 * is refused and the caller is expected to fall back to a manual snippet.
 *
 * Supported shapes:
 *   export default defineConfig({ ... })
 *   export default { ... }
 *   const config = { ... }; export default config;
 */

export const MARKABLE_VITE_SPECIFIER = "@f12o/markable/vite";
export const MARKABLE_VITE_IMPORT = `import { markable } from "${MARKABLE_VITE_SPECIFIER}";`;
export const MARKABLE_PLUGIN_CALL = "markable()";

export type EditKind = "import" | "plugin";

export interface EditRecord {
  kind: EditKind;
  text: string;
}

export type AttachStatus = "changed" | "already" | "unsupported";

export interface AttachResult {
  status: AttachStatus;
  code: string;
  edits: EditRecord[];
  reason?: string;
}

export interface MarkablePresence {
  import: boolean;
  plugin: boolean;
}

/** Mark every character that is *not* inside a string or comment as `true`. */
function codeMask(src: string): boolean[] {
  const n = src.length;
  const mask = new Array<boolean>(n).fill(true);
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") mask[i++] = false;
      continue;
    }
    if (c === "/" && d === "*") {
      mask[i++] = false;
      if (i < n) mask[i++] = false;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) mask[i++] = false;
      if (i < n) mask[i++] = false;
      if (i < n) mask[i++] = false;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      mask[i++] = false;
      while (i < n) {
        if (src[i] === "\\") {
          mask[i++] = false;
          if (i < n) mask[i++] = false;
          continue;
        }
        const ch = src[i];
        mask[i++] = false;
        if (ch === quote) break;
      }
      continue;
    }
    i++;
  }
  return mask;
}

/** Index of the bracket matching the opening `{`/`[` at `openIndex`. */
function matchBracket(src: string, mask: boolean[], openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < src.length; i++) {
    if (!mask[i]) continue;
    const c = src[i];
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_$]/.test(ch);
}

function findKeyword(src: string, mask: boolean[], word: string): number[] {
  const hits: number[] = [];
  let from = 0;
  for (;;) {
    const idx = src.indexOf(word, from);
    if (idx === -1) break;
    from = idx + word.length;
    if (!mask[idx]) continue;
    if (isWordChar(src[idx - 1]) || isWordChar(src[idx + word.length])) continue;
    hits.push(idx);
  }
  return hits;
}

interface ObjectRange {
  open: number;
  close: number;
}

function objectAfter(src: string, mask: boolean[], from: number): ObjectRange | null {
  let p = from;
  while (p < src.length && /\s/.test(src[p])) p++;
  if (src[p] !== "{") return null;
  const close = matchBracket(src, mask, p);
  if (close === -1) return null;
  return { open: p, close };
}

function nextNonSpace(src: string, from: number): number {
  let p = from;
  while (p < src.length && /\s/.test(src[p])) p++;
  return p;
}

function locateConfigObject(src: string, mask: boolean[]): ObjectRange | null {
  // Only count `defineConfig(` call sites; the import binding shares the name.
  const callHits = findKeyword(src, mask, "defineConfig").filter(
    (idx) => src[nextNonSpace(src, idx + "defineConfig".length)] === "(",
  );
  if (callHits.length > 1) return null;
  if (callHits.length === 1) {
    const paren = nextNonSpace(src, callHits[0] + "defineConfig".length);
    // A function/arrow factory (defineConfig(() => ...)) is unsupported.
    return objectAfter(src, mask, paren + 1);
  }

  const exportHits = findKeyword(src, mask, "default").filter((idx) => {
    const before = src.slice(Math.max(0, idx - 16), idx);
    return /export\s+$/.test(before);
  });
  if (exportHits.length !== 1) return null;
  const after = nextNonSpace(src, exportHits[0] + "default".length);
  if (src[after] === "{") {
    const close = matchBracket(src, mask, after);
    if (close === -1) return null;
    return { open: after, close };
  }
  // export default <identifier>;  -> resolve a same-file object literal binding.
  const identMatch = /^([A-Za-z_$][A-Za-z0-9_$]*)/.exec(src.slice(after));
  if (!identMatch) return null;
  const ident = identMatch[1];
  const declRe = new RegExp(`(?:const|let|var)\\s+${ident}\\s*=`, "g");
  const declHits: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src))) {
    if (mask[m.index]) declHits.push(m.index + m[0].length);
  }
  if (declHits.length !== 1) return null;
  const valueStart = nextNonSpace(src, declHits[0]);
  if (src[valueStart] !== "{") return null;
  const close = matchBracket(src, mask, valueStart);
  if (close === -1) return null;
  return { open: valueStart, close };
}

type PluginsArray = ObjectRange | "missing" | "not-array";

function findPluginsArray(
  src: string,
  mask: boolean[],
  obj: ObjectRange,
): PluginsArray {
  let depth = 0;
  for (let i = obj.open; i <= obj.close; i++) {
    if (!mask[i]) continue;
    const c = src[i];
    if (c === "{" || c === "[") {
      depth++;
      continue;
    }
    if (c === "}" || c === "]") {
      depth--;
      continue;
    }
    if (
      depth === 1 &&
      src.startsWith("plugins", i) &&
      !isWordChar(src[i - 1]) &&
      !isWordChar(src[i + "plugins".length])
    ) {
      let j = i + "plugins".length;
      while (j <= obj.close && /\s/.test(src[j])) j++;
      if (src[j] !== ":") continue;
      j++;
      while (j <= obj.close && /\s/.test(src[j])) j++;
      if (src[j] !== "[") return "not-array";
      const close = matchBracket(src, mask, j);
      if (close === -1) return "not-array";
      return { open: j, close };
    }
  }
  return "missing";
}

interface Insertion {
  at: number;
  text: string;
}

function pluginInsertion(src: string, array: ObjectRange): Insertion {
  const inner = src.slice(array.open + 1, array.close);
  if (inner.trim() === "") {
    const nl = /\n([ \t]*)/.exec(inner);
    if (nl) return { at: array.open + 1, text: `\n${nl[1]}${MARKABLE_PLUGIN_CALL},` };
    return { at: array.open + 1, text: MARKABLE_PLUGIN_CALL };
  }
  const lead = /^(\s*\n[ \t]*)/.exec(inner);
  if (lead) return { at: array.open + 1, text: `${lead[1]}${MARKABLE_PLUGIN_CALL},` };
  return { at: array.open + 1, text: `${MARKABLE_PLUGIN_CALL}, ` };
}

function pluginsPropertyInsertion(src: string, obj: ObjectRange): Insertion {
  const inner = src.slice(obj.open + 1, obj.close);
  const lead = /^(\s*\n[ \t]*)/.exec(inner);
  if (lead) {
    return { at: obj.open + 1, text: `${lead[1]}plugins: [${MARKABLE_PLUGIN_CALL}],` };
  }
  if (inner.trim() === "") {
    return { at: obj.open + 1, text: ` plugins: [${MARKABLE_PLUGIN_CALL}] ` };
  }
  return { at: obj.open + 1, text: ` plugins: [${MARKABLE_PLUGIN_CALL}],` };
}

function importInsertion(src: string, mask: boolean[]): Insertion {
  const re = /^[ \t]*import\b[^\n]*$/gm;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(src))) {
    if (mask[m.index]) last = m;
  }
  if (last) {
    return { at: last.index + last[0].length, text: `\n${MARKABLE_VITE_IMPORT}` };
  }
  return { at: 0, text: `${MARKABLE_VITE_IMPORT}\n` };
}

function applyInsertion(src: string, insertion: Insertion): string {
  return src.slice(0, insertion.at) + insertion.text + src.slice(insertion.at);
}

export function hasMarkable(code: string): MarkablePresence {
  const mask = codeMask(code);
  const importHit = code.includes(MARKABLE_VITE_SPECIFIER)
    ? findSpecifier(code, mask)
    : false;
  const pluginHit = /\bmarkable\s*\(/.exec(code);
  const plugin = pluginHit ? mask[pluginHit.index] : false;
  return { import: importHit, plugin };
}

function findSpecifier(code: string, mask: boolean[]): boolean {
  let from = 0;
  for (;;) {
    const idx = code.indexOf(MARKABLE_VITE_SPECIFIER, from);
    if (idx === -1) return false;
    if (!mask[idx]) return true; // inside a string literal -> the import specifier
    from = idx + MARKABLE_VITE_SPECIFIER.length;
  }
}

/** A balanced-bracket / terminated-literal check used as a cheap parse proxy. */
export function isBalanced(src: string): boolean {
  const stack: string[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      if (i >= n) return false;
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i++;
      let closed = false;
      while (i < n) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            i++;
          }
          continue;
        }
        if (src[i] === quote) {
          closed = true;
          i++;
          break;
        }
        i++;
      }
      if (!closed) return false;
      continue;
    }
    if (c === "(" || c === "{" || c === "[") stack.push(c);
    else if (c === ")" || c === "}" || c === "]") {
      const open = stack.pop();
      if (!open) return false;
      if (
        (c === ")" && open !== "(") ||
        (c === "}" && open !== "{") ||
        (c === "]" && open !== "[")
      ) {
        return false;
      }
    }
    i++;
  }
  return stack.length === 0;
}

/** Remove the first occurrence of each recorded edit text. */
export function detachMarkable(code: string, edits: EditRecord[]): string {
  let result = code;
  for (const edit of edits) {
    const idx = result.indexOf(edit.text);
    if (idx === -1) continue;
    result = result.slice(0, idx) + result.slice(idx + edit.text.length);
  }
  return result;
}

export function attachMarkable(code: string): AttachResult {
  const mask = codeMask(code);
  const present = hasMarkable(code);
  if (present.import && present.plugin) {
    return { status: "already", code, edits: [] };
  }

  let result = code;
  const edits: EditRecord[] = [];

  if (!present.plugin) {
    const obj = locateConfigObject(code, mask);
    if (!obj) {
      return { status: "unsupported", code, edits: [], reason: "config-object" };
    }
    const array = findPluginsArray(code, mask, obj);
    if (array === "not-array") {
      return { status: "unsupported", code, edits: [], reason: "plugins-not-array" };
    }
    const insertion =
      array === "missing"
        ? pluginsPropertyInsertion(code, obj)
        : pluginInsertion(code, array);
    result = applyInsertion(result, insertion);
    edits.push({ kind: "plugin", text: insertion.text });
  }

  if (!present.import) {
    const insertion = importInsertion(result, codeMask(result));
    result = applyInsertion(result, insertion);
    edits.push({ kind: "import", text: insertion.text });
  }

  // Equivalence invariant: removing exactly what we inserted must reproduce the
  // original bytes, and the result must still parse.
  if (detachMarkable(result, edits) !== code) {
    return { status: "unsupported", code, edits: [], reason: "roundtrip" };
  }
  if (!isBalanced(result)) {
    return { status: "unsupported", code, edits: [], reason: "unbalanced" };
  }

  return { status: "changed", code: result, edits };
}
