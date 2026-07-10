// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { resolveIssueTarget, resolveMountOptions } from "./options";
import { createHttpStore, createMemoryStore } from "./stores";

describe("resolveMountOptions", () => {
  it("uses sensible defaults", () => {
    const resolved = resolveMountOptions({});

    expect(resolved.mode).toBe("review");
    expect(resolved.locale).toBe("en");
    expect(resolved.poweredBy).toBe(true);
    expect(resolved.styleIsolation).toBe("shadow");
    expect(resolved.issueTarget).toBeUndefined();
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

  it("passes capture options through untouched", () => {
    const capture = { outerHtml: false, ancestors: true };
    const resolved = resolveMountOptions({ capture });

    expect(resolved.capture).toBe(capture);
    expect(resolveMountOptions({}).capture).toBeUndefined();
  });

  it("expands the issueRepo shorthand into a GitHub issue target", () => {
    const resolved = resolveMountOptions({ issueRepo: "f4ah6o/markable" });

    expect(resolved.issueTarget).toEqual({
      url: "https://github.com/f4ah6o/markable/issues/new",
      titleParam: "title",
      bodyParam: "body",
      params: undefined,
      label: undefined,
    });
  });
});

describe("resolveIssueTarget", () => {
  it("returns undefined when neither issueRepo nor issueTarget is set", () => {
    expect(resolveIssueTarget({})).toBeUndefined();
  });

  it("defaults the title and body params for an explicit target", () => {
    const resolved = resolveIssueTarget({
      issueTarget: { url: "https://example.com/new" },
    });

    expect(resolved).toEqual({
      url: "https://example.com/new",
      titleParam: "title",
      bodyParam: "body",
      params: undefined,
      label: undefined,
    });
  });

  it("keeps custom params, param names, and label; prefers issueTarget over issueRepo", () => {
    const resolved = resolveIssueTarget({
      issueRepo: "f4ah6o/markable",
      issueTarget: {
        url: "https://example.com/feedback/new",
        titleParam: "summary",
        bodyParam: "details",
        params: { source: "markable" },
        label: "Report",
      },
    });

    expect(resolved).toEqual({
      url: "https://example.com/feedback/new",
      titleParam: "summary",
      bodyParam: "details",
      params: { source: "markable" },
      label: "Report",
    });
  });
});
