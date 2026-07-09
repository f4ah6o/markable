import { describe, expect, it } from "vitest";
import type { MarkableAnnotation } from "../core";
import { filterAnnotations, formatAnnotationsMarkdown } from "./comments";

function annotation(overrides: Partial<MarkableAnnotation> = {}): MarkableAnnotation {
  return {
    id: "mark-1",
    mode: "review",
    message: "Make this button primary",
    status: "open",
    target: {
      kind: "dom_element",
      locator: { tag: "button", selector: "main > form > button" },
    },
    createdAt: "2026-07-09T00:00:00.000Z",
    updatedAt: "2026-07-09T00:00:00.000Z",
    ...overrides,
  };
}

describe("filterAnnotations", () => {
  const list = [
    annotation({ id: "a", status: "open", mode: "review" }),
    annotation({ id: "b", status: "resolved", mode: "review" }),
    annotation({ id: "c", status: "open", mode: "feedback" }),
    annotation({ id: "d", status: "needs_user_reply", mode: "feedback" }),
  ];

  it("returns everything without a filter", () => {
    expect(filterAnnotations(list)).toHaveLength(4);
  });

  it("filters by status list", () => {
    const filtered = filterAnnotations(list, { status: ["open", "needs_user_reply"] });
    expect(filtered.map((item) => item.id)).toEqual(["a", "c", "d"]);
  });

  it("filters by mode and id", () => {
    expect(filterAnnotations(list, { mode: "feedback" }).map((item) => item.id)).toEqual([
      "c",
      "d",
    ]);
    expect(filterAnnotations(list, { id: "b" }).map((item) => item.id)).toEqual(["b"]);
  });

  it("keeps the most recent entries when limited", () => {
    expect(filterAnnotations(list, { limit: 2 }).map((item) => item.id)).toEqual(["c", "d"]);
  });
});

describe("formatAnnotationsMarkdown", () => {
  it("renders every captured field for a rich annotation", () => {
    const rich = annotation({
      target: {
        kind: "dom_element",
        locator: {
          tag: "button",
          id: "pay",
          classes: ["btn", "primary"],
          selector: "main > form > button",
          textSnippet: "Pay now",
          ancestors: [
            { tag: "form" },
            { tag: "section", id: "checkout", classes: ["card"] },
            { tag: "main" },
          ],
          attributes: { type: "submit", "data-testid": "pay" },
          outerHtml: '<button type="submit">Pay now</button>',
          nearestHeading: { tag: "h2", text: "Checkout" },
          landmark: { tag: "section", label: "Checkout" },
          componentHints: {
            framework: "react",
            components: ["PayButton", "CheckoutForm"],
            source: { file: "src/components/CheckoutForm.tsx", line: 42 },
          },
        },
        rect: { x: 24, y: 480, width: 320, height: 48 },
      },
      context: {
        url: "https://shop.example/checkout",
        title: "Checkout — Shop",
        viewport: { width: 1280, height: 800 },
      },
    });

    const markdown = formatAnnotationsMarkdown([rich]);
    expect(markdown).toContain("# Markable annotations (1)");
    expect(markdown).toContain("## 1. mark-1 [open] (review) — 2026-07-09T00:00:00.000Z");
    expect(markdown).toContain("Make this button primary");
    expect(markdown).toContain("- url: https://shop.example/checkout");
    expect(markdown).toContain("- page title: Checkout — Shop");
    expect(markdown).toContain(
      "- target: dom_element `button#pay.btn.primary` — selector `main > form > button`",
    );
    expect(markdown).toContain("- ancestors: main > section#checkout.card > form");
    expect(markdown).toContain('- region: heading "Checkout" (h2) · landmark section[aria-label="Checkout"]');
    expect(markdown).toContain(
      "- component: PayButton ← CheckoutForm (src/components/CheckoutForm.tsx:42) [react]",
    );
    expect(markdown).toContain('- attributes: type="submit" data-testid="pay"');
    expect(markdown).toContain('- text: "Pay now"');
    expect(markdown).toContain("- rect: 320×48 @ (24, 480) · viewport 1280×800");
    expect(markdown).toContain('- html: `<button type="submit">Pay now</button>`');
  });

  it("omits fields that were never captured (old annotations)", () => {
    const markdown = formatAnnotationsMarkdown([annotation()]);
    expect(markdown).toContain("- target: dom_element `button` — selector `main > form > button`");
    expect(markdown).not.toContain("- ancestors:");
    expect(markdown).not.toContain("- region:");
    expect(markdown).not.toContain("- component:");
    expect(markdown).not.toContain("- attributes:");
    expect(markdown).not.toContain("- html:");
    expect(markdown).not.toContain("- rect:");
  });

  it("handles page and bbox targets", () => {
    const page = annotation({
      id: "mark-page",
      target: { kind: "dom_range", locator: { url: "https://shop.example/" } },
    });
    const markdown = formatAnnotationsMarkdown([page]);
    expect(markdown).toContain("- target: dom_range");
    expect(markdown).toContain("- url: https://shop.example/");
  });
});
