/**
 * Vite config editor backed by Tree-sitter.
 *
 * Tree-sitter is used only to *locate and validate* a small set of supported
 * config shapes (it correctly understands strings, comments, template literals
 * and regex literals). Edits are then applied as pure byte-range insertions, so
 * unrelated formatting, comments, quote style and plugin order are untouched.
 *
 * Every attach is verified against the equivalence invariant
 *
 *     detach(attach(before)) === before
 *
 * plus a Tree-sitter re-parse of the result. If the round trip is not
 * byte-exact, the edited source does not parse, or the shape is unsupported, the
 * edit is refused and the caller falls back to a manual snippet — a config is
 * never corrupted.
 *
 * Supported shapes:
 *   export default defineConfig({ ... })
 *   export default { ... }
 *   const config = { ... }; export default config;
 *   (and the same via a `defineConfig(...)` bound to a variable)
 */
import { createRequire } from "node:module";
import Parser from "web-tree-sitter";

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

interface Engine {
  parser: Parser;
  language: Parser.Language;
}

let enginePromise: Promise<Engine> | null = null;

/** Raised when the optional Tree-sitter dependencies are not installed. */
export class TreeSitterUnavailableError extends Error {
  constructor(cause: unknown) {
    super(
      "Markable's optional Tree-sitter dependencies are missing. Install them " +
        "with `npm install -D web-tree-sitter tree-sitter-wasms` (they are part of " +
        "@f12o/markable's optionalDependencies) and re-run.",
    );
    this.name = "TreeSitterUnavailableError";
    this.cause = cause;
  }
}

async function getEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const require = createRequire(import.meta.url);
      try {
        await Parser.init();
        const language = await Parser.Language.load(
          require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm"),
        );
        const parser = new Parser();
        parser.setLanguage(language);
        return { parser, language };
      } catch (error) {
        enginePromise = null;
        throw new TreeSitterUnavailableError(error);
      }
    })();
  }
  return enginePromise;
}

