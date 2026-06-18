import type { MarkableRect, MarkableTarget } from "../core";

export interface CaptureOptions {
  root?: Document | ShadowRoot;
  exclude?: string | Element[];
}

export interface CaptureState {
  targetAtPoint(clientX: number, clientY: number): Element | null;
  elementTarget(element: Element): MarkableTarget;
  bboxTarget(rect: DOMRect): MarkableTarget;
  pageTarget(): MarkableTarget;
  isExcluded(element: Element | null): boolean;
}

const MARKABLE_SELECTOR =
  "[data-markable-launcher], [data-markable-panel], [data-markable-highlight], [data-markable-box], [data-markable-list], [data-markable-root]";

export function createCaptureState(options: CaptureOptions = {}): CaptureState {
  const root = options.root ?? document;

  function isExcluded(element: Element | null): boolean {
    if (!element) return true;
    if (element.closest(MARKABLE_SELECTOR)) return true;

    const exclude = options.exclude;
    if (!exclude) return false;

    if (typeof exclude === "string") {
      return element.matches(exclude) || element.closest(exclude) !== null;
    }

    return exclude.some((node) => node === element || node.contains(element));
  }

  function practicalElementFor(element: Element | null): Element | null {
    if (!element || isExcluded(element)) return null;

    const marked = element.closest("[data-markable-id]") as Element | null;
    if (marked && !isExcluded(marked)) return marked;

    return element.closest(
      "button, a, input, textarea, select, label, [role], [aria-label], li, article, section, form",
    );
  }

  function targetAtPoint(clientX: number, clientY: number): Element | null {
    const element = root.elementFromPoint(clientX, clientY);
    return practicalElementFor(element);
  }

  function elementTarget(element: Element): MarkableTarget {
    const rect = element.getBoundingClientRect();
    const text = (element as HTMLElement).innerText ?? element.textContent ?? "";

    return {
      kind: "dom_element",
      locator: {
        tag: element.tagName.toLowerCase(),
        selector: selectorFor(element),
        dataMarkableId: element.getAttribute("data-markable-id") || undefined,
        id: element.id || undefined,
        classes:
          element.classList.length > 0
            ? Array.from(element.classList).slice(0, 8)
            : undefined,
        ariaLabel: element.getAttribute("aria-label") || undefined,
        role: element.getAttribute("role") || undefined,
        textSnippet: text.trim().replace(/\s+/g, " ").slice(0, 160) || undefined,
      },
      rect: rectObject(rect),
    };
  }

  function bboxTarget(rect: DOMRect): MarkableTarget {
    return {
      kind: "bbox",
      locator: { url: globalThis.location?.href },
      rect: rectObject(rect),
    };
  }

  function pageTarget(): MarkableTarget {
    return {
      kind: "dom_range",
      locator: { url: globalThis.location?.href },
    };
  }

  return {
    targetAtPoint,
    elementTarget,
    bboxTarget,
    pageTarget,
    isExcluded,
  };
}

function selectorFor(element: Element): string {
  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parent: Element | null = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (child): child is Element => child instanceof Element && child.tagName === current!.tagName,
    );
    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
    }

    current = parent;
  }

  return parts.join(" > ");
}

function cssEscape(value: string): string {
  const escape = globalThis.CSS?.escape;
  return escape ? escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function rectObject(rect: DOMRect): MarkableRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}
