import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const commentsFile = path.resolve(
  __dirname,
  "fixture",
  ".markable",
  "comments.json",
);

async function clearComments(): Promise<void> {
  try {
    await fs.unlink(commentsFile);
  } catch {
    // ignore when file does not exist
  }
}

async function gotoFixture(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForSelector("[data-markable-launcher]", { state: "visible" });
}

interface PersistedAnnotation {
  mode: string;
  target: { kind: string; locator: Record<string, unknown> };
}

async function readPersistedAnnotations(): Promise<PersistedAnnotation[]> {
  try {
    const raw = await fs.readFile(commentsFile, "utf8");
    return (JSON.parse(raw) as { annotations: PersistedAnnotation[] }).annotations;
  } catch {
    return [];
  }
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await clearComments();
});

test.describe("launcher and panel lifecycle", () => {
  test("opens and closes the panel", async ({ page }) => {
    await gotoFixture(page);

    await expect(page.locator("[data-markable-launcher]")).toBeVisible();
    await page.locator("[data-markable-launcher]").click();
    await expect(page.locator("[data-markable-panel]")).toBeVisible();

    await page.locator("[data-markable-close]").click();
    await expect(page.locator("[data-markable-panel]")).toBeHidden();
    await expect(page.locator("[data-markable-launcher]")).toBeVisible();
  });

  test("closes the panel with the Escape key", async ({ page }) => {
    await gotoFixture(page);

    await page.locator("[data-markable-launcher]").click();
    await expect(page.locator("[data-markable-panel]")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("[data-markable-panel]")).toBeHidden();
    await expect(page.locator("[data-markable-launcher]")).toBeVisible();
  });

  test("exposes dialog and status semantics", async ({ page }) => {
    await gotoFixture(page);

    await expect(page.locator("[data-markable-launcher]")).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    await page.locator("[data-markable-launcher]").click();
    await expect(page.locator("[data-markable-panel]")).toHaveAttribute("role", "dialog");
    await expect(page.locator("[data-markable-status]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
  });
});

test.describe("targeting", () => {
  test("submits a page-level target", async ({ page }) => {
    await gotoFixture(page);
    await page.locator("[data-markable-launcher]").click();
    await page.locator("[data-markable-input]").fill("Page-level feedback");
    await page.locator("[data-markable-submit]").click();

    await expect(page.locator("[data-markable-list]")).toContainText(
      "Page-level feedback",
    );
    await expect(page.locator("[data-markable-list]")).toContainText("dom_range");
  });

  test("submits an element target", async ({ page }) => {
    await gotoFixture(page);
    await page.locator("[data-markable-launcher]").click();
    await page.locator('[data-testid="target-button"]').click();

    await expect(page.locator("[data-markable-target-summary]")).toContainText(
      "Target:",
    );

    await page.locator("[data-markable-input]").fill("Button feedback");
    await page.locator("[data-markable-submit]").click();

    await expect(page.locator("[data-markable-list]")).toContainText(
      "Button feedback",
    );
    await expect(page.locator("[data-markable-list]")).toContainText(
      "dom_element",
    );
  });

  test("submits a box target by dragging", async ({ page }) => {
    await gotoFixture(page);
    await page.locator("[data-markable-launcher]").click();

    // Drag over an empty area of the page to create a box selection.
    await page.mouse.move(150, 400);
    await page.mouse.down();
    await page.mouse.move(350, 600, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator("[data-markable-target-summary]")).toContainText(
      "selected screen area",
    );

    await page.locator("[data-markable-input]").fill("Box feedback");
    await page.locator("[data-markable-submit]").click();

    await expect(page.locator("[data-markable-list]")).toContainText(
      "Box feedback",
    );
    await expect(page.locator("[data-markable-list]")).toContainText("bbox");
  });

  test("box selection ending over an element keeps bbox target", async ({
    page,
  }) => {
    await gotoFixture(page);
    await page.locator("[data-markable-launcher]").click();

    const buttonBox = await page
      .locator('[data-testid="target-button"]')
      .boundingBox();
    if (!buttonBox) throw new Error("target-button not found");

    // End the drag directly over the button to reproduce the bug where the
    // follow-up click event would overwrite the bbox target with element info.
    const endX = buttonBox.x + buttonBox.width / 2;
    const endY = buttonBox.y + buttonBox.height / 2;

    await page.mouse.move(200, 450);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    await expect(page.locator("[data-markable-target-summary]")).toContainText(
      "selected screen area",
    );
  });
});

test.describe("captured element context", () => {
  test("persists rich locator fields in review mode", async ({ page }) => {
    await gotoFixture(page);
    await page.locator("[data-markable-launcher]").click();
    await page.locator('[data-testid="target-button"]').click();
    await page.locator("[data-markable-input]").fill("Rich capture");
    await page.locator("[data-markable-submit]").click();
    await expect(page.locator("[data-markable-list]")).toContainText("Rich capture");

    await expect.poll(readPersistedAnnotations).toHaveLength(1);
    const [annotation] = await readPersistedAnnotations();
    const locator = annotation.target.locator;

    expect(annotation.target.kind).toBe("dom_element");
    expect(locator.tag).toBe("button");
    expect(locator.selector).toBeTruthy();
    expect(locator.ancestors).toEqual([{ tag: "section" }, { tag: "main" }]);
    expect(locator.attributes).toEqual({ type: "button", "data-testid": "target-button" });
    expect(locator.nearestHeading).toEqual({ tag: "h2", text: "Demo Heading" });
    expect(locator.landmark).toEqual({ tag: "section", label: "Demo section" });
    expect(locator.componentHints).toEqual({
      framework: "react",
      components: ["DemoButton"],
      source: { file: "src/Demo.tsx", line: 7, column: 3 },
    });
    expect(String(locator.outerHtml)).toContain("Target Button");
  });

  test("omits outerHtml and componentHints by default in feedback mode", async ({ page }) => {
    await gotoFixture(page);
    await page.waitForFunction(() => typeof window.remountMarkable === "function");
    await page.evaluate(() => {
      window.remountMarkable({ mode: "feedback" });
    });

    await page.locator("[data-markable-launcher]").click();
    await page.locator('[data-testid="target-button"]').click();
    await page.locator("[data-markable-input]").fill("Feedback capture");
    await page.locator("[data-markable-submit]").click();
    await expect(page.locator("[data-markable-list]")).toContainText("Feedback capture");

    await expect.poll(readPersistedAnnotations).toHaveLength(1);
    const [annotation] = await readPersistedAnnotations();
    const locator = annotation.target.locator;

    expect(annotation.mode).toBe("feedback");
    expect(locator.outerHtml).toBeUndefined();
    expect(locator.componentHints).toBeUndefined();
    expect(locator.ancestors).toEqual([{ tag: "section" }, { tag: "main" }]);
    expect(locator.attributes).toEqual({ type: "button", "data-testid": "target-button" });
    expect(locator.nearestHeading).toEqual({ tag: "h2", text: "Demo Heading" });
  });
});

test.describe("locale rendering", () => {
  test("renders Japanese labels when requested", async ({ page }) => {
    await gotoFixture(page);
    await page.waitForFunction(
      () => typeof window.remountMarkable === "function",
    );
    await page.evaluate(() => {
      window.remountMarkable({ locale: "ja" });
    });

    await expect(page.locator("[data-markable-launcher]")).toContainText("マーク");
  });
});

test.describe("HTTP persistence", () => {
  test("survives a page reload", async ({ page }) => {
    await gotoFixture(page);
    await page.locator("[data-markable-launcher]").click();
    await page
      .locator("[data-markable-input]")
      .fill("Persisted annotation");
    await page.locator("[data-markable-submit]").click();

    await expect(page.locator("[data-markable-list]")).toContainText(
      "Persisted annotation",
    );

    await page.reload();
    await page.waitForSelector("[data-markable-launcher]", { state: "visible" });
    await expect(page.locator("[data-markable-list]")).toContainText(
      "Persisted annotation",
    );
  });
});

test.describe("rendering modes", () => {
  test("uses Shadow DOM by default", async ({ page }) => {
    await gotoFixture(page);
    const inShadow = await page.evaluate(() => {
      return (
        document
          .querySelector("#markable-host")
          ?.shadowRoot?.querySelector("[data-markable-launcher]") !== null
      );
    });
    expect(inShadow).toBe(true);
  });

  test("can render without Shadow DOM isolation", async ({ page }) => {
    await gotoFixture(page);
    await page.waitForFunction(
      () => typeof window.remountMarkable === "function",
    );
    await page.evaluate(() => {
      window.remountMarkable({ styleIsolation: "none" });
    });

    const inShadow = await page.evaluate(() => {
      return (
        document
          .querySelector("#markable-host")
          ?.shadowRoot?.querySelector("[data-markable-launcher]") !== null
      );
    });
    expect(inShadow).toBe(false);

    const inHost = await page.evaluate(() => {
      return (
        document
          .querySelector("#markable-host")
          ?.querySelector("[data-markable-launcher]") !== null
      );
    });
    expect(inHost).toBe(true);
  });
});

test.describe("issue submission link", () => {
  test("opens a GitHub new-issue URL from the issueRepo shorthand", async ({ page }) => {
    await page.addInitScript(() => {
      window.__markableOpened = [];
      window.open = ((url?: string | URL) => {
        window.__markableOpened?.push(String(url ?? ""));
        return null;
      }) as typeof window.open;
    });
    await gotoFixture(page);

    await page.locator("[data-markable-launcher]").click();
    await page.locator("[data-markable-input]").fill("Broken button on settings");
    await page.locator("[data-markable-issue-submit]").click();

    const opened = await page.evaluate(() => window.__markableOpened ?? []);
    expect(opened).toHaveLength(1);
    const url = new URL(opened[0]);
    expect(url.origin + url.pathname).toBe(
      "https://github.com/f4ah6o/markable/issues/new",
    );
    expect(url.searchParams.get("title")).toBe("Broken button on settings");
    expect(url.searchParams.get("body")).toContain("Broken button on settings");
  });

  test("opens a generic form URL with custom param names", async ({ page }) => {
    await page.addInitScript(() => {
      window.__markableOpened = [];
      window.open = ((url?: string | URL) => {
        window.__markableOpened?.push(String(url ?? ""));
        return null;
      }) as typeof window.open;
    });
    await gotoFixture(page);
    await page.waitForFunction(() => typeof window.remountMarkable === "function");
    await page.evaluate(() => {
      window.remountMarkable({
        issueTarget: {
          url: "https://example.com/feedback/new",
          titleParam: "summary",
          bodyParam: "details",
          params: { source: "markable" },
          label: "Report",
        },
      });
    });

    await page.locator("[data-markable-launcher]").click();
    await expect(page.locator("[data-markable-issue-submit]")).toHaveText("Report");
    await page.locator("[data-markable-input]").fill("Typo in the footer");
    await page.locator("[data-markable-issue-submit]").click();

    const opened = await page.evaluate(() => window.__markableOpened ?? []);
    expect(opened).toHaveLength(1);
    const url = new URL(opened[0]);
    expect(url.origin + url.pathname).toBe("https://example.com/feedback/new");
    expect(url.searchParams.get("summary")).toBe("Typo in the footer");
    expect(url.searchParams.get("details")).toContain("Typo in the footer");
    expect(url.searchParams.get("source")).toBe("markable");
  });
});

test.describe("cleanup", () => {
  test("removes UI through unmount()", async ({ page }) => {
    await gotoFixture(page);
    await page.waitForFunction(
      () => typeof window.unmountMarkable === "function",
    );
    await page.evaluate(() => {
      window.unmountMarkable();
    });

    await expect(page.locator("[data-markable-launcher]")).toBeHidden();
    await expect(page.locator("[data-markable-panel]")).toBeHidden();
  });
});

declare global {
  interface Window {
    remountMarkable?: (options?: Record<string, unknown>) => void;
    unmountMarkable?: () => void;
    __markableOpened?: string[];
  }
}
