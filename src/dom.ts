import type { MarkableAdapter, MarkableContext, MarkableTarget } from "./core";

export interface DomAdapterOptions {
  root?: Document | HTMLElement;
}

export function createDomAdapter(options: DomAdapterOptions = {}): MarkableAdapter {
  const root = options.root ?? document;
  const doc = root instanceof Document ? root : root.ownerDocument;

  return {
    getTarget(): MarkableTarget | null {
      const selection = doc.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return null;
      }

      const range = selection.getRangeAt(0);
      const container = nearestElement(range.commonAncestorContainer);
      if (!container) {
        return null;
      }

      const rect = range.getBoundingClientRect();
      return {
        kind: "dom_range",
        locator: {
          selector: selectorFor(container),
          startOffset: range.startOffset,
          endOffset: range.endOffset,
        },
        quote: selection.toString(),
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
      };
    },

    getContext(): MarkableContext {
      return {
        url: globalThis.location?.href,
        title: doc.title,
        viewport: {
          width: globalThis.innerWidth,
          height: globalThis.innerHeight,
        },
        userAgent: globalThis.navigator?.userAgent,
      };
    },

    clearSelection() {
      doc.getSelection()?.removeAllRanges();
    },
  };
}

function nearestElement(node: Node): Element | null {
  if (node.nodeType === Node.ELEMENT_NODE) {
    return node as Element;
  }
  return node.parentElement;
}

function selectorFor(element: Element): string {
  if (element.id) {
    return `#${cssEscape(element.id)}`;
  }

  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    const currentElement: Element = current;
    const tag = currentElement.tagName.toLowerCase();
    const parent: Element | null = currentElement.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const siblings = Array.from(parent.children).filter(
      (child: Element) => child.tagName === currentElement.tagName,
    );
    if (siblings.length === 1) {
      parts.unshift(tag);
    } else {
      const index = siblings.indexOf(currentElement) + 1;
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
