// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import type { MarkableAnnotation } from "../core";
import { createHttpStore, createLocalStorageStore, createMemoryStore } from "./stores";

function annotation(id: string): MarkableAnnotation {
  return {
    id,
    mode: "review",
    target: { kind: "dom_element", locator: { selector: "body" } },
    message: "test",
    status: "open",
    createdAt: "2026-06-16T00:00:00.000Z",
    updatedAt: "2026-06-16T00:00:00.000Z",
  };
}

describe("createMemoryStore", () => {
  it("loads an empty list by default", async () => {
    const store = createMemoryStore();
    expect(await store.load()).toEqual([]);
  });

  it("saves annotations", async () => {
    const store = createMemoryStore();
    const a = annotation("a1");
    await store.save(a);
    expect(await store.load()).toEqual([a]);
  });

  it("updates annotations when supported", async () => {
    const store = createMemoryStore();
    const a = annotation("a1");
    await store.save(a);
    await store.update("a1", { status: "resolved" });
    expect((await store.load())[0]?.status).toBe("resolved");
  });
});

describe("createHttpStore", () => {
  it("loads annotations from the endpoint", async () => {
    const annotations = [annotation("h1")];
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ annotations }),
    } as unknown as Response) as unknown as typeof fetch;

    const store = createHttpStore("/api/comments");
    expect(await store.load()).toEqual(annotations);
  });

  it("posts annotations to the endpoint", async () => {
    let posted: MarkableAnnotation | undefined;
    globalThis.fetch = vi.fn(async (_input, init) => {
      posted = JSON.parse(init?.body as string) as MarkableAnnotation;
      return { ok: true } as Response;
    }) as unknown as typeof fetch;

    const store = createHttpStore("/api/comments");
    const a = annotation("h2");
    await store.save(a);
    expect(posted).toEqual(a);
  });

  it("throws when the endpoint responds with an error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    } as Response) as unknown as typeof fetch;

    const store = createHttpStore("/api/comments");
    await expect(store.load()).rejects.toThrow("failed to load annotations");
  });
});

describe("createLocalStorageStore", () => {
  it("loads an empty list when nothing is stored", async () => {
    localStorage.clear();
    const store = createLocalStorageStore();
    expect(await store.load()).toEqual([]);
  });

  it("persists annotations to localStorage", async () => {
    localStorage.clear();
    const store = createLocalStorageStore();
    const a = annotation("l1");
    await store.save(a);
    const loaded = await store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe("l1");
  });

  it("updates persisted annotations", async () => {
    localStorage.clear();
    const store = createLocalStorageStore();
    const a = annotation("l1");
    await store.save(a);
    await store.update("l1", { status: "resolved" });
    expect((await store.load())[0]?.status).toBe("resolved");
  });
});
