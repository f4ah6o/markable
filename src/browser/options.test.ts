// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { resolveMountOptions } from "./options";
import { createHttpStore, createMemoryStore } from "./stores";

describe("resolveMountOptions", () => {
  it("uses sensible defaults", () => {
    const resolved = resolveMountOptions({});

    expect(resolved.mode).toBe("review");
    expect(resolved.locale).toBe("en");
    expect(resolved.poweredBy).toBe(true);
    expect(resolved.styleIsolation).toBe("shadow");
    expect(resolved.issueRepo).toBeUndefined();
  });

  it("falls back to a memory store when no store or endpoint is provided", () => {
    const resolved = resolveMountOptions({});

    // The memory store keeps annotations on a public property.
    expect(resolved.store).toHaveProperty("annotations");
    expect("save" in resolved.store).toBe(true);
  });

  it("creates an HTTP store when an endpoint is provided", () => {
    const resolved = resolveMountOptions({ endpoint: "/__markable/comments" });

    // The HTTP store does not expose the annotations array.
    expect(resolved.store).not.toHaveProperty("annotations");
    expect("save" in resolved.store).toBe(true);
  });

  it("prefers an explicit store over the endpoint", () => {
    const store = createMemoryStore();
    const resolved = resolveMountOptions({ endpoint: "/__markable/comments", store });

    expect(resolved.store).toBe(store);
  });

  it("forwards idFactory and now", () => {
    const idFactory = () => "id-1";
    const now = () => new Date("2026-06-16T00:00:00.000Z");
    const resolved = resolveMountOptions({ idFactory, now });

    expect(resolved.idFactory).toBe(idFactory);
    expect(resolved.now).toBe(now);
  });

  it("captures extendContext and captureExclude", () => {
    const extendContext = { project: "demo" };
    const exclude = [document.body];
    const resolved = resolveMountOptions({ extendContext, captureExclude: exclude });

    expect(resolved.extendContext).toBe(extendContext);
    expect(resolved.captureExclude).toBe(exclude);
  });
});
