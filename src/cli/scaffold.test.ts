import { describe, expect, it } from "vitest";
import {
  detectPackageManager,
  ensureDevDependency,
  ensureGitignoreEntry,
  installCommand,
  markableConfigTemplate,
  GITIGNORE_ENTRY,
  PACKAGE_NAME,
} from "./scaffold";

describe("detectPackageManager", () => {
  it("prefers pnpm, then bun, yarn, npm", () => {
    expect(detectPackageManager(["pnpm-lock.yaml", "package-lock.json"])).toBe("pnpm");
    expect(detectPackageManager(["bun.lockb"])).toBe("bun");
    expect(detectPackageManager(["yarn.lock"])).toBe("yarn");
    expect(detectPackageManager(["package-lock.json"])).toBe("npm");
    expect(detectPackageManager([])).toBe("npm");
  });

  it("maps to an install command", () => {
    expect(installCommand("pnpm")).toBe("pnpm install");
    expect(installCommand("yarn")).toBe("yarn");
  });
});

describe("ensureGitignoreEntry", () => {
  it("appends the entry to a file without a trailing newline", () => {
    const result = ensureGitignoreEntry("node_modules");
    expect(result.changed).toBe(true);
    expect(result.content).toBe(`node_modules\n${GITIGNORE_ENTRY}\n`);
  });

  it("is idempotent when the entry already exists", () => {
    const content = `node_modules\n${GITIGNORE_ENTRY}\n`;
    const result = ensureGitignoreEntry(content);
    expect(result.changed).toBe(false);
    expect(result.content).toBe(content);
  });

  it("treats an entry without a trailing slash as present", () => {
    const result = ensureGitignoreEntry(".markable\n");
    expect(result.changed).toBe(false);
  });

  it("creates content for an empty file", () => {
    const result = ensureGitignoreEntry("");
    expect(result.changed).toBe(true);
    expect(result.content).toBe(`${GITIGNORE_ENTRY}\n`);
  });
});

describe("ensureDevDependency", () => {
  it("adds the package when missing", () => {
    const result = ensureDevDependency({ name: "demo" }, PACKAGE_NAME, "^1.0.0");
    expect(result.changed).toBe(true);
    expect((result.pkg.devDependencies as Record<string, string>)[PACKAGE_NAME]).toBe("^1.0.0");
  });

  it("is idempotent when already present", () => {
    const pkg = { devDependencies: { [PACKAGE_NAME]: "^1.0.0" } };
    const result = ensureDevDependency(pkg, PACKAGE_NAME, "^2.0.0");
    expect(result.changed).toBe(false);
    expect(result.pkg).toBe(pkg);
  });

  it("appends without reordering existing entries", () => {
    const result = ensureDevDependency({ devDependencies: { zod: "^3.0.0" } }, PACKAGE_NAME, "^1.0.0");
    expect(Object.keys(result.pkg.devDependencies as Record<string, string>)).toEqual([
      "zod",
      PACKAGE_NAME,
    ]);
  });
});

describe("markableConfigTemplate", () => {
  it("references the config helper and dev-only mode", () => {
    const template = markableConfigTemplate();
    expect(template).toContain('from "@f12o/markable/config"');
    expect(template).toContain("devOnly: true");
    expect(template).toContain('mode: "review"');
  });
});
