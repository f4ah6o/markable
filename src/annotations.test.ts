import { describe, expect, it } from "vitest";
import {
  MAX_MESSAGE_LENGTH,
  MAX_QUOTE_LENGTH,
  normalizeAnnotation,
} from "./annotations";

const validInput = () => ({
  id: "mark-1",
  mode: "review",
  message: "Needs a clearer label",
  status: "open",
  target: {
    kind: "dom_element",
    locator: { tag: "button", selector: "#save" },
  },
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
});

describe("normalizeAnnotation", () => {
  it("accepts a well-formed annotation", () => {
    const result = normalizeAnnotation(validInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.annotation.id).toBe("mark-1");
    expect(result.annotation.mode).toBe("review");
    expect(result.annotation.target.kind).toBe("dom_element");
  });

  it("strips unknown top-level fields", () => {
    const input = { ...validInput(), extra: "junk", __proto__injected: true };
    const result = normalizeAnnotation(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.annotation).sort()).toEqual([
      "createdAt",
      "id",
      "message",
      "mode",
      "status",
      "target",
      "updatedAt",
    ]);
  });

  it("rejects non-object payloads", () => {
    for (const input of [null, [], "text", 42]) {
      const result = normalizeAnnotation(input);
      expect(result.ok).toBe(false);
    }
  });

  it("rejects a missing or empty message", () => {
    const noMessage = normalizeAnnotation({ ...validInput(), message: undefined });
    expect(noMessage.ok).toBe(false);
    const blank = normalizeAnnotation({ ...validInput(), message: "   " });
    expect(blank.ok).toBe(false);
  });

  it("rejects unknown modes and target kinds", () => {
    expect(normalizeAnnotation({ ...validInput(), mode: "admin" }).ok).toBe(false);
    const badTarget = {
      ...validInput(),
      target: { kind: "shell_command", locator: {} },
    };
    expect(normalizeAnnotation(badTarget).ok).toBe(false);
  });

  it("rejects targets without an object locator", () => {
    const badLocator = { ...validInput(), target: { kind: "bbox", locator: "nope" } };
    expect(normalizeAnnotation(badLocator).ok).toBe(false);
  });

  it("caps message and quote lengths", () => {
    const input = {
      ...validInput(),
      message: "a".repeat(MAX_MESSAGE_LENGTH + 100),
      target: {
        kind: "text_range",
        locator: {},
        quote: "b".repeat(MAX_QUOTE_LENGTH + 100),
      },
    };
    const result = normalizeAnnotation(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.annotation.message).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(result.annotation.target.quote).toHaveLength(MAX_QUOTE_LENGTH);
  });

  it("generates an id and timestamps when missing or malformed", () => {
    const input = {
      mode: "feedback",
      message: "hello",
      target: { kind: "dom_range", locator: {} },
      id: "",
      createdAt: "not-a-date",
      updatedAt: 12345,
    };
    const result = normalizeAnnotation(input, { now: () => new Date("2026-07-05T00:00:00Z") });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.annotation.id).toMatch(/^mark-/);
    expect(result.annotation.createdAt).toBe("2026-07-05T00:00:00.000Z");
    expect(result.annotation.updatedAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("defaults invalid statuses to open", () => {
    const result = normalizeAnnotation({ ...validInput(), status: "deleted" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.annotation.status).toBe("open");
  });

  it("drops oversized or non-object contexts", () => {
    const oversized = normalizeAnnotation({
      ...validInput(),
      context: { blob: "x".repeat(64 * 1024) },
    });
    expect(oversized.ok).toBe(true);
    if (!oversized.ok) return;
    expect(oversized.annotation.context).toBeUndefined();

    const nonObject = normalizeAnnotation({ ...validInput(), context: "text" });
    expect(nonObject.ok).toBe(true);
    if (!nonObject.ok) return;
    expect(nonObject.annotation.context).toBeUndefined();
  });

  it("drops malformed rects but keeps valid ones", () => {
    const valid = normalizeAnnotation({
      ...validInput(),
      target: {
        kind: "bbox",
        locator: {},
        rect: { x: 1, y: 2, width: 3, height: 4 },
      },
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.annotation.target.rect).toEqual({ x: 1, y: 2, width: 3, height: 4 });

    const malformed = normalizeAnnotation({
      ...validInput(),
      target: {
        kind: "bbox",
        locator: {},
        rect: { x: Number.POSITIVE_INFINITY, y: 0, width: "3", height: 4 },
      },
    });
    expect(malformed.ok).toBe(true);
    if (!malformed.ok) return;
    expect(malformed.annotation.target.rect).toBeUndefined();
  });
});
