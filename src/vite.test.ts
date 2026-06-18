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
    expect(JSON.stringify(output)).toContain("/@markable/client");
  });
});

describe("markable Vite plugin", () => {
  it("injects a module script that loads the markable client", () => {
    const source = injectedSource();

    expect(source).toContain('"src":"/@markable/client"');
    expect(source).toContain('"type":"module"');
  });

  it("adds Powered by Markable branding by default", () => {
    const plugin = markable();
    const load = plugin.load as unknown as (id: string) => string | null;
    const source = load("/@markable/client") as string;

    expect(source).toContain('"poweredBy":true');
    expect(source).toContain('"locale":"en"');
    expect(source).toContain('"mode":"review"');
  });

  it("can opt out of Powered by Markable branding", () => {
    const plugin = markable({ poweredBy: false });
    const load = plugin.load as unknown as (id: string) => string | null;
    const source = load("/@markable/client") as string;

    expect(source).toContain('"poweredBy":false');
  });

  it("uses English as the default UI locale", () => {
    const plugin = markable();
    const load = plugin.load as unknown as (id: string) => string | null;
    const source = load("/@markable/client") as string;

    expect(source).toContain('"locale":"en"');
    expect(source).toContain("mountMarkable");
  });

  it("supports a Japanese UI locale", () => {
    const plugin = markable({ locale: "ja" });
    const load = plugin.load as unknown as (id: string) => string | null;
    const source = load("/@markable/client") as string;

    expect(source).toContain('"locale":"ja"');
  });
});
