import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  attachMarkable,
  detachMarkable,
  hasMarkable,
  isBalanced,
  MARKABLE_VITE_IMPORT,
} from "./edit-vite-config";

function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");
}

describe("attachMarkable", () => {
  it("inserts the import and plugin into a defineConfig plugins array", () => {
    const before = fixture("define-config-with-plugins.ts");
    const result = attachMarkable(before);

    expect(result.status).toBe("changed");
    expect(result.code).toContain(MARKABLE_VITE_IMPORT);
    expect(result.code).toContain("markable()");
    // existing plugin and its relative order are preserved
    expect(result.code).toContain("react()");
    expect(result.code.indexOf("markable()")).toBeLessThan(result.code.indexOf("react()"));
    expect(isBalanced(result.code)).toBe(true);
  });

  it("preserves indentation for a multiline plugins array", () => {
    const result = attachMarkable(fixture("define-config-multiline-plugins.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("  plugins: [\n    markable(),\n    react(),\n  ],");
    // unrelated config (server.port) is untouched
    expect(result.code).toContain("server: { port: 3000 },");
  });

  it("creates a plugins array when one is missing", () => {
    const result = attachMarkable(fixture("define-config-no-plugins.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("plugins: [markable()]");
    expect(isBalanced(result.code)).toBe(true);
  });

  it("supports a plain object default export", () => {
    const result = attachMarkable(fixture("plain-object.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("markable()");
    expect(result.code).toContain(MARKABLE_VITE_IMPORT);
  });

  it("supports a same-file variable export", () => {
    const result = attachMarkable(fixture("variable-export.ts"));
    expect(result.status).toBe("changed");
    expect(result.code).toContain("markable()");
    expect(result.code).toContain("export default config;");
  });

  it("is idempotent and reports an already-configured file", () => {
    const before = fixture("define-config-with-plugins.ts");
    const once = attachMarkable(before).code;
    const twice = attachMarkable(once);

    expect(twice.status).toBe("already");
    expect(twice.code).toBe(once);
  });

  it("does not modify an already-installed config", () => {
    const before = fixture("already-installed.ts");
    const result = attachMarkable(before);
    expect(result.status).toBe("already");
    expect(result.code).toBe(before);
  });

  it("refuses to edit an async factory config", () => {
    const before = fixture("async-factory.ts");
    const result = attachMarkable(before);
    expect(result.status).toBe("unsupported");
    expect(result.code).toBe(before);
  });

  it("satisfies the equivalence invariant for every supported shape", () => {
    for (const name of [
      "define-config-with-plugins.ts",
      "define-config-multiline-plugins.ts",
      "define-config-no-plugins.ts",
      "plain-object.ts",
      "variable-export.ts",
    ]) {
      const before = fixture(name);
      const result = attachMarkable(before);
      expect(result.status).toBe("changed");
      // detach removes exactly what attach inserted, restoring the original bytes
      expect(detachMarkable(result.code, result.edits)).toBe(before);
    }
  });
});

describe("hasMarkable", () => {
  it("detects both the import and the plugin call", () => {
    const presence = hasMarkable(fixture("already-installed.ts"));
    expect(presence).toEqual({ import: true, plugin: true });
  });

  it("reports absence in a clean config", () => {
    const presence = hasMarkable(fixture("define-config-with-plugins.ts"));
    expect(presence).toEqual({ import: false, plugin: false });
  });
});

describe("isBalanced", () => {
  it("ignores brackets inside strings and comments", () => {
    expect(isBalanced('const a = "{ [ (";\n// ) ] }\n')).toBe(true);
    expect(isBalanced("const a = {")).toBe(false);
  });
});
