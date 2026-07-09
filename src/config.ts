import type { MarkableMode } from "./core";

export type MarkableLocale = "ja" | "en";

/**
 * Controls how much context is captured for element targets. Everything is
 * plain JSON booleans so the Vite plugin can serialize the options into the
 * injected client script. Unset fields fall back to mode-aware defaults:
 * `review` enables everything, `feedback` keeps `outerHtml` and
 * `componentHints` off so production submissions cannot carry user-typed
 * content or internal source paths unless the host opts in.
 */
export interface MarkableCaptureOptions {
  /** Ancestor chain (tag/id/classes/role) up to 6 levels above the target. */
  ancestors?: boolean;
  /** Whitelisted attributes of the picked element. */
  attributes?: boolean;
  /** Sanitized outerHTML snippet (~2 KB, values and scripts stripped). */
  outerHtml?: boolean;
  /**
   * Framework dev-build metadata (React fiber, Vue `__file`, Svelte
   * `__svelte_meta`) — component names and, in dev builds, file:line.
   */
  componentHints?: boolean;
  /** Nearest preceding heading and enclosing landmark region. */
  landmarks?: boolean;
}

/**
 * Options shared by the Vite plugin and the Markable-owned `markable.config.*`
 * file. The CLI writes these into `markable.config.ts` so that `vite.config.*`
 * only needs the minimal `markable()` plugin call.
 */
export interface MarkableConfig {
  mode?: MarkableMode | "auto";
  commentsFile?: string;
  endpoint?: string;
  inject?: boolean;
  poweredBy?: boolean;
  locale?: MarkableLocale;
  /**
   * `owner/repo` used to build the "Submit Issue" link in the injected UI.
   */
  issueRepo?: string;
  /**
   * Restrict Markable to the Vite dev server. When enabled the plugin is never
   * active during `vite build`.
   */
  devOnly?: boolean;
  /**
   * Per-field overrides for the context captured on element targets.
   */
  capture?: MarkableCaptureOptions;
}

/**
 * Identity helper that gives `markable.config.ts` full type checking and
 * editor completion while keeping the file trivial to load at runtime.
 */
export function defineMarkableConfig(config: MarkableConfig): MarkableConfig {
  return config;
}
