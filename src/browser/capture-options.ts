import type { MarkableCaptureOptions } from "../config";
import type { MarkableMode } from "../core";

export interface ResolvedCaptureOptions {
  ancestors: boolean;
  attributes: boolean;
  outerHtml: boolean;
  componentHints: boolean;
  landmarks: boolean;
}

/**
 * Single source of truth for the mode-aware capture defaults.
 *
 * `review` (dev) enables everything. `feedback` (prod) keeps the structural
 * fields — ancestors, whitelisted attributes, heading/landmark text — which
 * are comparable to the already-captured text snippet, but leaves `outerHtml`
 * (can embed user-typed `value` content) and `componentHints` (can leak
 * internal source paths from dev builds) off unless explicitly enabled.
 */
export function resolveCaptureOptions(
  mode: MarkableMode,
  capture?: MarkableCaptureOptions,
): ResolvedCaptureOptions {
  const review = mode !== "feedback";
  return {
    ancestors: capture?.ancestors ?? true,
    attributes: capture?.attributes ?? true,
    landmarks: capture?.landmarks ?? true,
    outerHtml: capture?.outerHtml ?? review,
    componentHints: capture?.componentHints ?? review,
  };
}
