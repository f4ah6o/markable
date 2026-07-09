// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { MAX_LOCATOR_BYTES } from "../annotations";
import { createCaptureState, LOCATOR_BUDGET_BYTES } from "./capture";
import {
  collectAncestors,
  collectAttributes,
  enclosingLandmark,
  fitLocatorBudget,
  nearestHeading,
  sanitizedOuterHtml,
} from "./capture-details";
import { resolveCaptureOptions } from "./capture-options";
import { collectComponentHints } from "./component-hints";

afterEach(() => {
  document.body.innerHTML = "";
});

function locatorFor(element: Element, options: Parameters<typeof createCaptureState>[0] = {}) {
  const capture = createCaptureState(options);
  return capture.elementTarget(element).locator as Record<string, unknown>;
}

describe("resolveCaptureOptions", () => {
  it("keeps the browser budget under the server locator cap", () => {
    expect(LOCATOR_BUDGET_BYTES).toBeLessThan(MAX_LOCATOR_BYTES);
  });

  it("enables everything in review mode", () => {
    expect(resolveCaptureOptions("review")).toEqual({
      ancestors: true,
      attributes: true,
      landmarks: true,
      outerHtml: true,
      componentHints: true,
    });
  });

  it("keeps outerHtml and componentHints off in feedback mode", () => {
    expect(resolveCaptureOptions("feedback")).toEqual({
      ancestors: true,
      attributes: true,
      landmarks: true,
      outerHtml: false,
      componentHints: false,
    });
  });

  it("lets explicit options override the mode defaults", () => {
    const resolved = resolveCaptureOptions("feedback", { outerHtml: true, ancestors: false });
    expect(resolved.outerHtml).toBe(true);
    expect(resolved.ancestors).toBe(false);
    expect(resolved.componentHints).toBe(false);
  });
});

describe("collectAncestors", () => {
  it("collects parents nearest-first and stops at body", () => {
    document.body.innerHTML =
      '<main><section id="checkout" class="card wide" role="region"><form><button>Go</button></form></section></main>';
    const button = document.querySelector("button") as Element;

    expect(collectAncestors(button)).toEqual([
      { tag: "form" },
      { tag: "section", id: "checkout", classes: ["card", "wide"], role: "region" },
      { tag: "main" },
    ]);
  });

  it("caps the chain length and per-entry classes", () => {
    const classes = Array.from({ length: 12 }, (_, index) => `c${index}`).join(" ");
    document.body.innerHTML = `<div class="${classes}"><div><div><div><div><div><div><span>x</span></div></div></div></div></div></div></div>`;
    const span = document.querySelector("span") as Element;

    const ancestors = collectAncestors(span);
    expect(ancestors).toHaveLength(6);
    expect(ancestors?.every((entry) => entry.tag === "div")).toBe(true);
  });

  it("returns undefined for a direct child of body", () => {
    document.body.innerHTML = "<button>x</button>";
    expect(collectAncestors(document.querySelector("button") as Element)).toBeUndefined();
  });
});

describe("collectAttributes", () => {
  it("keeps whitelisted attributes and drops sensitive ones", () => {
    document.body.innerHTML =
      '<input type="email" name="mail" placeholder="you@example" value="typed@secret" style="color:red" data-testid="mail-input" data-auth-token="abc" aria-describedby="hint">';
    const input = document.querySelector("input") as Element;

    expect(collectAttributes(input)).toEqual({
      type: "email",
      name: "mail",
      placeholder: "you@example",
      "data-testid": "mail-input",
      "aria-describedby": "hint",
    });
  });

  it("caps value length and entry count", () => {
    const attrs = Array.from({ length: 20 }, (_, index) => `data-x${index}="v"`).join(" ");
    document.body.innerHTML = `<div ${attrs} data-long="${"a".repeat(400)}">x</div>`;
    const div = document.querySelector("div") as Element;

    const collected = collectAttributes(div) ?? {};
    expect(Object.keys(collected)).toHaveLength(12);
    for (const value of Object.values(collected)) {
      expect(value.length).toBeLessThanOrEqual(200);
    }
  });

  it("returns undefined when nothing is captured", () => {
    document.body.innerHTML = "<div>x</div>";
    expect(collectAttributes(document.querySelector("div") as Element)).toBeUndefined();
  });
});

