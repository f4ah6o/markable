import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import { normalizeAnnotation } from "./annotations";
import type {
  MarkableCaptureOptions,
  MarkableConfig,
  MarkableIssueTarget,
  MarkableLocale,
} from "./config";
import type { MarkableAnnotation, MarkableMode } from "./core";

export type { MarkableIssueTarget, MarkableLocale };
export { normalizeAnnotation } from "./annotations";

/** Upper bound for a single POSTed annotation payload. */
const MAX_BODY_BYTES = 256 * 1024;

export interface MarkableViteOptions extends MarkableConfig {}

interface ResolvedOptions {
  endpoint: string;
  commentsFile: string;
  inject: boolean;
  poweredBy: boolean;
  locale: MarkableLocale;
  issueRepo: string | undefined;
  issueTarget: MarkableIssueTarget | undefined;
  devOnly: boolean;
  capture: MarkableCaptureOptions | undefined;
}

function resolveOptions(options: MarkableConfig): ResolvedOptions {
  return {
    endpoint: options.endpoint ?? "/__markable/comments",
    commentsFile: options.commentsFile ?? ".markable/comments.json",
    inject: options.inject ?? true,
    poweredBy: options.poweredBy ?? true,
    locale: options.locale ?? "en",
    issueRepo: options.issueRepo,
    issueTarget: options.issueTarget,
    devOnly: options.devOnly ?? false,
    capture: options.capture,
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
            resolved.issueTarget,
            resolved.capture,
          ),
          injectTo: "body",
        },
      ];
    },

    configureServer(server) {
      if (disabled) return;

      // Serialize read-modify-write cycles so concurrent POSTs cannot drop
      // each other's annotations.
      let writeQueue: Promise<unknown> = Promise.resolve();
      const enqueueWrite = <T>(task: () => Promise<T>): Promise<T> => {
        const next = writeQueue.then(task, task);
        writeQueue = next.catch(() => undefined);
        return next;
      };

      const handleRequest = async (
        req: MiddlewareRequest,
        res: MiddlewareResponse,
      ): Promise<void> => {
        const file = path.resolve(root, resolved.commentsFile);
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("X-Content-Type-Options", "nosniff");

        if (req.method === "GET") {
          const annotations = await readAnnotations(file);
          sendJson(res, 200, { annotations });
          return;
        }

        if (req.method === "POST") {
          const contentType = String(req.headers?.["content-type"] ?? "");
          if (!contentType.toLowerCase().includes("application/json")) {
            sendJson(res, 415, { ok: false, error: "Content-Type must be application/json" });
            return;
          }

          let body: string;
          try {
            body = await readBody(req, MAX_BODY_BYTES);
          } catch (error) {
            if (error instanceof PayloadTooLargeError) {
              sendJson(res, 413, { ok: false, error: "annotation payload too large" });
              return;
            }
            throw error;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            sendJson(res, 400, { ok: false, error: "request body is not valid JSON" });
            return;
          }

          const result = normalizeAnnotation(parsed);
          if (!result.ok) {
            sendJson(res, 422, { ok: false, error: result.error });
            return;
          }

          const annotation = result.annotation;
          await enqueueWrite(async () => {
            const annotations = await readAnnotations(file);
            // Ignore retried submissions that already made it to disk.
            if (!annotations.some((existing) => existing.id === annotation.id)) {
              annotations.push(annotation);
              await writeAnnotations(file, annotations);
            }
          });
          sendJson(res, 200, { ok: true, annotation });
          return;
        }

        res.statusCode = 405;
        res.setHeader("Allow", "GET, POST");
        res.end("Method Not Allowed");
      };

      server.middlewares.use(resolved.endpoint, (req, res, next) => {
        // Connect strips the mount prefix, so only the endpoint itself (with
        // or without a query string) is handled here; sub-paths fall through.
        const pathname = (req.url ?? "/").split("?", 1)[0];
        if (pathname !== "/" && pathname !== "") {
          next();
          return;
        }

        handleRequest(req as MiddlewareRequest, res as MiddlewareResponse).catch((error) => {
          server.config.logger.error(
            `markable: comments endpoint failed: ${error instanceof Error ? error.message : error}`,
          );
          if (!res.writableEnded) {
            sendJson(res as MiddlewareResponse, 500, { ok: false, error: "internal error" });
          }
        });
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
        resolved.issueTarget,
        resolved.capture,
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

interface MiddlewareRequest extends NodeJS.ReadableStream {
  method?: string;
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
  destroy?(error?: Error): void;
}

interface MiddlewareResponse extends NodeJS.WritableStream {
  setHeader(name: string, value: string): void;
  statusCode?: number;
  writableEnded?: boolean;
}

async function readAnnotations(file: string): Promise<MarkableAnnotation[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { annotations?: MarkableAnnotation[] };
    return Array.isArray(parsed.annotations) ? parsed.annotations : [];
  } catch {
    return [];
  }
}

/**
 * Persist annotations with a write-to-temp-then-rename cycle so a crash or a
 * concurrent reader never observes a truncated comments file.
 */
async function writeAnnotations(file: string, annotations: MarkableAnnotation[]): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmp, JSON.stringify({ annotations }, null, 2));
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
    throw error;
  }
}

class PayloadTooLargeError extends Error {
  constructor() {
    super("payload too large");
    this.name = "PayloadTooLargeError";
  }
}

function readBody(req: MiddlewareRequest, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;

    req.on("data", (chunk: Buffer | string) => {
      if (done) return;
      const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      size += buffer.length;
      if (size > limit) {
        done = true;
        reject(new PayloadTooLargeError());
        req.destroy?.();
        return;
      }
      chunks.push(buffer);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (error) => {
      if (done) return;
      done = true;
      reject(error);
    });
  });
}

function sendJson(res: MiddlewareResponse, statusCode: number, value: unknown) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

export interface MarkableClientScriptOptions {
  mode: MarkableMode;
  endpoint?: string;
  poweredBy?: boolean;
  locale?: MarkableLocale;
  issueRepo?: string;
  issueTarget?: MarkableIssueTarget;
  capture?: MarkableCaptureOptions;
}

export function markableClientScript(options: MarkableClientScriptOptions): string {
  return clientSource(
    options.endpoint ?? "/__markable/comments",
    options.mode,
    options.poweredBy ?? true,
    options.locale ?? "en",
    options.issueRepo,
    options.issueTarget,
    options.capture,
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
  issueTarget: MarkableIssueTarget | undefined,
  capture: MarkableCaptureOptions | undefined,
): string {
  const options = {
    endpoint,
    mode,
    poweredBy,
    locale,
    issueRepo,
    issueTarget,
    capture,
  };

  const iife = loadBrowserIife();
  return `${iife}\nmarkable.mountMarkable(undefined, ${JSON.stringify(options)});`;
}