function unquote(text: string): string {
  return text.replace(/^['"`]/, "").replace(/['"`]$/, "");
}

function captureNode(
  match: Parser.QueryMatch,
  name: string,
): Parser.SyntaxNode | undefined {
  return match.captures.find((capture) => capture.name === name)?.node;
}

function detectPresence(
  language: Parser.Language,
  root: Parser.SyntaxNode,
): MarkablePresence {
  const importHit = language
    .query("(import_statement source: (string) @s)")
    .captures(root)
    .some((capture) => unquote(capture.node.text) === MARKABLE_VITE_SPECIFIER);
  return { import: importHit, plugin: markableInPlugins(language, root) };
}

/** True only when a `markable(...)` call is an element of a `plugins:` array. */
function markableInPlugins(
  language: Parser.Language,
  root: Parser.SyntaxNode,
): boolean {
  const matches = language
    .query("(pair key: [(property_identifier) (string)] @k value: (array) @arr)")
    .matches(root);
  for (const match of matches) {
    const key = captureNode(match, "k");
    const array = captureNode(match, "arr");
    if (!key || !array || unquote(key.text) !== "plugins") continue;
    for (const element of array.namedChildren) {
      if (element.type !== "call_expression") continue;
      const fn = element.childForFieldName("function");
      if (fn?.type === "identifier" && fn.text === "markable") return true;
    }
  }
  return false;
}

function locateConfigObject(
  language: Parser.Language,
  root: Parser.SyntaxNode,
): Parser.SyntaxNode | null {
  // 1. defineConfig({ ... }) anywhere (covers variable bindings too).
  const defineConfigObjects = language
    .query(
      "(call_expression function: (identifier) @fn arguments: (arguments (object) @obj))",
    )
    .matches(root)
    .filter((match) => captureNode(match, "fn")?.text === "defineConfig")
    .map((match) => captureNode(match, "obj"))
    .filter((node): node is Parser.SyntaxNode => Boolean(node));
  if (defineConfigObjects.length > 1) return null; // ambiguous
  if (defineConfigObjects.length === 1) return defineConfigObjects[0];

  // 2. export default { ... }
  const exportObjects = language
    .query("(export_statement (object) @obj)")
    .captures(root)
    .map((capture) => capture.node);
  if (exportObjects.length === 1) return exportObjects[0];
  if (exportObjects.length > 1) return null;

  // 3. export default <identifier>; with a same-file object literal binding.
  const exportIdents = language
    .query("(export_statement (identifier) @id)")
    .captures(root)
    .map((capture) => capture.node.text);
  if (exportIdents.length !== 1) return null;
  const name = exportIdents[0];
  const declObjects = language
    .query("(variable_declarator name: (identifier) @n value: (object) @obj)")
    .matches(root)
    .filter((match) => captureNode(match, "n")?.text === name)
    .map((match) => captureNode(match, "obj"))
    .filter((node): node is Parser.SyntaxNode => Boolean(node));
  if (declObjects.length === 1) return declObjects[0];
  return null;
}

type PluginsLookup =
  | { kind: "array"; node: Parser.SyntaxNode }
  | { kind: "missing" }
  | { kind: "not-array" };

function findPluginsArray(configObject: Parser.SyntaxNode): PluginsLookup {
  for (const child of configObject.namedChildren) {
    if (child.type !== "pair") continue;
    const key = child.childForFieldName("key");
    const value = child.childForFieldName("value");
    if (!key || !value) continue;
    if (unquote(key.text) !== "plugins") continue;
    return value.type === "array"
      ? { kind: "array", node: value }
      : { kind: "not-array" };
  }
  return { kind: "missing" };
}

interface Insertion {
  at: number;
  text: string;
}

function pluginInsertion(src: string, arrayNode: Parser.SyntaxNode): Insertion {
  const open = arrayNode.startIndex;
  const close = arrayNode.endIndex - 1;
  const inner = src.slice(open + 1, close);
  if (inner.trim() === "") {
    const nl = /\n([ \t]*)/.exec(inner);
    if (nl) return { at: open + 1, text: `\n${nl[1]}${MARKABLE_PLUGIN_CALL},` };
    return { at: open + 1, text: MARKABLE_PLUGIN_CALL };
  }
  const lead = /^(\s*\n[ \t]*)/.exec(inner);
  if (lead) return { at: open + 1, text: `${lead[1]}${MARKABLE_PLUGIN_CALL},` };
  return { at: open + 1, text: `${MARKABLE_PLUGIN_CALL}, ` };
}

function pluginsPropertyInsertion(
  src: string,
  configObject: Parser.SyntaxNode,
): Insertion {
  const open = configObject.startIndex;
  const close = configObject.endIndex - 1;
  const inner = src.slice(open + 1, close);
  const lead = /^(\s*\n[ \t]*)/.exec(inner);
  if (lead) {
    return { at: open + 1, text: `${lead[1]}plugins: [${MARKABLE_PLUGIN_CALL}],` };
  }
  if (inner.trim() === "") {
    return { at: open + 1, text: ` plugins: [${MARKABLE_PLUGIN_CALL}] ` };
  }
  return { at: open + 1, text: ` plugins: [${MARKABLE_PLUGIN_CALL}],` };
}

function importInsertion(
  language: Parser.Language,
  root: Parser.SyntaxNode,
): Insertion {
  const imports = language
    .query("(import_statement) @i")
    .captures(root)
    .map((capture) => capture.node);
  if (imports.length > 0) {
    const last = imports[imports.length - 1];
    return { at: last.endIndex, text: `\n${MARKABLE_VITE_IMPORT}` };
  }
  return { at: 0, text: `${MARKABLE_VITE_IMPORT}\n` };
}

function applyInsertion(src: string, insertion: Insertion): string {
  return src.slice(0, insertion.at) + insertion.text + src.slice(insertion.at);
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

export async function hasMarkable(code: string): Promise<MarkablePresence> {
  const { parser, language } = await getEngine();
  const tree = parser.parse(code);
  return detectPresence(language, tree.rootNode);
}

function unsupported(code: string, reason: string): AttachResult {
  return { status: "unsupported", code, edits: [], reason };
}

export async function attachMarkable(code: string): Promise<AttachResult> {
  const { parser, language } = await getEngine();
  const tree = parser.parse(code);
  const root = tree.rootNode;
  if (root.hasError) return unsupported(code, "parse-error");

  const present = detectPresence(language, root);
  if (present.import && present.plugin) {
    return { status: "already", code, edits: [] };
  }

  let result = code;
  const edits: EditRecord[] = [];

  if (!present.plugin) {
    const configObject = locateConfigObject(language, root);
    if (!configObject) return unsupported(code, "config-object");
    const plugins = findPluginsArray(configObject);
    if (plugins.kind === "not-array") return unsupported(code, "plugins-not-array");
    const insertion =
      plugins.kind === "missing"
        ? pluginsPropertyInsertion(code, configObject)
        : pluginInsertion(code, plugins.node);
    result = applyInsertion(result, insertion);
    edits.push({ kind: "plugin", text: insertion.text });
  }

  if (!present.import) {
    const reparsed = parser.parse(result);
    const insertion = importInsertion(language, reparsed.rootNode);
    result = applyInsertion(result, insertion);
    edits.push({ kind: "import", text: insertion.text });
  }

  // Equivalence invariant: detach must restore the original bytes exactly...
  if (detachMarkable(result, edits) !== code) {
    return unsupported(code, "roundtrip");
  }
  // ...and the edited config must still parse without new errors.
  if (parser.parse(result).rootNode.hasError) {
    return unsupported(code, "parse-error-after");
  }

  return { status: "changed", code: result, edits };
}
