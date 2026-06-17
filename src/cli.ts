#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  attachMarkable,
  detachMarkable,
  hasMarkable,
  type EditRecord,
} from "./cli/edit-vite-config";
import {
  ensureDevDependency,
  ensureGitignoreEntry,
  detectPackageManager,
  installCommand,
  manualSnippet,
  markableConfigTemplate,
  GITIGNORE_ENTRY,
  INSTALL_METADATA_FILE,
  MARKABLE_CONFIG_FILE,
  MARKABLE_CONFIG_FILES,
  PACKAGE_NAME,
  VITE_CONFIG_FILES,
  type InstallMetadata,
  type PackageManager,
} from "./cli/scaffold";

const HELP = `markable - dev-only annotation layer for Vite projects

Usage:
  markable init      Configure Markable for development-only use in this project
  markable doctor    Report the current Markable integration status
  markable remove    Remove the CLI-owned Markable integration

Options:
  --cwd <dir>        Run against another directory (default: current directory)
  -h, --help         Show this help
  -v, --version      Show the CLI version
`;

interface Cli {
  log: (message?: string) => void;
  error: (message?: string) => void;
}

const cli: Cli = {
  log: (message = "") => process.stdout.write(`${message}\n`),
  error: (message = "") => process.stderr.write(`${message}\n`),
};

async function main(argv: string[]): Promise<number> {
  const args = argv.slice(2);
  const cwdFlag = takeFlag(args, "--cwd");
  const root = path.resolve(cwdFlag ?? process.cwd());
  const command = args.find((arg) => !arg.startsWith("-"));

  if (args.includes("-h") || args.includes("--help") || command === "help") {
    cli.log(HELP);
    return 0;
  }
  if (args.includes("-v") || args.includes("--version")) {
    cli.log(await readVersion());
    return 0;
  }

  switch (command) {
    case undefined:
      cli.log(HELP);
      return 0;
    case "init":
      return runInit(root);
    case "doctor":
      return runDoctor(root);
    case "remove":
      return runRemove(root);
    default:
      cli.error(`Unknown command: ${command}\n`);
      cli.log(HELP);
      return 1;
  }
}

function takeFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1) return undefined;
  const value = args[idx + 1];
  args.splice(idx, value !== undefined ? 2 : 1);
  return value;
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function readVersion(): Promise<string> {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.resolve(here, "../package.json");
    const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

async function depVersion(): Promise<string> {
  const version = await readVersion();
  return version === "0.0.0" ? "latest" : `^${version}`;
}

async function listRootFiles(root: string): Promise<string[]> {
  try {
    return await fs.readdir(root);
  } catch {
    return [];
  }
}

async function detectViteConfig(root: string): Promise<string | undefined> {
  for (const name of VITE_CONFIG_FILES) {
    if (await exists(path.join(root, name))) return name;
  }
  return undefined;
}

async function detectMarkableConfig(root: string): Promise<string | undefined> {
  for (const name of MARKABLE_CONFIG_FILES) {
    if (await exists(path.join(root, name))) return name;
  }
  return undefined;
}

function hashOf(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Atomic write: stage to a sibling temp file, then rename into place. */
async function writeFileAtomic(file: string, content: string): Promise<void> {
  const tmp = `${file}.markable-${process.pid}.tmp`;
  await fs.writeFile(tmp, content);
  await fs.rename(tmp, file);
}

async function runInit(root: string): Promise<number> {
  const pkgPath = path.join(root, "package.json");
  if (!(await exists(pkgPath))) {
    cli.error(`No package.json found in ${root}. Run \`markable init\` from a project root.`);
    return 1;
  }

  const rootFiles = await listRootFiles(root);
  const pm = detectPackageManager(rootFiles);
  const summary: string[] = [];
  // Preserve any previously recorded ownership info across re-runs.
  const metadata: InstallMetadata = {
    version: 1,
    binding: "markable",
    ...(await readInstallMetadata(root)),
  };

  // 1. devDependency
  const pkgRaw = await fs.readFile(pkgPath, "utf8");
  const pkg = JSON.parse(pkgRaw) as Record<string, unknown>;
  const dep = ensureDevDependency(pkg, PACKAGE_NAME, await depVersion());
  if (dep.changed) {
    await writeFileAtomic(pkgPath, `${JSON.stringify(dep.pkg, null, 2)}\n`);
    summary.push(`added ${PACKAGE_NAME} to devDependencies`);
  } else {
    summary.push(`${PACKAGE_NAME} already a devDependency`);
  }

  // 2. markable.config.* (only the file we create is recorded as CLI-owned)
  const existingConfig = await detectMarkableConfig(root);
  if (existingConfig) {
    summary.push(`${existingConfig} already present`);
  } else {
    const template = markableConfigTemplate();
    await writeFileAtomic(path.join(root, MARKABLE_CONFIG_FILE), template);
    metadata.markableConfig = MARKABLE_CONFIG_FILE;
    metadata.markableConfigHash = hashOf(template);
    summary.push(`created ${MARKABLE_CONFIG_FILE}`);
  }

  // 3. vite.config.* plugin wiring
  const viteConfig = await detectViteConfig(root);
  let viteHandled = true;
  if (!viteConfig) {
    cli.error("No vite.config.{ts,js,mts,mjs} found. Add the plugin manually:\n");
    cli.error(manualSnippet());
    cli.error("");
    viteHandled = false;
  } else {
    const vitePath = path.join(root, viteConfig);
    const before = await fs.readFile(vitePath, "utf8");
    const result = await attachMarkable(before);
    if (result.status === "already") {
      summary.push(`${viteConfig} already wires up markable()`);
    } else if (result.status === "changed") {
      await writeFileAtomic(vitePath, result.code);
      metadata.viteConfig = viteConfig;
      metadata.beforeHash = hashOf(before);
      metadata.afterHash = hashOf(result.code);
      metadata.edits = result.edits;
      summary.push(`added markable() to ${viteConfig}`);
    } else {
      viteHandled = false;
      cli.error(
        `Could not safely edit ${viteConfig} (${result.reason}). Add the plugin manually:\n`,
      );
      cli.error(manualSnippet());
      cli.error("");
    }
  }

  if (metadata.viteConfig || metadata.markableConfig) {
    await writeInstallMetadata(root, metadata);
  }

  // 4. .gitignore
  const gitignorePath = path.join(root, ".gitignore");
  const gitignore = (await exists(gitignorePath))
    ? await fs.readFile(gitignorePath, "utf8")
    : "";
  const ignore = ensureGitignoreEntry(gitignore);
  if (ignore.changed) {
    await writeFileAtomic(gitignorePath, ignore.content);
    summary.push(`added ${GITIGNORE_ENTRY} to .gitignore`);
  } else {
    summary.push(`.gitignore already ignores ${GITIGNORE_ENTRY}`);
  }

  cli.log("Markable init:");
  for (const line of summary) cli.log(`  - ${line}`);
  cli.log("");
  if (dep.changed) {
    cli.log(`Next: install dependencies with \`${installCommand(pm)}\`, then run your dev server.`);
  } else {
    cli.log("Markable runs under your Vite dev server and is excluded from `vite build`.");
  }
  return viteHandled ? 0 : 1;
}

async function writeInstallMetadata(root: string, metadata: InstallMetadata): Promise<void> {
  const file = path.join(root, INSTALL_METADATA_FILE);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await writeFileAtomic(file, `${JSON.stringify(metadata, null, 2)}\n`);
}

async function readInstallMetadata(root: string): Promise<InstallMetadata | undefined> {
  try {
    const raw = await fs.readFile(path.join(root, INSTALL_METADATA_FILE), "utf8");
    return JSON.parse(raw) as InstallMetadata;
  } catch {
    return undefined;
  }
}

async function runDoctor(root: string): Promise<number> {
  const pkgPath = path.join(root, "package.json");
  const pkg = (await exists(pkgPath))
    ? (JSON.parse(await fs.readFile(pkgPath, "utf8")) as Record<string, unknown>)
    : undefined;
  const dev = (pkg?.devDependencies as Record<string, string> | undefined) ?? {};
  const hasDep = Boolean(dev[PACKAGE_NAME]);

  const viteConfig = await detectViteConfig(root);
  let wired = false;
  if (viteConfig) {
    const source = await fs.readFile(path.join(root, viteConfig), "utf8");
    const presence = await hasMarkable(source);
    wired = presence.import && presence.plugin;
  }

  const markableConfig = await detectMarkableConfig(root);
  const hasConfig = Boolean(markableConfig);
  const gitignore = (await exists(path.join(root, ".gitignore")))
    ? await fs.readFile(path.join(root, ".gitignore"), "utf8")
    : "";
  const ignored = !ensureGitignoreEntry(gitignore).changed;

  const metadata = await readInstallMetadata(root);
  const tracksVite = Boolean(metadata?.afterHash && metadata.viteConfig === viteConfig);
  let drift = false;
  if (metadata && tracksVite && viteConfig) {
    const current = await fs.readFile(path.join(root, viteConfig), "utf8");
    drift = hashOf(current) !== metadata.afterHash;
  }

  const check = (ok: boolean) => (ok ? "✓" : "✗");
  cli.log("Markable doctor:");
  cli.log(`  ${check(hasDep)} ${PACKAGE_NAME} in devDependencies`);
  cli.log(`  ${check(Boolean(viteConfig))} Vite config detected${viteConfig ? ` (${viteConfig})` : ""}`);
  cli.log(`  ${check(wired)} markable() wired into the Vite config`);
  cli.log(`  ${check(hasConfig)} ${markableConfig ?? MARKABLE_CONFIG_FILE} present`);
  cli.log(`  ${check(ignored)} ${GITIGNORE_ENTRY} ignored by git`);
  if (tracksVite) {
    cli.log(`  ${check(!drift)} Vite config matches CLI-owned edits`);
  }

  const healthy = hasDep && Boolean(viteConfig) && wired && hasConfig && ignored && !drift;
  return healthy ? 0 : 1;
}

async function runRemove(root: string): Promise<number> {
  const metadata = await readInstallMetadata(root);
  if (!metadata) {
    cli.error("No .markable/install.json found; nothing to remove automatically.");
    return 1;
  }

  // 1. Revert the Vite config (only while it matches what the CLI wrote).
  if (metadata.viteConfig && metadata.edits && metadata.afterHash && metadata.beforeHash) {
    const vitePath = path.join(root, metadata.viteConfig);
    if (!(await exists(vitePath))) {
      cli.error(`${metadata.viteConfig} no longer exists; skipping Vite config edit.`);
    } else {
      const current = await fs.readFile(vitePath, "utf8");
      if (hashOf(current) !== metadata.afterHash) {
        cli.error(
          `${metadata.viteConfig} has changed since \`markable init\`. ` +
            "Remove the markable() plugin and its import manually.",
        );
        return 1;
      }
      const reverted = detachMarkable(current, metadata.edits);
      if (hashOf(reverted) !== metadata.beforeHash) {
        cli.error(
          `Could not cleanly revert ${metadata.viteConfig}. Remove the markable() plugin manually.`,
        );
        return 1;
      }
      await writeFileAtomic(vitePath, reverted);
      cli.log(`Removed markable() from ${metadata.viteConfig}`);
    }
  }

  // 2. Remove markable.config only if it is unchanged since the CLI wrote it.
  if (metadata.markableConfig) {
    const configPath = path.join(root, metadata.markableConfig);
    if (await exists(configPath)) {
      const current = await fs.readFile(configPath, "utf8");
      if (metadata.markableConfigHash && hashOf(current) === metadata.markableConfigHash) {
        await fs.rm(configPath, { force: true });
        cli.log(`Removed ${metadata.markableConfig}`);
      } else {
        cli.error(
          `${metadata.markableConfig} has changed since \`markable init\`; leaving it in place.`,
        );
      }
    }
  }

  await fs.rm(path.join(root, INSTALL_METADATA_FILE), { force: true });

  cli.log("");
  cli.log(`You can still remove ${PACKAGE_NAME} from devDependencies and ${GITIGNORE_ENTRY} from .gitignore if desired.`);
  return 0;
}

main(process.argv)
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    cli.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
