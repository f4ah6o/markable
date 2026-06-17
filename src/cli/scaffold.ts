import type { EditRecord } from "./edit-vite-config";

export type PackageManager = "pnpm" | "yarn" | "npm" | "bun";

export const VITE_CONFIG_FILES = [
  "vite.config.ts",
  "vite.config.mts",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.cts",
  "vite.config.cjs",
];

export const MARKABLE_CONFIG_FILE = "markable.config.ts";
export const GITIGNORE_ENTRY = ".markable/";
export const INSTALL_METADATA_FILE = ".markable/install.json";
export const PACKAGE_NAME = "@f12o/markable";

/** Detect the package manager from lockfiles present in the project root. */
export function detectPackageManager(rootFiles: string[]): PackageManager {
  if (rootFiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (rootFiles.includes("bun.lockb") || rootFiles.includes("bun.lock")) return "bun";
  if (rootFiles.includes("yarn.lock")) return "yarn";
  if (rootFiles.includes("package-lock.json")) return "npm";
  return "npm";
}

export function installCommand(pm: PackageManager): string {
  switch (pm) {
    case "pnpm":
      return "pnpm install";
    case "yarn":
      return "yarn";
    case "bun":
      return "bun install";
    default:
      return "npm install";
  }
}

export interface GitignoreResult {
  changed: boolean;
  content: string;
}

export function ensureGitignoreEntry(
  content: string,
  entry: string = GITIGNORE_ENTRY,
): GitignoreResult {
  const bare = entry.replace(/\/$/, "");
  const lines = content.split(/\r?\n/);
  if (lines.some((line) => line.trim() === entry || line.trim() === bare)) {
    return { changed: false, content };
  }
  const prefix = content.length === 0 || content.endsWith("\n") ? "" : "\n";
  return { changed: true, content: `${content}${prefix}${entry}\n` };
}

export interface PackageJsonResult {
  changed: boolean;
  pkg: Record<string, unknown>;
}

export function ensureDevDependency(
  pkg: Record<string, unknown>,
  name: string,
  version: string,
): PackageJsonResult {
  const dev = (pkg.devDependencies as Record<string, string> | undefined) ?? {};
  if (dev[name]) return { changed: false, pkg };
  const updated: Record<string, unknown> = {
    ...pkg,
    devDependencies: sortKeys({ ...dev, [name]: version }),
  };
  return { changed: true, pkg: updated };
}

function sortKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

export function markableConfigTemplate(): string {
  return `import { defineMarkableConfig } from "${PACKAGE_NAME}/config";

export default defineMarkableConfig({
  devOnly: true,
  mode: "review",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
`;
}

export interface InstallMetadata {
  version: number;
  viteConfig: string;
  binding: string;
  beforeHash: string;
  afterHash: string;
  edits: EditRecord[];
}

export function manualSnippet(): string {
  return [
    'import { markable } from "@f12o/markable/vite";',
    "",
    "export default defineConfig({",
    "  plugins: [",
    "    markable(),",
    "    // ...existing plugins",
    "  ],",
    "});",
  ].join("\n");
}
