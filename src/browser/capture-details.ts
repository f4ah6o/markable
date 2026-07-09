const MAX_ANCESTORS = 6;
const MAX_ANCESTOR_CLASSES = 8;
const MAX_ATTRIBUTE_ENTRIES = 12;
const MAX_ATTRIBUTE_VALUE_CHARS = 200;
const MAX_TEXT_CHARS = 120;

const ALLOWED_ATTRIBUTE_NAMES = new Set([
  "href",
  "src",
  "type",
  "name",
  "placeholder",
  "alt",
  "title",
  "for",
]);

/** Attribute names that must never be captured even when allow-listed. */
const DENIED_ATTRIBUTE_PATTERN = /token|secret|auth|key|session|password|csrf|jwt/i;

const LANDMARK_SELECTOR = [
  "nav",
  "main",
  "aside",
  "header",
  "footer",
  "form",
  "section[aria-label]",
  "section[aria-labelledby]",
  "[role=navigation]",
  "[role=main]",
  "[role=region]",
  "[role=complementary]",
  "[role=search]",
  "[role=form]",
  "[role=dialog]",
].join(", ");

export interface AncestorEntry {
  tag: string;
  id?: string;
  classes?: string[];
  role?: string;
}

export interface HeadingInfo {
  tag: string;
  text: string;
}

export interface LandmarkInfo {
  tag: string;
  role?: string;
  label?: string;
}

export function collectAncestors(element: Element, max = MAX_ANCESTORS): AncestorEntry[] | undefined {
  const entries: AncestorEntry[] = [];
  let current = element.parentElement;
  while (current && entries.length < max) {
    const tag = current.tagName.toLowerCase();
    if (tag === "body" || tag === "html") break;
    const entry: AncestorEntry = { tag };
    if (current.id) entry.id = current.id;
    if (current.classList.length > 0) {
      entry.classes = Array.from(current.classList).slice(0, MAX_ANCESTOR_CLASSES);
    }
    const role = current.getAttribute("role");
    if (role) entry.role = role;
    entries.push(entry);
    current = current.parentElement;
  }
  return entries.length > 0 ? entries : undefined;
}

function isDeniedAttribute(name: string): boolean {
  return (
    name === "value" ||
    name === "style" ||
    name === "srcset" ||
    name.startsWith("data-markable-") ||
    DENIED_ATTRIBUTE_PATTERN.test(name)
  );
}

function isAllowedAttribute(name: string): boolean {
  if (isDeniedAttribute(name)) return false;
  return ALLOWED_ATTRIBUTE_NAMES.has(name) || name.startsWith("aria-") || name.startsWith("data-");
}

export function collectAttributes(element: Element): Record<string, string> | undefined {
  const entries: Record<string, string> = {};
  let count = 0;
  for (const attribute of Array.from(element.attributes)) {
    if (count >= MAX_ATTRIBUTE_ENTRIES) break;
    const name = attribute.name.toLowerCase();
    if (!isAllowedAttribute(name)) continue;
    entries[name] = attribute.value.slice(0, MAX_ATTRIBUTE_VALUE_CHARS);
    count += 1;
  }
  return count > 0 ? entries : undefined;
}

const PASSWORD_INPUT_KEEP = new Set(["type", "name", "id", "placeholder"]);

function sanitizeClonedElement(node: Element): void {
  const isSensitiveInput =
    node.tagName === "INPUT" &&
    /^(password|hidden)$/i.test(node.getAttribute("type") ?? "");

  for (const attribute of Array.from(node.attributes)) {
    const name = attribute.name.toLowerCase();
    if (isSensitiveInput && !PASSWORD_INPUT_KEEP.has(name)) {
      node.removeAttribute(attribute.name);
      continue;
    }
    if (name === "value" || name === "style" || DENIED_ATTRIBUTE_PATTERN.test(name)) {
      node.removeAttribute(attribute.name);
    }
  }

  if (node.tagName === "TEXTAREA") {
    node.textContent = "";
  }
}

