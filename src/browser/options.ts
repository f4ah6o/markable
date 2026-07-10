import type { MarkableContext, MarkableMode, MarkableStore } from "../core";
import type { MarkableCaptureOptions, MarkableIssueTarget, MarkableLocale } from "../config";
import { createHttpStore, createMemoryStore } from "./stores";

/**
 * A `MarkableIssueTarget` with `titleParam`/`bodyParam` normalized. This is the
 * shape the mount code builds the prefilled form URL from.
 */
export interface ResolvedIssueTarget {
  url: string;
  titleParam: string;
  bodyParam: string;
  params: Record<string, string> | undefined;
  label: string | undefined;
}

export interface MountMarkableOptions {
  /**
   * Interaction mode. Defaults to `"review"`.
   */
  mode?: MarkableMode;
  /**
   * Store used to load and persist annotations. If omitted, an HTTP store is
   * created when `endpoint` is provided; otherwise an in-memory store is used.
   */
  store?: MarkableStore;
  /**
   * Endpoint for the default HTTP store.
   */
  endpoint?: string;
  /**
   * UI locale. Defaults to `"en"`.
   */
  locale?: MarkableLocale;
  /**
   * `owner/repo` shorthand used to build a GitHub "Submit Issue" link. Ignored
   * when `issueTarget` is set.
   */
  issueRepo?: string;
  /**
   * Generic "Submit Issue" target for any repository or form. Takes precedence
   * over `issueRepo`.
   */
  issueTarget?: MarkableIssueTarget;
  /**
   * Show the "Powered by Markable" footer. Defaults to `true`.
   */
  poweredBy?: boolean;
  /**
   * Style isolation strategy. Defaults to `"shadow"`.
   *
   * If `mountTarget` is already a `ShadowRoot`, the effective isolation is
   * always `"none"` because the caller has already supplied the boundary.
   * Markable will not call `attachShadow()` in that case.
   */
  styleIsolation?: "shadow" | "none";
  /**
   * Elements to exclude from targeting.
   *
   * - `string`: a CSS selector evaluated at capture time. Elements matching this
   *   selector are excluded automatically, including dynamically added ones.
   * - `Element[]`: a static collection of element references. Elements added
   *   later are not excluded unless supplied through a subsequent mount.
   *
   * Markable-owned UI, overlays, and controls are excluded internally
   * regardless of this option.
   */
  captureExclude?: string | Element[];
  /**
   * Per-field overrides for the context captured on element targets. Unset
   * fields use mode-aware defaults (see `resolveCaptureOptions`).
   */
  capture?: MarkableCaptureOptions;
  /**
   * Additional context merged into every annotation context.
   */
  extendContext?: MarkableContext | (() => MarkableContext);
  /**
   * Factory used to generate annotation IDs.
   */
  idFactory?: () => string;
  /**
   * Factory used to generate timestamps.
   */
  now?: () => Date;
}

export interface ResolvedMountOptions {
  mode: MarkableMode;
  store: MarkableStore;
  locale: MarkableLocale;
  issueTarget: ResolvedIssueTarget | undefined;
  poweredBy: boolean;
  styleIsolation: "shadow" | "none";
  captureExclude: string | Element[] | undefined;
  capture: MarkableCaptureOptions | undefined;
  extendContext: MarkableContext | (() => MarkableContext) | undefined;
  idFactory: (() => string) | undefined;
  now: (() => Date) | undefined;
}

export function resolveMountOptions(options: MountMarkableOptions): ResolvedMountOptions {
  const store = resolveStore(options);
  return {
    mode: options.mode ?? "review",
    store,
    locale: options.locale ?? "en",
    issueTarget: resolveIssueTarget(options),
    poweredBy: options.poweredBy ?? true,
    styleIsolation: options.styleIsolation ?? "shadow",
    captureExclude: options.captureExclude,
    capture: options.capture,
    extendContext: options.extendContext,
    idFactory: options.idFactory,
    now: options.now,
  };
}

function resolveStore(options: MountMarkableOptions): MarkableStore {
  if (options.store) return options.store;
  if (options.endpoint) return createHttpStore(options.endpoint);
  return createMemoryStore();
}

/**
 * Normalize the "Submit Issue" target. An explicit `issueTarget` wins; the
 * `issueRepo` shorthand expands to a GitHub new-issue URL. Returns `undefined`
 * when neither is configured, which hides the button.
 */
export function resolveIssueTarget(
  options: Pick<MountMarkableOptions, "issueRepo" | "issueTarget">,
): ResolvedIssueTarget | undefined {
  const target =
    options.issueTarget ??
    (options.issueRepo
      ? { url: `https://github.com/${options.issueRepo}/issues/new` }
      : undefined);
  if (!target) return undefined;
  return {
    url: target.url,
    titleParam: target.titleParam ?? "title",
    bodyParam: target.bodyParam ?? "body",
    params: target.params,
    label: target.label,
  };
}
