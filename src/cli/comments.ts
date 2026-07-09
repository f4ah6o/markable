import type { MarkableAnnotation, MarkableMode } from "../core";

export interface CommentsFilter {
  status?: string[];
  mode?: MarkableMode;
  id?: string;
  limit?: number;
}

/** The element-locator fields the browser capture layer writes. All optional:
 * older annotations and non-element targets carry only a subset. */
interface ElementLocator {
  tag?: string;
  selector?: string;
  dataMarkableId?: string;
  id?: string;
  classes?: string[];
  ariaLabel?: string;
  role?: string;
  textSnippet?: string;
  url?: string;
  ancestors?: Array<{ tag?: string; id?: string; classes?: string[]; role?: string }>;
  attributes?: Record<string, string>;
  outerHtml?: string;
  nearestHeading?: { tag?: string; text?: string };
  landmark?: { tag?: string; role?: string; label?: string };
  componentHints?: {
    framework?: string;
    components?: string[];
    source?: { file?: string; line?: number; column?: number };
  };
}

export function filterAnnotations(
  annotations: MarkableAnnotation[],
  filter: CommentsFilter = {},
): MarkableAnnotation[] {
  let result = annotations;
  if (filter.id) {
    result = result.filter((annotation) => annotation.id === filter.id);
  }
  if (filter.status && filter.status.length > 0) {
    const statuses = new Set(filter.status);
    result = result.filter((annotation) => statuses.has(annotation.status));
  }
  if (filter.mode) {
    result = result.filter((annotation) => annotation.mode === filter.mode);
  }
  if (filter.limit !== undefined && filter.limit >= 0) {
    result = result.slice(-filter.limit);
  }
  return result;
}

/**
 * Agent-oriented markdown rendering: one section per annotation carrying every
 * captured field that helps map the mark back to source code. Fields that were
 * not captured are omitted rather than printed empty.
 */
export function formatAnnotationsMarkdown(annotations: MarkableAnnotation[]): string {
  const lines: string[] = [];
  lines.push(`# Markable annotations (${annotations.length})`);

  annotations.forEach((annotation, index) => {
    const locator = (annotation.target.locator ?? {}) as ElementLocator;
    lines.push("");
    lines.push(
      `## ${index + 1}. ${annotation.id} [${annotation.status}] (${annotation.mode}) — ${annotation.createdAt}`,
    );
    lines.push("");
    lines.push(annotation.message);
    lines.push("");

    const url = contextString(annotation, "url") ?? locator.url;
    push(lines, "url", url);
    push(lines, "page title", contextString(annotation, "title"));
    push(lines, "target", targetLine(annotation, locator));
    push(lines, "ancestors", ancestorsLine(locator));
    push(lines, "region", regionLine(locator));
    push(lines, "component", componentLine(locator));
    push(lines, "attributes", attributesLine(locator));
    if (locator.textSnippet) push(lines, "text", `"${locator.textSnippet}"`);
    push(lines, "rect", rectLine(annotation));
    if (locator.outerHtml) push(lines, "html", `\`${locator.outerHtml}\``);
  });

  lines.push("");
  return lines.join("\n");
}

function push(lines: string[], label: string, value: string | undefined): void {
  if (value) lines.push(`- ${label}: ${value}`);
}

function contextString(annotation: MarkableAnnotation, key: string): string | undefined {
  const value = annotation.context?.[key];
  return typeof value === "string" && value ? value : undefined;
}

function elementSummary(locator: ElementLocator): string | undefined {
  const tag = locator.tag;
  if (!tag) return undefined;
  const id = locator.id ? `#${locator.id}` : "";
  const classes = locator.classes?.length ? `.${locator.classes.join(".")}` : "";
  return `\`${tag}${id}${classes}\``;
}

function targetLine(annotation: MarkableAnnotation, locator: ElementLocator): string {
  const parts: string[] = [annotation.target.kind];
  const summary = elementSummary(locator);
  if (summary) parts.push(summary);
  if (locator.dataMarkableId) parts.push(`data-markable-id \`${locator.dataMarkableId}\``);
  if (locator.selector) parts.push(`— selector \`${locator.selector}\``);
  if (locator.ariaLabel) parts.push(`(aria-label "${locator.ariaLabel}")`);
  return parts.join(" ");
}

function ancestorsLine(locator: ElementLocator): string | undefined {
  if (!locator.ancestors?.length) return undefined;
  // Captured nearest-first; render outermost-first so it reads like a path.
  return locator.ancestors
    .slice()
    .reverse()
    .map((entry) => {
      const id = entry.id ? `#${entry.id}` : "";
      const classes = entry.classes?.length ? `.${entry.classes.join(".")}` : "";
      const role = entry.role ? `[role=${entry.role}]` : "";
      return `${entry.tag ?? "?"}${id}${classes}${role}`;
    })
    .join(" > ");
}

function regionLine(locator: ElementLocator): string | undefined {
  const parts: string[] = [];
  if (locator.nearestHeading?.text) {
    parts.push(`heading "${locator.nearestHeading.text}" (${locator.nearestHeading.tag ?? "?"})`);
  }
  if (locator.landmark) {
    const label = locator.landmark.label ? `[aria-label="${locator.landmark.label}"]` : "";
    const role = locator.landmark.role ? `[role=${locator.landmark.role}]` : "";
    parts.push(`landmark ${locator.landmark.tag ?? "?"}${role}${label}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function componentLine(locator: ElementLocator): string | undefined {
  const hints = locator.componentHints;
  if (!hints) return undefined;
  const parts: string[] = [];
  if (hints.components?.length) parts.push(hints.components.join(" ← "));
  if (hints.source?.file) {
    const line = hints.source.line !== undefined ? `:${hints.source.line}` : "";
    parts.push(`(${hints.source.file}${line})`);
  }
  if (parts.length === 0) return undefined;
  if (hints.framework) parts.push(`[${hints.framework}]`);
  return parts.join(" ");
}

function attributesLine(locator: ElementLocator): string | undefined {
  const attributes = locator.attributes;
  if (!attributes || Object.keys(attributes).length === 0) return undefined;
  return Object.entries(attributes)
    .map(([name, value]) => `${name}="${value}"`)
    .join(" ");
}

function rectLine(annotation: MarkableAnnotation): string | undefined {
  const parts: string[] = [];
  const rect = annotation.target.rect;
  if (rect) {
    parts.push(`${Math.round(rect.width)}×${Math.round(rect.height)} @ (${Math.round(rect.x)}, ${Math.round(rect.y)})`);
  }
  const viewport = annotation.context?.viewport as { width?: number; height?: number } | undefined;
  if (viewport && typeof viewport.width === "number" && typeof viewport.height === "number") {
    parts.push(`viewport ${viewport.width}×${viewport.height}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