/**
 * Serialize a sanitized snapshot of the element. The live DOM is never
 * touched: everything operates on a deep clone. Scripts and styles are
 * removed, `value`/`style`/secret-looking attributes are stripped everywhere,
 * password and hidden inputs keep only type/name/id/placeholder, and textarea
 * content is cleared, so user-typed form content never leaves the page.
 */
export function sanitizedOuterHtml(element: Element, maxChars = 2048): string | undefined {
  const clone = element.cloneNode(true) as Element;
  for (const removable of Array.from(clone.querySelectorAll("script, style"))) {
    removable.remove();
  }
  sanitizeClonedElement(clone);
  for (const node of Array.from(clone.querySelectorAll("*"))) {
    sanitizeClonedElement(node);
  }
  const html = clone.outerHTML.replace(/\s+/g, " ").trim().slice(0, maxChars);
  return html || undefined;
}

function collapsedText(element: Element): string {
  return (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_CHARS);
}

export function nearestHeading(
  element: Element,
  root: Document | ShadowRoot,
): HeadingInfo | undefined {
  const headings = root.querySelectorAll("h1, h2, h3, h4, h5, h6, [role=heading]");
  let nearest: Element | undefined;
  for (const heading of Array.from(headings)) {
    const position = heading.compareDocumentPosition(element);
    // Keep the last heading that precedes (or contains) the element.
    if (
      position & Node.DOCUMENT_POSITION_FOLLOWING ||
      position & Node.DOCUMENT_POSITION_CONTAINED_BY
    ) {
      nearest = heading;
    }
  }
  if (!nearest) return undefined;
  const text = collapsedText(nearest);
  if (!text) return undefined;
  return { tag: nearest.tagName.toLowerCase(), text };
}

export function enclosingLandmark(element: Element): LandmarkInfo | undefined {
  const landmark = element.closest(LANDMARK_SELECTOR);
  if (!landmark) return undefined;
  const info: LandmarkInfo = { tag: landmark.tagName.toLowerCase() };
  const role = landmark.getAttribute("role");
  if (role) info.role = role;
  const label = landmarkLabel(landmark);
  if (label) info.label = label;
  return info;
}

function landmarkLabel(landmark: Element): string | undefined {
  const ariaLabel = landmark.getAttribute("aria-label");
  if (ariaLabel) return ariaLabel.trim().slice(0, MAX_TEXT_CHARS) || undefined;
  const labelledBy = landmark.getAttribute("aria-labelledby");
  if (!labelledBy) return undefined;
  const target = (landmark.ownerDocument ?? document).getElementById(labelledBy.split(/\s+/)[0]);
  if (!target) return undefined;
  return collapsedText(target) || undefined;
}

function jsonByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

/**
 * Shrink a locator until its JSON stays under `maxBytes`, dropping the least
 * essential fields first. The server rejects (rather than truncates) locators
 * over its own byte cap, so the browser must fit the budget before submitting.
 * The pass list is fixed, so this always terminates.
 */
export function fitLocatorBudget(
  locator: Record<string, unknown>,
  maxBytes: number,
): Record<string, unknown> {
  if (jsonByteLength(locator) <= maxBytes) return locator;

  const result = { ...locator };
  const passes: Array<() => void> = [
    () => delete result.outerHtml,
    () => delete result.attributes,
    () => {
      if (Array.isArray(result.ancestors)) result.ancestors = result.ancestors.slice(0, 3);
    },
    () => delete result.ancestors,
    () => {
      const hints = result.componentHints as { components?: unknown } | undefined;
      if (hints && Array.isArray(hints.components)) {
        result.componentHints = { ...hints, components: hints.components.slice(0, 2) };
      }
    },
    () => delete result.componentHints,
    () => {
      delete result.nearestHeading;
      delete result.landmark;
    },
    () => delete result.textSnippet,
    () => {
      if (typeof result.selector === "string") result.selector = result.selector.slice(0, 1024);
    },
  ];

  for (const pass of passes) {
    pass();
    if (jsonByteLength(result) <= maxBytes) return result;
  }
  return result;
}
