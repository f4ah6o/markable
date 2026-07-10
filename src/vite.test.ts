import type { IndexHtmlTransformHook, ResolvedConfig } from "vite";
import { describe, expect, it } from "vitest";
import { markable, markableClientScript } from "./vite";

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
    expect(JSON.stringify(output)).toContain("markable.mountMarkable");
  });
});

describe("markable Vite plugin", () => {
  it("injects a self-contained script that mounts markable", () => {
    const source = injectedSource();

    expect(source).toContain('"tag":"script"');
    expect(source).toContain("markable.mountMarkable");
  });

  it("adds Powered by Markable branding by default", () => {
    const source = markableClientScript({ mode: "review" });

    expect(source).toContain('"poweredBy":true');
    expect(source).toContain('"locale":"en"');
    expect(source).toContain('"mode":"review"');
  });

  it("can opt out of Powered by Markable branding", () => {
    const source = markableClientScript({ mode: "review", poweredBy: false });

    expect(source).toContain('"poweredBy":false');
  });

  it("uses English as the default UI locale", () => {
    const source = markableClientScript({ mode: "review" });

    expect(source).toContain('"locale":"en"');
    expect(source).toContain("markable.mountMarkable");
  });

  it("supports a Japanese UI locale", () => {
    const source = markableClientScript({ mode: "review", locale: "ja" });

    expect(source).toContain('"locale":"ja"');
  });

  it("serializes capture options into the injected script", () => {
    const source = injectedSource({ capture: { outerHtml: false, componentHints: true } });

    expect(source).toContain('\\"capture\\":{\\"outerHtml\\":false,\\"componentHints\\":true}');
  });

  it("omits capture options when unset", () => {
    expect(markableClientScript({ mode: "review" })).not.toContain('"capture"');
  });

  it("serializes the issueRepo shorthand into the injected script", () => {
    const source = markableClientScript({ mode: "review", issueRepo: "f4ah6o/markable" });

    expect(source).toContain('"issueRepo":"f4ah6o/markable"');
  });

  it("serializes a generic issueTarget into the injected script", () => {
    const source = markableClientScript({
      mode: "review",
      issueTarget: { url: "https://example.com/new", titleParam: "summary" },
    });

    expect(source).toContain('"issueTarget":{"url":"https://example.com/new","titleParam":"summary"}');
  });
});
