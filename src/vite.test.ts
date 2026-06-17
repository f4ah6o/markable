import type { IndexHtmlTransformHook, ResolvedConfig } from "vite";
import { describe, expect, it } from "vitest";
import { markable } from "./vite";

function injectedSource(options: Parameters<typeof markable>[0] = {}): string {
  const plugin = markable(options);
  const transform = plugin.transformIndexHtml as IndexHtmlTransformHook;
  return JSON.stringify(transform("", { path: "/", filename: "index.html" }));
}

async function runConfigResolved(
  plugin: ReturnType<typeof markable>,
  config: Pick<ResolvedConfig, "root" | "mode" | "command">,
): Promise<void> {
  const hook = plugin.configResolved;
  const fn = typeof hook === "function" ? hook : hook?.handler;
  await fn?.(config as ResolvedConfig);
}

describe("markable devOnly option", () => {
  it("applies the plugin only to the dev server when devOnly is set inline", () => {
    expect(markable({ devOnly: true }).apply).toBe("serve");
  });

  it("leaves apply undefined by default", () => {
    expect(markable().apply).toBeUndefined();
  });

  it("does not inject anything during vite build when devOnly is active", async () => {
    const plugin = markable({ devOnly: true });
    await runConfigResolved(plugin, {
      root: process.cwd(),
      mode: "production",
      command: "build",
    });
    const transform = plugin.transformIndexHtml as IndexHtmlTransformHook;
    expect(transform("", { path: "/", filename: "index.html" })).toEqual([]);
  });

  it("still injects during the dev server when devOnly is active", async () => {
    const plugin = markable({ devOnly: true });
    await runConfigResolved(plugin, {
      root: process.cwd(),
      mode: "development",
      command: "serve",
    });
    const transform = plugin.transformIndexHtml as IndexHtmlTransformHook;
    const output = transform("", { path: "/", filename: "index.html" });
    expect(JSON.stringify(output)).toContain("Mark this page");
  });
});

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
