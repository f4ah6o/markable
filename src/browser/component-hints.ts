const MAX_COMPONENTS = 5;
const MAX_FILE_CHARS = 300;
const MAX_ANCESTOR_LOOKUP = 10;

export interface ComponentSource {
  file: string;
  line?: number;
  column?: number;
}

export interface ComponentHints {
  framework: "react" | "vue" | "svelte";
  /** Nearest-first component display names. */
  components?: string[];
  /** Source location from dev-build metadata; absent in production builds. */
  source?: ComponentSource;
}

/**
 * Best-effort framework metadata for the picked element. Dev builds of React,
 * Vue, and Svelte attach component and source information to DOM nodes; in
 * production builds these are usually missing or minified, so every field is
 * optional and any unexpected shape (frozen objects, cross-realm values,
 * throwing getters) simply yields `undefined`.
 */
export function collectComponentHints(element: Element): ComponentHints | undefined {
  try {
    return fromReact(element) ?? fromVue(element) ?? fromSvelte(element);
  } catch {
    return undefined;
  }
}

interface ReactFiberLike {
  return?: ReactFiberLike | null;
  type?: unknown;
  _debugSource?: { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown };
}

function fromReact(element: Element): ComponentHints | undefined {
  let node: Element | null = element;
  for (let depth = 0; node && depth <= MAX_ANCESTOR_LOOKUP; depth += 1) {
    const key = Object.getOwnPropertyNames(node).find(
      (name) => name.startsWith("__reactFiber$") || name.startsWith("__reactInternalInstance$"),
    );
    if (key) {
      const fiber = (node as unknown as Record<string, unknown>)[key] as ReactFiberLike | undefined;
      if (fiber) return fromReactFiber(fiber);
    }
    node = node.parentElement;
  }
  return undefined;
}

function fromReactFiber(fiber: ReactFiberLike): ComponentHints | undefined {
  const components: string[] = [];
  let source: ComponentSource | undefined;
  let current: ReactFiberLike | null | undefined = fiber;
  // Bound the walk so a cyclic fiber graph cannot hang capture.
  for (let steps = 0; current && steps < 50; steps += 1) {
    if (!source && current._debugSource) {
      source = sourceFrom(
        current._debugSource.fileName,
        current._debugSource.lineNumber,
        current._debugSource.columnNumber,
      );
    }
    const type = current.type;
    if (typeof type === "function") {
      const name =
        (type as { displayName?: unknown }).displayName ?? (type as { name?: unknown }).name;
      if (typeof name === "string" && name && components.length < MAX_COMPONENTS) {
        components.push(name);
      }
    }
    current = current.return;
  }
  if (components.length === 0 && !source) return undefined;
  const hints: ComponentHints = { framework: "react" };
  if (components.length > 0) hints.components = components;
  if (source) hints.source = source;
  return hints;
}

interface VueComponentLike {
  parent?: VueComponentLike | null;
  type?: { __name?: unknown; name?: unknown; __file?: unknown };
}

function fromVue(element: Element): ComponentHints | undefined {
  let node: Element | null = element;
  let component: VueComponentLike | undefined;
  for (let depth = 0; node && depth <= MAX_ANCESTOR_LOOKUP; depth += 1) {
    component = (node as unknown as { __vueParentComponent?: VueComponentLike })
      .__vueParentComponent;
    if (component) break;
    node = node.parentElement;
  }
  if (!component) return undefined;

  const components: string[] = [];
  let source: ComponentSource | undefined;
  let current: VueComponentLike | null | undefined = component;
  for (let steps = 0; current && steps < 50; steps += 1) {
    const type = current.type;
    if (type) {
      const name = type.__name ?? type.name;
      if (typeof name === "string" && name && components.length < MAX_COMPONENTS) {
        components.push(name);
      }
      if (!source && typeof type.__file === "string" && type.__file) {
        source = { file: type.__file.slice(0, MAX_FILE_CHARS) };
      }
    }
    current = current.parent;
  }
  if (components.length === 0 && !source) return undefined;
  const hints: ComponentHints = { framework: "vue" };
  if (components.length > 0) hints.components = components;
  if (source) hints.source = source;
  return hints;
}

function fromSvelte(element: Element): ComponentHints | undefined {
  let node: Element | null = element;
  for (let depth = 0; node && depth <= MAX_ANCESTOR_LOOKUP; depth += 1) {
    const meta = (node as unknown as { __svelte_meta?: { loc?: Record<string, unknown> } })
      .__svelte_meta;
    const loc = meta?.loc;
    if (loc) {
      const source = sourceFrom(loc.file, loc.line, loc.column);
      if (source) return { framework: "svelte", source };
    }
    node = node.parentElement;
  }
  return undefined;
}

function sourceFrom(file: unknown, line: unknown, column: unknown): ComponentSource | undefined {
  if (typeof file !== "string" || !file) return undefined;
  const source: ComponentSource = { file: file.slice(0, MAX_FILE_CHARS) };
  if (typeof line === "number" && Number.isFinite(line)) source.line = line;
  if (typeof column === "number" && Number.isFinite(column)) source.column = column;
  return source;
}
