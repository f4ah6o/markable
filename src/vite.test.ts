import type { IndexHtmlTransformHook } from "vite";
import { describe, expect, it } from "vitest";
import { markable } from "./vite";

function injectedSource(options: Parameters<typeof markable>[0] = {}): string {
  const plugin = markable(options);
  const transform = plugin.transformIndexHtml as IndexHtmlTransformHook;
  return JSON.stringify(transform("", { path: "/", filename: "index.html" }));
}

describe("markable Vite plugin", () => {
  it("adds Powered by Markable branding by default", () => {
    const source = injectedSource();

    expect(source).toContain("Powered by");
    expect(source).toContain("https://github.com/f4ah6o/markable/");
  });

  it("can opt out of Powered by Markable branding", () => {
    const source = injectedSource({ poweredBy: false });

    expect(source).not.toContain("Powered by");
    expect(source).not.toContain("data-markable-powered-by");
  });

  it("uses English as the default UI locale", () => {
    const source = injectedSource();

    expect(source).toContain('const locale = \\"en\\";');
    expect(source).toContain("Mark this page");
    expect(source).toContain("markableLocale: locale");
  });

  it("supports a Japanese UI locale", () => {
    const source = injectedSource({ locale: "ja" });

    expect(source).toContain('const locale = \\"ja\\";');
    expect(source).toContain("このページをマーク");
    expect(source).toContain("ローカルに記録しました。永続化するにはエンドポイントを設定してください。");
  });
});
