import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { ResolvedConfig, ViteDevServer } from "vite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { MarkableAnnotation } from "./core";
import { markable } from "./vite";

type MiddlewareHandler = (req: unknown, res: unknown, next: () => void) => void;

interface FakeResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  writableEnded: boolean;
  setHeader(name: string, value: string): void;
  end(chunk?: string): void;
  finished: Promise<void>;
}

function createFakeResponse(): FakeResponse {
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });

  const res: FakeResponse = {
    statusCode: 200,
    headers: {},
    body: "",
    writableEnded: false,
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
    },
    end(chunk?: string) {
      if (chunk) res.body += chunk;
      res.writableEnded = true;
      resolveFinished();
    },
    finished,
  };
  return res;
}

function createFakeRequest(options: {
  method: string;
  url?: string;
  headers?: Record<string, string>;
  body?: string;
}) {
  const stream = Readable.from(options.body === undefined ? [] : [Buffer.from(options.body)]);
  return Object.assign(stream, {
    method: options.method,
    url: options.url ?? "/",
    headers: options.headers ?? {},
  });
}

async function setupMiddleware(root: string): Promise<MiddlewareHandler> {
  const plugin = markable();

  const configResolved = plugin.configResolved;
  const configResolvedFn =
    typeof configResolved === "function" ? configResolved : configResolved?.handler;
  await configResolvedFn?.({ root, mode: "development", command: "serve" } as ResolvedConfig);

  let handler: MiddlewareHandler | undefined;
  const server = {
    middlewares: {
      use(_path: string, fn: MiddlewareHandler) {
        handler = fn;
      },
    },
    config: { logger: { error() {} } },
  } as unknown as ViteDevServer;

  const configureServer = plugin.configureServer;
  const configureServerFn =
    typeof configureServer === "function" ? configureServer : configureServer?.handler;
  await configureServerFn?.(server);

  if (!handler) throw new Error("middleware was not registered");
  return handler;
}

async function dispatch(
  handler: MiddlewareHandler,
  request: ReturnType<typeof createFakeRequest>,
): Promise<FakeResponse> {
  const res = createFakeResponse();
  handler(request, res, () => {
    res.end();
  });
  await res.finished;
  return res;
}

function postAnnotation(body: unknown, headers?: Record<string, string>) {
  return createFakeRequest({
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const annotationInput = (overrides: Record<string, unknown> = {}) => ({
  id: "mark-test-1",
  mode: "review",
  message: "Middleware test annotation",
  status: "open",
  target: { kind: "dom_range", locator: { url: "http://localhost/" } },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  ...overrides,
});

describe("markable comments endpoint", () => {
  let root: string;
  let handler: MiddlewareHandler;
  const commentsFile = () => path.join(root, ".markable", "comments.json");

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "markable-middleware-"));
    handler = await setupMiddleware(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  async function readPersisted(): Promise<MarkableAnnotation[]> {
    const raw = await fs.readFile(commentsFile(), "utf8");
    return (JSON.parse(raw) as { annotations: MarkableAnnotation[] }).annotations;
  }

  it("persists a valid annotation and responds with it", async () => {
    const res = await dispatch(handler, postAnnotation(annotationInput()));

    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    const payload = JSON.parse(res.body) as { ok: boolean; annotation: MarkableAnnotation };
    expect(payload.ok).toBe(true);
    expect(payload.annotation.id).toBe("mark-test-1");

    const persisted = await readPersisted();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].message).toBe("Middleware test annotation");
  });

  it("serves persisted annotations on GET", async () => {
    await dispatch(handler, postAnnotation(annotationInput()));
    const res = await dispatch(handler, createFakeRequest({ method: "GET" }));

    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.body) as { annotations: MarkableAnnotation[] };
    expect(payload.annotations).toHaveLength(1);
  });

  it("rejects bodies that are not valid JSON", async () => {
    const res = await dispatch(handler, postAnnotation("{not json"));
    expect(res.statusCode).toBe(400);
    await expect(fs.access(commentsFile())).rejects.toThrow();
  });

  it("rejects non-JSON content types", async () => {
    const res = await dispatch(
      handler,
      createFakeRequest({
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(annotationInput()),
      }),
    );
    expect(res.statusCode).toBe(415);
  });

  it("rejects structurally invalid annotations", async () => {
    const res = await dispatch(handler, postAnnotation(annotationInput({ message: "" })));
    expect(res.statusCode).toBe(422);
    await expect(fs.access(commentsFile())).rejects.toThrow();
  });

  it("rejects oversized payloads", async () => {
    const res = await dispatch(
      handler,
      postAnnotation(annotationInput({ message: "x".repeat(300 * 1024) })),
    );
    expect(res.statusCode).toBe(413);
  });

  it("ignores retried submissions with a known id", async () => {
    await dispatch(handler, postAnnotation(annotationInput()));
    await dispatch(handler, postAnnotation(annotationInput({ message: "retry" })));

    const persisted = await readPersisted();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].message).toBe("Middleware test annotation");
  });

  it("does not lose annotations under concurrent POSTs", async () => {
    const posts = Array.from({ length: 8 }, (_, index) =>
      dispatch(
        handler,
        postAnnotation(annotationInput({ id: `mark-concurrent-${index}`, message: `m${index}` })),
      ),
    );
    const responses = await Promise.all(posts);
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
    }

    const persisted = await readPersisted();
    expect(persisted).toHaveLength(8);
  });

  it("responds 405 to unsupported methods", async () => {
    const res = await dispatch(handler, createFakeRequest({ method: "DELETE" }));
    expect(res.statusCode).toBe(405);
    expect(res.headers.allow).toBe("GET, POST");
  });

  it("passes sub-path requests through to the next middleware", async () => {
    let nextCalled = false;
    const res = createFakeResponse();
    handler(createFakeRequest({ method: "GET", url: "/sub-path" }), res, () => {
      nextCalled = true;
      res.end();
    });
    await res.finished;
    expect(nextCalled).toBe(true);
  });
});
