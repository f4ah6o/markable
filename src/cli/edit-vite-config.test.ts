import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attachMarkable,
  detachMarkable,
  hasMarkable,
  MARKABLE_VITE_IMPORT,
} from "./edit-vite-config";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

describe("attachMarkable", () => {
  it("inserts the import and plugin into a defineConfig plugins array", async () => {
    const before = fixture("define-config-with-plugins.ts");
    const result = await attachMarkable(before);

    expect(result.status).toBe("changed");
    expect(result.code).toContain(MARKABLE_VITE_IMPORT);
    expect(result.code).toContain("markable()");
    // existing plugin and its relative order are preserved
    expect(result.code).toContain("react()");
    expect(result.code.indexOf("markable()")).toBeLessThan(result.code.indexOf("react()"));
  });

  it("preserves indentation for a multiline plugins array", async () => {
    const result = await attachMarkable(fixture("define-config-multiline-plugins.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("  plugins: [\n    markable(),\n    react(),\n  ],");
    // unrelated config (server.port) is untouched
    expect(result.code).toContain("server: { port: 3000 },");
  });

  it("creates a plugins array when one is missing", async () => {
    const result = await attachMarkable(fixture("define-config-no-plugins.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("plugins: [markable()]");
  });

  it("supports a plain object default export", async () => {
    const result = await attachMarkable(fixture("plain-object.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("markable()");
    expect(result.code).toContain(MARKABLE_VITE_IMPORT);
  });

  it("supports a same-file variable export", async () => {
    const result = await attachMarkable(fixture("variable-export.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("markable()");
    expect(result.code).toContain("export default config;");
  });

  it("is not fooled by regex literals containing brackets", async () => {
    const before = [
      'import { defineConfig } from "vite";',
      "",
      "export default defineConfig({",
      "  define: { RE: /[{(]/g },",
      "  plugins: [],",
      "});",
      "",
    ].join("\n");
    const result = await attachMarkable(before);
    expect(result.status).toBe("changed");
    expect(result.code).toContain("plugins: [markable()]");
    expect(result.code).toContain("RE: /[{(]/g");
    expect(detachMarkable(result.code, result.edits)).toBe(before);
  });

  it("is idempotent and reports an already-configured file", async () => {
    const before = fixture("define-config-with-plugins.ts");
    const once = (await attachMarkable(before)).code;
    const twice = await attachMarkable(once);

    expect(twice.status).toBe("already");
    expect(twice.code).toBe(once);
  });

  it("does not modify an already-installed config", async () => {
    const before = fixture("already-installed.ts");
    const result = await attachMarkable(before);
    expect(result.status).toBe("already");
    expect(result.code).toBe(before);
  });

  it("refuses to edit an async factory config", async () => {
    const before = fixture("async-factory.ts");
    const result = await attachMarkable(before);
    expect(result.status).toBe("unsupported");
    expect(result.code).toBe(before);
  });

  it("refuses to edit a config with syntax errors", async () => {
    const before = "export default defineConfig({ plugins: [react()  });\n";
    const result = await attachMarkable(before);
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("parse-error");
  });

  it("satisfies the equivalence invariant for every supported shape", async () => {
    for (const name of [
      "define-config-with-plugins.ts",
      "define-config-multiline-plugins.ts",
      "define-config-no-plugins.ts",
      "plain-object.ts",
      "variable-export.ts",
    ]) {
      const before = fixture(name);
      const result = await attachMarkable(before);
      expect(result.status).toBe("changed");
      // detach removes exactly what attach inserted, restoring the original bytes
      expect(detachMarkable(result.code, result.edits)).toBe(before);
    }
  });
});

describe("hasMarkable", () => {
  it("detects both the import and the plugin call", async () => {
    const presence = await hasMarkable(fixture("already-installed.ts"));
    expect(presence).toEqual({ import: true, plugin: true });
  });

  it("reports absence in a clean config", async () => {
    const presence = await hasMarkable(fixture("define-config-with-plugins.ts"));
    expect(presence).toEqual({ import: false, plugin: false });
  });

  it("ignores a markable() call outside the plugins array", async () => {
    const code = [
      "const markable = () => ({});",
      "const shared = markable();",
      "export default defineConfig({ plugins: [react()] });",
    ].join("\n");
    const presence = await hasMarkable(code);
    expect(presence.plugin).toBe(false);
    // ...and attach adds it into the plugins array
    const result = await attachMarkable(code);
    expect(result.status).toBe("changed");
    expect(result.code).toContain("plugins: [markable(), react()]");
  });
});