describe("sanitizedOuterHtml", () => {
  it("strips values, scripts, and secret-looking attributes without touching the live DOM", () => {
    document.body.innerHTML =
      '<form><input type="text" value="typed"><input type="password" name="pw" value="hunter2" autocomplete="off"><textarea>drafted text</textarea><script>alert(1)</script><button data-csrf-token="t">Send</button></form>';
    const form = document.querySelector("form") as Element;

    const html = sanitizedOuterHtml(form) ?? "";
    expect(html).not.toContain("typed");
    expect(html).not.toContain("hunter2");
    expect(html).not.toContain("drafted text");
    expect(html).not.toContain("script");
    expect(html).not.toContain("data-csrf-token");
    expect(html).not.toContain("autocomplete");
    expect(html).toContain('type="password"');
    expect(html).toContain('name="pw"');
    expect(html).toContain("Send");

    // The live DOM keeps everything.
    expect(document.querySelector("input")?.getAttribute("value")).toBe("typed");
    expect(document.querySelector("textarea")?.textContent).toBe("drafted text");
    expect(document.querySelector("script")).not.toBeNull();
  });

  it("caps the serialized length", () => {
    document.body.innerHTML = `<div>${"word ".repeat(2000)}</div>`;
    const html = sanitizedOuterHtml(document.querySelector("div") as Element) ?? "";
    expect(html.length).toBeLessThanOrEqual(2048);
  });
});

describe("nearestHeading / enclosingLandmark", () => {
  it("finds the closest preceding heading and the enclosing landmark", () => {
    document.body.innerHTML =
      '<main><h1>App</h1><section aria-label="Checkout"><h2>  Payment   details </h2><form><button>Pay</button></form></section></main>';
    const button = document.querySelector("button") as Element;

    expect(nearestHeading(button, document)).toEqual({ tag: "h2", text: "Payment details" });
    expect(enclosingLandmark(button)).toEqual({ tag: "form" });
    expect(enclosingLandmark(document.querySelector("h2") as Element)).toEqual({
      tag: "section",
      label: "Checkout",
    });
  });

  it("resolves aria-labelledby landmark labels", () => {
    document.body.innerHTML =
      '<section aria-labelledby="cart-title"><h2 id="cart-title">Your cart</h2><span>3 items</span></section>';
    expect(enclosingLandmark(document.querySelector("span") as Element)).toEqual({
      tag: "section",
      label: "Your cart",
    });
  });

  it("returns undefined when no heading precedes the element", () => {
    document.body.innerHTML = "<p>text</p><h2>Later</h2>";
    expect(nearestHeading(document.querySelector("p") as Element, document)).toBeUndefined();
  });
});

describe("collectComponentHints", () => {
  it("reads React fiber names and dev-build source", () => {
    document.body.innerHTML = "<div><button>Buy</button></div>";
    const button = document.querySelector("button") as Element;
    function BuyButton() {}
    function CheckoutForm() {}
    (button as unknown as Record<string, unknown>).__reactFiber$test = {
      type: "button",
      _debugSource: { fileName: "src/components/CheckoutForm.tsx", lineNumber: 42, columnNumber: 7 },
      return: {
        type: BuyButton,
        return: { type: CheckoutForm, return: null },
      },
    };

    expect(collectComponentHints(button)).toEqual({
      framework: "react",
      components: ["BuyButton", "CheckoutForm"],
      source: { file: "src/components/CheckoutForm.tsx", line: 42, column: 7 },
    });
  });

  it("finds the fiber on an ancestor element", () => {
    document.body.innerHTML = "<div><span>x</span></div>";
    const div = document.querySelector("div") as Element;
    (div as unknown as Record<string, unknown>).__reactFiber$abc = {
      type: function Widget() {},
      return: null,
    };
    expect(collectComponentHints(document.querySelector("span") as Element)).toEqual({
      framework: "react",
      components: ["Widget"],
    });
  });

  it("reads Vue component chains", () => {
    document.body.innerHTML = "<button>x</button>";
    const button = document.querySelector("button") as Element;
    (button as unknown as Record<string, unknown>).__vueParentComponent = {
      type: { __name: "TodoItem", __file: "src/components/TodoItem.vue" },
      parent: { type: { name: "TodoList" }, parent: null },
    };

    expect(collectComponentHints(button)).toEqual({
      framework: "vue",
      components: ["TodoItem", "TodoList"],
      source: { file: "src/components/TodoItem.vue" },
    });
  });

  it("reads Svelte dev metadata", () => {
    document.body.innerHTML = "<button>x</button>";
    const button = document.querySelector("button") as Element;
    (button as unknown as Record<string, unknown>).__svelte_meta = {
      loc: { file: "src/Cart.svelte", line: 12, column: 4 },
    };

    expect(collectComponentHints(button)).toEqual({
      framework: "svelte",
      source: { file: "src/Cart.svelte", line: 12, column: 4 },
    });
  });

  it("returns undefined on plain elements and never throws on hostile shapes", () => {
    document.body.innerHTML = "<button>x</button>";
    const button = document.querySelector("button") as Element;
    expect(collectComponentHints(button)).toBeUndefined();

    Object.defineProperty(button, "__vueParentComponent", {
      get() {
        throw new Error("boom");
      },
    });
    expect(collectComponentHints(button)).toBeUndefined();
  });
});

