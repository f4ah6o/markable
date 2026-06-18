import type { MarkableRect } from "../core";

export function rectObject(rect: DOMRect): MarkableRect {
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  };
}
