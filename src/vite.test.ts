import type { IndexHtmlTransformHook } from "vite";
import { describe, expect, it } from "vitest";
import { markable } from "./vite";

describe("markable Vite plugin", () => {
  it("adds Powered by Markable branding by default", () => {
    const plugin = markable();
    const transform = plugin.transformIndexHtml as IndexHtmlTransformHook;
    const tags = transform("", { path: "/", filename: "index.html" });

    expect(JSON.stringify(tags)).toContain("Powered by");
    expect(JSON.stringify(tags)).toContain("https://github.com/f4ah6o/markable/");
  });

  it("can opt out of Powered by Markable branding", () => {
    const plugin = markable({ poweredBy: false });
    const transform = plugin.transformIndexHtml as IndexHtmlTransformHook;
    const tags = transform("", { path: "/", filename: "index.html" });

    expect(JSON.stringify(tags)).not.toContain("Powered by");
    expect(JSON.stringify(tags)).not.toContain("data-markable-powered-by");
  });
});
