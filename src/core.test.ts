import { describe, expect, it } from "vitest";
import {
  createMarkable,
  type MarkableAnnotation,
  type MarkableAdapter,
  type MarkableStore,
} from "./core";

function createMemoryStore(): MarkableStore & { annotations: MarkableAnnotation[] } {
  const annotations: MarkableAnnotation[] = [];

  return {
    annotations,
    async load() {
      return annotations;
    },
    async save(annotation) {
      annotations.push(annotation);
    },
    async update(id, patch) {
      const annotation = annotations.find((item) => item.id === id);
      if (!annotation) return;
      Object.assign(annotation, patch);
    },
  };
}

describe("createMarkable", () => {
  it("submits an annotation for the active target", async () => {
    let cleared = false;
    const adapter: MarkableAdapter = {
      getTarget: () => ({ kind: "text_range", locator: { start: 0, end: 4 }, quote: "test" }),
      getContext: () => ({ url: "https://example.com" }),
      clearSelection: () => {
        cleared = true;
      },
    };
    const store = createMemoryStore();
    const runtime = createMarkable({
      mode: "review",
      adapter,
      store,
      idFactory: () => "mark-test",
      now: () => new Date("2026-06-16T00:00:00.000Z"),
    });

    const annotation = await runtime.submit("Looks good");

    expect(annotation).toMatchObject({
      id: "mark-test",
      mode: "review",
      message: "Looks good",
      status: "open",
      context: { url: "https://example.com" },
    });
    expect(store.annotations).toEqual([annotation]);
    expect(cleared).toBe(true);
  });

  it("updates annotation status when the store supports updates", async () => {
    const adapter: MarkableAdapter = {
      getTarget: () => ({ kind: "node", locator: { id: "heading" } }),
    };
    const store = createMemoryStore();
    const runtime = createMarkable({
      mode: "feedback",
      adapter,
      store,
      idFactory: () => "mark-status",
      now: () => new Date("2026-06-16T00:00:00.000Z"),
    });

    await runtime.submit("Please update this");
    await runtime.updateStatus("mark-status", "resolved");

    expect(store.annotations[0]?.status).toBe("resolved");
  });
});
