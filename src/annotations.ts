import type {
  MarkableAnnotation,
  MarkableContext,
  MarkableMode,
  MarkableRect,
  MarkableStatus,
  MarkableTarget,
  MarkableTargetKind,
} from "./core";
import { createAnnotationId } from "./core";

/**
 * Platform-neutral validation and normalization for annotations received from
 * untrusted clients. The Vite dev-server endpoint uses this before persisting
 * anything to disk, and custom production endpoints (Cloudflare Workers,
 * Express handlers, and so on) can reuse it via
 * `import { normalizeAnnotation } from "@f12o/markable/annotations"`.
 */

export const MAX_MESSAGE_LENGTH = 10_000;
export const MAX_QUOTE_LENGTH = 1_000;
export const MAX_ID_LENGTH = 128;
export const MAX_LOCATOR_BYTES = 8 * 1024;
export const MAX_CONTEXT_BYTES = 16 * 1024;

const TARGET_KINDS: ReadonlySet<string> = new Set<MarkableTargetKind>([
  "dom_range",
  "dom_element",
  "text_range",
  "line_range",
  "cell_range",
  "bbox",
  "node",
  "edge",
]);

const STATUSES: ReadonlySet<string> = new Set<MarkableStatus>([
  "open",
  "agent_replied",
  "applied",
  "rejected",
  "needs_user_reply",
  "resolved",
]);

const MODES: ReadonlySet<string> = new Set<MarkableMode>(["review", "feedback"]);

export type NormalizeAnnotationResult =
  | { ok: true; annotation: MarkableAnnotation }
  | { ok: false; error: string };

export interface NormalizeAnnotationOptions {
  now?: () => Date;
  idFactory?: () => string;
}

/**
 * Validate an untrusted value as a Markable annotation and return a normalized
 * copy that only contains schema fields, with sizes capped and missing or
 * malformed metadata (id, status, timestamps, context) replaced by safe
 * defaults. Structural problems — wrong root type, missing message, unknown
 * mode, invalid target — are rejected with a human-readable error instead.
 */
export function normalizeAnnotation(
  input: unknown,
  options: NormalizeAnnotationOptions = {},
): NormalizeAnnotationResult {
  const now = options.now ?? (() => new Date());
  const idFactory = options.idFactory ?? createAnnotationId;

  if (!isPlainObject(input)) {
    return { ok: false, error: "annotation must be a JSON object" };
  }

  const message = typeof input.message === "string" ? input.message.trim() : "";
  if (!message) {
    return { ok: false, error: "message must be a non-empty string" };
  }

  const mode = input.mode;
  if (typeof mode !== "string" || !MODES.has(mode)) {
    return { ok: false, error: 'mode must be "review" or "feedback"' };
  }

  const target = normalizeTarget(input.target);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }

  const status =
    typeof input.status === "string" && STATUSES.has(input.status)
      ? (input.status as MarkableStatus)
      : "open";

  const fallbackTimestamp = now().toISOString();
  const createdAt = normalizeTimestamp(input.createdAt, fallbackTimestamp);
  const updatedAt = normalizeTimestamp(input.updatedAt, createdAt);

  const id =
    typeof input.id === "string" && input.id.trim() && input.id.length <= MAX_ID_LENGTH
      ? input.id.trim()
      : idFactory();

  const annotation: MarkableAnnotation = {
    id,
    mode: mode as MarkableMode,
    target: target.target,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    status,
    createdAt,
    updatedAt,
  };

  const context = normalizeContext(input.context);
  if (context) {
    annotation.context = context;
  }

  return { ok: true, annotation };
}

type NormalizeTargetResult =
  | { ok: true; target: MarkableTarget }
  | { ok: false; error: string };

function normalizeTarget(input: unknown): NormalizeTargetResult {
  if (!isPlainObject(input)) {
    return { ok: false, error: "target must be an object" };
  }

  const kind = input.kind;
  if (typeof kind !== "string" || !TARGET_KINDS.has(kind)) {
    return { ok: false, error: "target.kind is not a known target kind" };
  }

  const locator = isPlainObject(input.locator) ? input.locator : null;
  if (!locator) {
    return { ok: false, error: "target.locator must be an object" };
  }
  if (jsonByteLength(locator) > MAX_LOCATOR_BYTES) {
    return { ok: false, error: "target.locator exceeds the size limit" };
  }

  const target: MarkableTarget = {
    kind: kind as MarkableTargetKind,
    locator: { ...locator },
  };

  for (const key of ["quote", "prefix", "suffix"] as const) {
    const value = input[key];
    if (typeof value === "string" && value) {
      target[key] = value.slice(0, MAX_QUOTE_LENGTH);
    }
  }

  const rect = normalizeRect(input.rect);
  if (rect) {
    target.rect = rect;
  }

  return { ok: true, target };
}

function normalizeRect(input: unknown): MarkableRect | undefined {
  if (!isPlainObject(input)) return undefined;
  const { x, y, width, height } = input;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number"
  ) {
    return undefined;
  }
  if (![x, y, width, height].every(Number.isFinite)) return undefined;
  return { x, y, width, height };
}

function normalizeContext(input: unknown): MarkableContext | undefined {
  if (!isPlainObject(input)) return undefined;
  if (jsonByteLength(input) > MAX_CONTEXT_BYTES) return undefined;
  return { ...input } as MarkableContext;
}

function normalizeTimestamp(input: unknown, fallback: string): string {
  if (typeof input !== "string") return fallback;
  const time = Date.parse(input);
  if (!Number.isFinite(time)) return fallback;
  return new Date(time).toISOString();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonByteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
