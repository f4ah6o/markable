import type { MarkableContext } from "../core";
import type { MarkableLocale } from "../config";

export type ExtendContext = MarkableContext | (() => MarkableContext);

export function buildAnnotationContext(
  base: MarkableContext,
  extend: ExtendContext | undefined,
  locale: MarkableLocale,
  activeTab: string,
): MarkableContext {
  const extended = typeof extend === "function" ? extend() : extend;
  return {
    ...base,
    ...extended,
    markableLocale: locale,
    markableTab: activeTab,
  };
}
