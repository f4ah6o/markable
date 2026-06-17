import type { MarkableMode } from "./core";

export type MarkableLocale = "ja" | "en";

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
}

/**
 * Identity helper that gives `markable.config.ts` full type checking and
 * editor completion while keeping the file trivial to load at runtime.
 */
export function defineMarkableConfig(config: MarkableConfig): MarkableConfig {
  return config;
}
