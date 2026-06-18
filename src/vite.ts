import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import type { MarkableConfig, MarkableLocale } from "./config";
import type { MarkableAnnotation, MarkableMode } from "./core";

export type { MarkableLocale };

export interface MarkableViteOptions extends MarkableConfig {}

interface ResolvedOptions {
  endpoint: string;
  commentsFile: string;
  inject: boolean;
  poweredBy: boolean;
  locale: MarkableLocale;
  issueRepo: string | undefined;
  devOnly: boolean;
}

function resolveOptions(options: MarkableConfig): ResolvedOptions {
  return {
    endpoint: options.endpoint ?? "/__markable/comments",
    commentsFile: options.commentsFile ?? ".markable/comments.json",
    inject: options.inject ?? true,
    poweredBy: options.poweredBy ?? true,
    locale: options.locale ?? "en",
    issueRepo: options.issueRepo,
    devOnly: options.devOnly ?? false,
  };
}

export function markable(options: MarkableViteOptions = {}): Plugin {
  // `apply` is read synchronously by Vite before any hook runs, so an inline
  // `devOnly: true` is the only way to fully exclude the plugin from the build
  // graph. When `devOnly` comes from markable.config.ts instead, the hooks are
  // disabled in `configResolved` (see `disabled`) which yields the same result.
  const inlineDevOnly = options.devOnly === true;

  let resolved = resolveOptions(options);
  let resolvedMode: MarkableMode = resolveMode(options.mode, "development");
  let root = process.cwd();
  let disabled = false;

  return {
    name: "markable",
    apply: inlineDevOnly ? "serve" : undefined,

    async configResolved(config) {
      root = config.root;
      const fileConfig = await loadMarkableConfig(config.root);
      const merged: MarkableConfig = { ...fileConfig, ...definedOnly(options) };
      resolved = resolveOptions(merged);
      resolvedMode = resolveMode(merged.mode, config.mode);
      disabled = resolved.devOnly && config.command === "build";
    },

    transformIndexHtml() {
      if (disabled || !resolved.inject) return [];
      return [
        {
          tag: "script",
          children: clientSource(
            resolved.endpoint,
            resolvedMode,
            resolved.poweredBy,
            resolved.locale,
            resolved.issueRepo,
          ),
          injectTo: "body",
        },
      ];
    },

    configureServer(server) {
      if (disabled) return;
      server.middlewares.use(resolved.endpoint, async (req, res) => {
        const file = path.resolve(root, resolved.commentsFile);

        if (req.method === "GET") {
          const annotations = await readAnnotations(file);
          sendJson(res, { annotations });
          return;
        }

        if (req.method === "POST") {
          const body = await readBody(req);
          const incoming = JSON.parse(body) as MarkableAnnotation;
          const annotations = await readAnnotations(file);
          annotations.push(incoming);
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, JSON.stringify({ annotations }, null, 2));
          sendJson(res, { ok: true, annotation: incoming });
          return;
        }

        res.statusCode = 405;
        res.end("Method Not Allowed");
      });
    },

    resolveId(id) {
      if (disabled) return;
      if (id === "/@markable/client") return id;
    },

    load(id) {
      if (disabled || id !== "/@markable/client") return null;
      return clientSource(
        resolved.endpoint,
        resolvedMode,
        resolved.poweredBy,
        resolved.locale,
        resolved.issueRepo,
      );
    },
  };
}

function definedOnly(options: MarkableConfig): MarkableConfig {
  const result: MarkableConfig = {};
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

const MARKABLE_CONFIG_FILES = [
  "markable.config.ts",
  "markable.config.mts",
  "markable.config.mjs",
  "markable.config.js",
  "markable.config.cjs",
  "markable.config.cts",
];

/**
 * Load options from a Markable-owned `markable.config.*` file in the project
 * root. TypeScript configs are bundled with esbuild into a self-contained module
 * (so both bare `@f12o/markable/config` and relative `./foo` imports resolve
 * exactly as they would in the original file) and imported via a data URL. Any
 * failure falls back to defaults rather than breaking the dev server.
 */
export async function loadMarkableConfig(root: string): Promise<MarkableConfig> {
  let file: string | undefined;
  for (const name of MARKABLE_CONFIG_FILES) {
    const candidate = path.join(root, name);
    try {
      await fs.access(candidate);
      file = candidate;
      break;
    } catch {
      // try the next candidate
    }
  }
  if (!file) return {};

  try {
    if (/\.(mjs|js|cjs)$/.test(file)) {
      const mod = await import(pathToFileURL(file).href);
      return (mod.default ?? {}) as MarkableConfig;
    }

    const esbuild = await loadEsbuild();
    const { outputFiles } = await esbuild.build({
      entryPoints: [file],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    const code = outputFiles[0].text;
    const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    const mod = await import(url);
    return (mod.default ?? {}) as MarkableConfig;
  } catch (error) {
    console.warn(
      `markable: failed to load ${path.basename(file)}:`,
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}

interface EsbuildLike {
  build(options: {
    entryPoints: string[];
    bundle: boolean;
    write: boolean;
    format: "esm";
    platform: "node";
    logLevel: "silent";
  }): Promise<{ outputFiles: { text: string }[] }>;
}

/** Resolve esbuild, preferring the copy that ships with Vite. */
async function loadEsbuild(): Promise<EsbuildLike> {
  const require = createRequire(import.meta.url);
  try {
    const viteRequire = createRequire(require.resolve("vite"));
    const url = pathToFileURL(viteRequire.resolve("esbuild")).href;
    return (await import(url)) as EsbuildLike;
  } catch {
    const specifier = "esbuild";
    return (await import(specifier)) as EsbuildLike;
  }
}

function resolveMode(mode: MarkableViteOptions["mode"], viteMode: string): MarkableMode {
  if (mode === "review" || mode === "feedback") return mode;
  return viteMode === "production" ? "feedback" : "review";
}

async function readAnnotations(file: string): Promise<MarkableAnnotation[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { annotations?: MarkableAnnotation[] };
    return parsed.annotations ?? [];
  } catch {
    return [];
  }
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(
  res: NodeJS.WritableStream & {
    setHeader(name: string, value: string): void;
    statusCode?: number;
  },
  value: unknown,
) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

export interface MarkableClientScriptOptions {
  mode: MarkableMode;
  endpoint?: string;
  poweredBy?: boolean;
  locale?: MarkableLocale;
  issueRepo?: string;
}

export function markableClientScript(options: MarkableClientScriptOptions): string {
  return clientSource(
    options.endpoint ?? "/__markable/comments",
    options.mode,
    options.poweredBy ?? true,
    options.locale ?? "en",
    options.issueRepo,
  );
}

function loadBrowserIife(): string {
  const candidates = [
    new URL("./browser.global.js", import.meta.url),
    new URL("../dist/browser.global.js", import.meta.url),
  ];
  for (const url of candidates) {
    try {
      return fsSync.readFileSync(url, "utf8");
    } catch {
      // try the next candidate
    }
  }
  throw new Error(
    "markable: browser IIFE bundle not found. Run `pnpm build` before using the Vite plugin.",
  );
}

function clientSource(
  endpoint: string,
  mode: MarkableMode,
  poweredBy: boolean,
  locale: MarkableLocale,
  issueRepo: string | undefined,
): string {
  const options = {
    endpoint,
    mode,
    poweredBy,
    locale,
    issueRepo,
  };

  const iife = loadBrowserIife();
  return `${iife}\nmarkable.mountMarkable(undefined, ${JSON.stringify(options)});`;
}
