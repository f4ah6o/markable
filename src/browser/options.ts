import type { MarkableContext, MarkableMode, MarkableStore } from "../core";
import type { MarkableLocale } from "../config";
import { createHttpStore, createMemoryStore } from "./stores";

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
   * `owner/repo` used to build the "Submit Issue" link.
   */
  issueRepo?: string;
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
  issueRepo: string | undefined;
  poweredBy: boolean;
  styleIsolation: "shadow" | "none";
  captureExclude: string | Element[] | undefined;
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
    issueRepo: options.issueRepo,
    poweredBy: options.poweredBy ?? true,
    styleIsolation: options.styleIsolation ?? "shadow",
    captureExclude: options.captureExclude,
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