describe("fitLocatorBudget", () => {
  it("returns the locator untouched when under budget", () => {
    const locator = { tag: "button", selector: "main > button" };
    expect(fitLocatorBudget(locator, 1024)).toBe(locator);
  });

  it("drops fields in priority order until the budget fits", () => {
    const locator: Record<string, unknown> = {
      tag: "button",
      selector: "main > button",
      textSnippet: "Pay",
      outerHtml: "x".repeat(3000),
      attributes: { "data-testid": "y".repeat(500) },
      ancestors: [{ tag: "form" }],
    };
    const fitted = fitLocatorBudget(locator, 500);
    expect(fitted.outerHtml).toBeUndefined();
    expect(fitted.attributes).toBeUndefined();
    expect(fitted.ancestors).toEqual([{ tag: "form" }]);
    expect(fitted.textSnippet).toBe("Pay");
    expect(fitted.selector).toBe("main > button");
  });
});

describe("createCaptureState element targets", () => {
  it("captures rich locator fields in review mode", () => {
    document.body.innerHTML =
      '<main><section aria-label="Demo"><h2>Demo Heading</h2><form><button type="submit" data-testid="pay">Pay now</button></form></section></main>';
    const button = document.querySelector("button") as Element;
    (button as unknown as Record<string, unknown>).__reactFiber$x = {
      type: function PayButton() {},
      return: null,
    };

    const locator = locatorFor(button, { mode: "review" });
    expect(locator.tag).toBe("button");
    expect(locator.ancestors).toEqual([
      { tag: "form" },
      { tag: "section" },
      { tag: "main" },
    ]);
    expect(locator.attributes).toEqual({ type: "submit", "data-testid": "pay" });
    expect(locator.outerHtml).toContain("Pay now");
    expect(locator.nearestHeading).toEqual({ tag: "h2", text: "Demo Heading" });
    expect(locator.landmark).toEqual({ tag: "form" });
    expect(locator.componentHints).toEqual({ framework: "react", components: ["PayButton"] });
  });

  it("omits outerHtml and componentHints by default in feedback mode", () => {
    document.body.innerHTML =
      '<main><h2>Demo</h2><button data-testid="pay">Pay</button></main>';
    const button = document.querySelector("button") as Element;
    (button as unknown as Record<string, unknown>).__reactFiber$x = {
      type: function PayButton() {},
      return: null,
    };

    const locator = locatorFor(button, { mode: "feedback" });
    expect(locator.outerHtml).toBeUndefined();
    expect(locator.componentHints).toBeUndefined();
    expect(locator.ancestors).toEqual([{ tag: "main" }]);
    expect(locator.attributes).toEqual({ "data-testid": "pay" });
    expect(locator.nearestHeading).toEqual({ tag: "h2", text: "Demo" });
  });

  it("honors explicit capture overrides", () => {
    document.body.innerHTML = "<main><button>Pay</button></main>";
    const button = document.querySelector("button") as Element;

    const locator = locatorFor(button, {
      mode: "feedback",
      capture: { outerHtml: true, ancestors: false },
    });
    expect(locator.outerHtml).toContain("Pay");
    expect(locator.ancestors).toBeUndefined();
  });

  it("keeps oversized captures under the server locator cap", () => {
    const blob = "z".repeat(20_000);
    document.body.innerHTML = `<main><button title="${blob}">${blob}</button></main>`;
    const button = document.querySelector("button") as Element;

    const locator = locatorFor(button, { mode: "review" });
    const bytes = new TextEncoder().encode(JSON.stringify(locator)).length;
    expect(bytes).toBeLessThanOrEqual(MAX_LOCATOR_BYTES);
  });
});
