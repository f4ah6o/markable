import { describe, expect, it } from "vitest";
import { defineMarkableConfig } from "./config";

describe("defineMarkableConfig", () => {
  it("returns the config unchanged for type-checked authoring", () => {
    const config = defineMarkableConfig({ devOnly: true, mode: "review" });
    expect(config).toEqual({ devOnly: true, mode: "review" });
  });
});
