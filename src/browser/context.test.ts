import { describe, expect, it } from "vitest";
import { buildAnnotationContext } from "./context";

describe("buildAnnotationContext", () => {
  it("merges extended context over the base context", () => {
    const base = { url: "https://example.com", title: "Example" };
    const extend = { title: "Overridden" };
    const context = buildAnnotationContext(base, extend, "en", "primary");

    expect(context).toEqual({
      url: "https://example.com",
      title: "Overridden",
      markableLocale: "en",
      markableTab: "primary",
    });
  });

  it("supports a function for extendContext", () => {
    const context = buildAnnotationContext(
      { url: "https://example.com" },
      () => ({ project: "demo" }),
      "ja",
      "secondary",
    );

    expect(context).toEqual({
      url: "https://example.com",
      project: "demo",
      markableLocale: "ja",
      markableTab: "secondary",
    });
  });

  it("adds markable metadata even without an extension", () => {
    const context = buildAnnotationContext({ url: "https://example.com" }, undefined, "en", "primary");

    expect(context).toEqual({
      url: "https://example.com",
      markableLocale: "en",
      markableTab: "primary",
    });
  });
});
