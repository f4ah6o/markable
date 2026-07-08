// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountMarkable, type MountedMarkable } from "./mount";

let mounted: MountedMarkable | null = null;

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("mountMarkable", () => {
  it("does not intercept page clicks before the panel is opened", () => {
    document.body.innerHTML = '<a id="demo-link" href="/demo">Open demo</a>';
    const link = document.getElementById("demo-link") as HTMLAnchorElement;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(link);

    let clicked = false;
    link.addEventListener("click", () => {
      clicked = true;
    });

    mounted = mountMarkable(undefined, { mode: "feedback", styleIsolation: "none" });

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    });
    const allowed = link.dispatchEvent(event);

    expect(clicked).toBe(true);
    expect(allowed).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });

  it("intercepts page clicks while the panel is opened for target selection", () => {
    document.body.innerHTML = '<a id="demo-link" href="/demo">Open demo</a>';
    const link = document.getElementById("demo-link") as HTMLAnchorElement;
    vi.spyOn(document, "elementFromPoint").mockReturnValue(link);

    let clicked = false;
    link.addEventListener("click", () => {
      clicked = true;
    });

    mounted = mountMarkable(undefined, { mode: "feedback", styleIsolation: "none" });
    const launcher = document.querySelector("[data-markable-launcher]") as HTMLButtonElement;
    launcher.click();

    const event = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      clientX: 8,
      clientY: 8,
    });
    const allowed = link.dispatchEvent(event);

    expect(clicked).toBe(false);
    expect(allowed).toBe(false);
    expect(event.defaultPrevented).toBe(true);
  });
});
