import { Buffer } from "node:buffer";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Plugin } from "vite";
import type { MarkableConfig, MarkableLocale } from "./config";
import type { MarkableAnnotation, MarkableMode } from "./core";

export type { MarkableLocale };

export interface MarkableViteOptions extends MarkableConfig {}

interface ResolvedOptions {
  endpoint: string;
  commentsFile: string;
  inject: boolean;
  poweredBy: boolean;
  locale: MarkableLocale;
  issueRepo: string | undefined;
  devOnly: boolean;
}

function resolveOptions(options: MarkableConfig): ResolvedOptions {
  return {
    endpoint: options.endpoint ?? "/__markable/comments",
    commentsFile: options.commentsFile ?? ".markable/comments.json",
    inject: options.inject ?? true,
    poweredBy: options.poweredBy ?? true,
    locale: options.locale ?? "en",
    issueRepo: options.issueRepo,
    devOnly: options.devOnly ?? false,
  };
}

export function markable(options: MarkableViteOptions = {}): Plugin {
  // `apply` is read synchronously by Vite before any hook runs, so an inline
  // `devOnly: true` is the only way to fully exclude the plugin from the build
  // graph. When `devOnly` comes from markable.config.ts instead, the hooks are
  // disabled in `configResolved` (see `disabled`) which yields the same result.
  const inlineDevOnly = options.devOnly === true;

  let resolved = resolveOptions(options);
  let resolvedMode: MarkableMode = resolveMode(options.mode, "development");
  let root = process.cwd();
  let disabled = false;

  return {
    name: "markable",
    apply: inlineDevOnly ? "serve" : undefined,

    async configResolved(config) {
      root = config.root;
      const fileConfig = await loadMarkableConfig(config.root);
      const merged: MarkableConfig = { ...fileConfig, ...definedOnly(options) };
      resolved = resolveOptions(merged);
      resolvedMode = resolveMode(merged.mode, config.mode);
      disabled = resolved.devOnly && config.command === "build";
    },

    transformIndexHtml() {
      if (disabled || !resolved.inject) return [];
      return [
        {
          tag: "script",
          attrs: {
            type: "module",
          },
          children: clientSource(
            resolved.endpoint,
            resolvedMode,
            resolved.poweredBy,
            resolved.locale,
            resolved.issueRepo,
          ),
          injectTo: "body",
        },
      ];
    },

    configureServer(server) {
      if (disabled) return;
      server.middlewares.use(resolved.endpoint, async (req, res) => {
        const file = path.resolve(root, resolved.commentsFile);

        if (req.method === "GET") {
          const annotations = await readAnnotations(file);
          sendJson(res, { annotations });
          return;
        }

        if (req.method === "POST") {
          const body = await readBody(req);
          const incoming = JSON.parse(body) as MarkableAnnotation;
          const annotations = await readAnnotations(file);
          annotations.push(incoming);
          await fs.mkdir(path.dirname(file), { recursive: true });
          await fs.writeFile(file, JSON.stringify({ annotations }, null, 2));
          sendJson(res, { ok: true, annotation: incoming });
          return;
        }

        res.statusCode = 405;
        res.end("Method Not Allowed");
      });
    },

    resolveId(id) {
      if (disabled) return;
      if (id === "/@markable/client") return id;
    },

    load(id) {
      if (disabled || id !== "/@markable/client") return null;
      return clientSource(
        resolved.endpoint,
        resolvedMode,
        resolved.poweredBy,
        resolved.locale,
        resolved.issueRepo,
      );
    },
  };
}

function definedOnly(options: MarkableConfig): MarkableConfig {
  const result: MarkableConfig = {};
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

const MARKABLE_CONFIG_FILES = [
  "markable.config.ts",
  "markable.config.mts",
  "markable.config.mjs",
  "markable.config.js",
  "markable.config.cjs",
  "markable.config.cts",
];

/**
 * Load options from a Markable-owned `markable.config.*` file in the project
 * root. TypeScript configs are bundled with esbuild into a self-contained module
 * (so both bare `@f12o/markable/config` and relative `./foo` imports resolve
 * exactly as they would in the original file) and imported via a data URL. Any
 * failure falls back to defaults rather than breaking the dev server.
 */
export async function loadMarkableConfig(root: string): Promise<MarkableConfig> {
  let file: string | undefined;
  for (const name of MARKABLE_CONFIG_FILES) {
    const candidate = path.join(root, name);
    try {
      await fs.access(candidate);
      file = candidate;
      break;
    } catch {
      // try the next candidate
    }
  }
  if (!file) return {};

  try {
    if (/\.(mjs|js|cjs)$/.test(file)) {
      const mod = await import(pathToFileURL(file).href);
      return (mod.default ?? {}) as MarkableConfig;
    }

    const esbuild = await loadEsbuild();
    const { outputFiles } = await esbuild.build({
      entryPoints: [file],
      bundle: true,
      write: false,
      format: "esm",
      platform: "node",
      logLevel: "silent",
    });
    const code = outputFiles[0].text;
    const url = `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
    const mod = await import(url);
    return (mod.default ?? {}) as MarkableConfig;
  } catch (error) {
    console.warn(
      `markable: failed to load ${path.basename(file)}:`,
      error instanceof Error ? error.message : error,
    );
    return {};
  }
}

interface EsbuildLike {
  build(options: {
    entryPoints: string[];
    bundle: boolean;
    write: boolean;
    format: "esm";
    platform: "node";
    logLevel: "silent";
  }): Promise<{ outputFiles: { text: string }[] }>;
}

/** Resolve esbuild, preferring the copy that ships with Vite. */
async function loadEsbuild(): Promise<EsbuildLike> {
  const require = createRequire(import.meta.url);
  try {
    const viteRequire = createRequire(require.resolve("vite"));
    const url = pathToFileURL(viteRequire.resolve("esbuild")).href;
    return (await import(url)) as EsbuildLike;
  } catch {
    const specifier = "esbuild";
    return (await import(specifier)) as EsbuildLike;
  }
}

function resolveMode(mode: MarkableViteOptions["mode"], viteMode: string): MarkableMode {
  if (mode === "review" || mode === "feedback") return mode;
  return viteMode === "production" ? "feedback" : "review";
}

async function readAnnotations(file: string): Promise<MarkableAnnotation[]> {
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { annotations?: MarkableAnnotation[] };
    return parsed.annotations ?? [];
  } catch {
    return [];
  }
}

function readBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(
  res: NodeJS.WritableStream & {
    setHeader(name: string, value: string): void;
    statusCode?: number;
  },
  value: unknown,
) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

export interface MarkableClientScriptOptions {
  mode: MarkableMode;
  endpoint?: string;
  poweredBy?: boolean;
  locale?: MarkableLocale;
  issueRepo?: string;
}

export function markableClientScript(options: MarkableClientScriptOptions): string {
  return clientSource(
    options.endpoint ?? "/__markable/comments",
    options.mode,
    options.poweredBy ?? true,
    options.locale ?? "en",
    options.issueRepo,
  );
}

function clientSource(
  endpoint: string,
  mode: MarkableMode,
  poweredBy: boolean,
  locale: MarkableLocale,
  issueRepo: string | undefined,
): string {
  return `
const endpoint = ${JSON.stringify(endpoint)};
const mode = ${JSON.stringify(mode)};
const locale = ${JSON.stringify(locale)};
const issueRepo = ${JSON.stringify(issueRepo ?? "")};
const issueSubmitLabel = ${JSON.stringify(locale === "ja" ? "Issueを送信" : "Submit Issue")};
const issueTitleDefault = ${JSON.stringify(locale === "ja" ? "フィードバック" : "Feedback")};
const poweredByFooter = ${JSON.stringify(poweredBy ? '<footer data-markable-powered-by style="margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:right;color:#6b7280;font-size:11px">Powered by <a href="https://github.com/f4ah6o/markable/" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none">Markable</a></footer>' : "")};
let candidateElement = null;
let selectedElement = null;
let selectedTarget = null;
let dragging = false;
let dragStart = null;
let activeTab = "primary";
const annotations = [];

const messages = {
  ja: {
    close: "閉じる",
    cancel: "キャンセル",
    targetElement: "対象: ",
    targetBox: "対象: 選択した画面範囲",
    targetPage: "対象: 現在のページ",
    recentReview: "最近のマーク",
    recentFeedback: "最近のフィードバック",
    copyJson: "マークJSONをコピー",
    copyJsonTitle: "JSONをコピー",
    copied: "コピー済み",
    copyFailed: "コピー失敗",
    persistedReview: "マークを保存しました。",
    persistedFeedback: "ありがとうございます。フィードバックを送信しました。",
    localOnly: "ローカルに記録しました。永続化するにはエンドポイントを設定してください。",
    review: {
      launcher: "マーク",
      panelTitle: "このページをマーク",
      tabPrimary: "コメント",
      tabSecondary: "AIに依頼",
      placeholder: "レビューコメントを入力",
      secondaryPlaceholder: "AIに依頼したい変更内容を入力",
      submit: "マークを保存",
      helper: "ハイライトされた要素をクリック、空白をドラッグ、またはページ全体のフィードバックを保存できます。",
      empty: "まだマークはありません。"
    },
    feedback: {
      launcher: "フィードバック",
      panelTitle: "フィードバックを送信",
      tabPrimary: "フィードバック",
      tabSecondary: "質問",
      placeholder: "このページへのフィードバックを入力",
      secondaryPlaceholder: "このページについて質問する",
      submit: "送信",
      helper: "ハイライトされた要素をクリック、空白をドラッグ、またはページ全体のフィードバックを送信できます。",
      empty: "このセッションではまだフィードバックがありません。"
    }
  },
  en: {
    close: "Close",
    cancel: "Cancel",
    targetElement: "Target: ",
    targetBox: "Target: selected screen area",
    targetPage: "Target: current page",
    recentReview: "Recent marks",
    recentFeedback: "Recent feedback",
    copyJson: "Copy mark JSON",
    copyJsonTitle: "Copy JSON",
    copied: "Copied",
    copyFailed: "Copy failed",
    persistedReview: "Mark saved.",
    persistedFeedback: "Thank you. Your feedback was sent.",
    localOnly: "Saved locally. Configure an endpoint to persist submissions.",
    review: {
      launcher: "Mark",
      panelTitle: "Mark this page",
      tabPrimary: "Comment",
      tabSecondary: "Ask AI",
      placeholder: "Enter a review comment",
      secondaryPlaceholder: "Describe the change you want AI to make",
      submit: "Save mark",
      helper: "Click a highlighted element, drag an empty area, or save feedback for the entire page.",
      empty: "No marks yet."
    },
    feedback: {
      launcher: "Feedback",
      panelTitle: "Send feedback",
      tabPrimary: "Feedback",
      tabSecondary: "Question",
      placeholder: "Enter feedback about this page",
      secondaryPlaceholder: "Ask a question about this page",
      submit: "Send",
      helper: "Click a highlighted element, drag an empty area, or send feedback for the entire page.",
      empty: "No feedback in this session yet."
    }
  }
}[locale];
const labels = messages[mode];

function applyBaseStyles(element) {
  element.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  element.style.fontSize = "14px";
}

function createLauncher() {
  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.lang = locale;
  launcher.setAttribute("data-markable-launcher", "");
  launcher.textContent = labels.launcher;
  applyBaseStyles(launcher);
  launcher.style.position = "fixed";
  launcher.style.right = "20px";
  launcher.style.bottom = "20px";
  launcher.style.zIndex = "2147483647";
  launcher.style.border = "0";
  launcher.style.borderRadius = "999px";
  launcher.style.padding = "12px 16px";
  launcher.style.background = mode === "feedback" ? "#111827" : "#2563eb";
  launcher.style.color = "#fff";
  launcher.style.boxShadow = "0 14px 36px rgba(0, 0, 0, 0.24)";
  launcher.style.cursor = "pointer";
  return launcher;
}

function createPanel() {
  const panel = document.createElement("form");
  panel.lang = locale;
  panel.setAttribute("data-markable-panel", "");
  applyBaseStyles(panel);
  panel.style.position = "fixed";
  panel.style.right = "20px";
  panel.style.bottom = "76px";
  panel.style.zIndex = "2147483647";
  panel.style.display = "none";
  panel.style.background = "#fff";
  panel.style.color = "#111827";
  panel.style.border = "1px solid rgba(17, 24, 39, 0.14)";
  panel.style.padding = "16px";
  panel.style.borderRadius = "18px";
  panel.style.boxShadow = "0 24px 70px rgba(15, 23, 42, 0.28)";
  panel.style.width = "min(392px, calc(100vw - 32px))";
  panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px"><strong data-markable-title data-markable-drag-handle style="font-size:16px;cursor:move;user-select:none">' + labels.panelTitle + '</strong><button type="button" data-markable-close aria-label="' + messages.close + '" style="border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#6b7280">×</button></div><div data-markable-tabs style="display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:999px;background:#f3f4f6;margin-bottom:12px"><button type="button" data-markable-tab="primary" style="border:0;border-radius:999px;padding:8px;background:#fff;color:#111827;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer">' + labels.tabPrimary + '</button><button type="button" data-markable-tab="secondary" style="border:0;border-radius:999px;padding:8px;background:transparent;color:#6b7280;cursor:pointer">' + labels.tabSecondary + '</button></div><p data-markable-target-summary style="margin:0 0 8px;color:#4b5563;font-size:12px">' + labels.helper + '</p><textarea name="message" required data-markable-input style="box-sizing:border-box;width:100%;min-height:104px;border:1px solid #d1d5db;border-radius:12px;padding:10px;resize:vertical"></textarea><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px"><button type="button" data-markable-cancel style="border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer">' + messages.cancel + '</button><div style="display:flex;gap:8px">' + (issueRepo ? '<button type="button" data-markable-issue-submit style="border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:999px;padding:8px 12px;cursor:pointer">' + issueSubmitLabel + '</button>' : '') + '<button type="submit" data-markable-submit style="border:0;background:#2563eb;color:#fff;border-radius:999px;padding:8px 14px;cursor:pointer">' + labels.submit + '</button></div></div><p data-markable-status role="status" style="min-height:16px;margin:8px 0 0;color:#4b5563;font-size:12px"></p>' + poweredByFooter;
  panel.querySelector("[data-markable-input]").placeholder = labels.placeholder;
  return panel;
}

function createOverlay(kind) {
  const overlay = document.createElement("div");
  overlay.setAttribute(kind === "box" ? "data-markable-box" : "data-markable-highlight", "");
  overlay.style.position = "fixed";
  overlay.style.zIndex = "2147483646";
  overlay.style.pointerEvents = "none";
  overlay.style.border = kind === "box" ? "2px dashed #f59e0b" : "2px solid #2563eb";
  overlay.style.background = kind === "box" ? "rgba(245,158,11,.12)" : "rgba(37,99,235,.08)";
  overlay.style.borderRadius = "8px";
  overlay.style.boxShadow = "0 0 0 4px rgba(37, 99, 235, 0.12)";
  overlay.style.display = "none";
  return overlay;
}

function createList() {
  const list = document.createElement("aside");
  list.lang = locale;
  list.setAttribute("data-markable-list", "");
  applyBaseStyles(list);
  list.style.position = "fixed";
  list.style.left = "20px";
  list.style.bottom = "20px";
  list.style.zIndex = "2147483645";
  list.style.width = "min(320px, calc(100vw - 40px))";
  list.style.maxHeight = "40vh";
  list.style.overflow = "auto";
  list.style.display = "none";
  list.style.border = "1px solid rgba(17,24,39,.14)";
  list.style.borderRadius = "16px";
  list.style.background = "rgba(255,255,255,.96)";
  list.style.boxShadow = "0 18px 46px rgba(15,23,42,.18)";
  list.style.padding = "10px";
  return list;
}

function isMarkableElement(element) {
  return Boolean(element?.closest?.("[data-markable-launcher], [data-markable-panel], [data-markable-highlight], [data-markable-box], [data-markable-list]"));
}

function selectorFor(element) {
  if (element.id) return "#" + cssEscape(element.id);
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (!parent) { parts.unshift(tag); break; }
    const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
    parts.unshift(siblings.length === 1 ? tag : tag + ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")");
    current = parent;
  }
  return parts.join(" > ");
}
function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&"); }
function rectObject(rect) { return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }

function elementTarget(element) {
  const rect = element.getBoundingClientRect();
  return { kind: "dom_element", locator: { tag: element.tagName.toLowerCase(), selector: selectorFor(element), dataMarkableId: element.getAttribute("data-markable-id") || undefined, id: element.id || undefined, classes: element.classList.length ? Array.from(element.classList).slice(0, 8) : undefined, ariaLabel: element.getAttribute("aria-label") || undefined, role: element.getAttribute("role") || undefined, textSnippet: (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160) || undefined }, rect: rectObject(rect) };
}
function bboxTarget(rect) { return { kind: "bbox", locator: { url: location.href }, rect: rectObject(rect) }; }
function currentPageTarget() { return { kind: "dom_range", locator: { url: location.href } }; }
function currentTarget() { return selectedTarget || currentPageTarget(); }
function context() { return { url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight }, userAgent: navigator.userAgent, markableTab: activeTab, markableLocale: locale }; }

function positionOverlay(targetOverlay, rect) { targetOverlay.style.display = "block"; targetOverlay.style.left = rect.x + "px"; targetOverlay.style.top = rect.y + "px"; targetOverlay.style.width = rect.width + "px"; targetOverlay.style.height = rect.height + "px"; }
function showOverlayFor(element) { positionOverlay(overlay, element.getBoundingClientRect()); }
function hideOverlay(targetOverlay) { targetOverlay.style.display = "none"; }
function isPanelOpen() { return panel.style.display !== "none"; }
function practicalElementFor(element) {
  if (!element || isMarkableElement(element)) return null;
  const marked = element.closest("[data-markable-id]");
  if (marked) return marked;
  return element.closest("button, a, input, textarea, select, label, [role], [aria-label], li, article, section, form");
}
function targetAtPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  return practicalElementFor(element);
}
function rectFromPoints(a, b) { const x = Math.min(a.x, b.x); const y = Math.min(a.y, b.y); return new DOMRect(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y)); }

function setTab(tab) {
  activeTab = tab;
  const input = panel.querySelector("[data-markable-input]");
  input.placeholder = tab === "secondary" ? labels.secondaryPlaceholder : labels.placeholder;
  panel.querySelectorAll("[data-markable-tab]").forEach(button => {
    const active = button.getAttribute("data-markable-tab") === tab;
    button.style.background = active ? "#fff" : "transparent";
    button.style.color = active ? "#111827" : "#6b7280";
    button.style.boxShadow = active ? "0 1px 3px rgba(0,0,0,.08)" : "none";
  });
}
function summarizeTarget(target) {
  if (target?.kind === "dom_element") { const l = target.locator; return messages.targetElement + (l.dataMarkableId || l.id || l.ariaLabel || l.selector || l.tag); }
  if (target?.kind === "bbox") return messages.targetBox;
  return messages.targetPage;
}
function updateSelectedTarget(target) {
  selectedTarget = target || null;
  panel.querySelector("[data-markable-target-summary]").textContent = summarizeTarget(selectedTarget);
}
function updateSelectedElement(element) {
  selectedElement = element || null;
  if (selectedElement) showOverlayFor(selectedElement);
}
function openPanel(target) {
  updateSelectedTarget(target);
  panel.style.display = "block";
  launcher.style.display = "none";
  panel.querySelector("[data-markable-input]").focus();
}
function resetTargeting() { candidateElement = null; selectedElement = null; dragging = false; dragStart = null; selectedTarget = null; hideOverlay(overlay); hideOverlay(boxOverlay); }
function closePanel() { panel.style.display = "none"; launcher.style.display = "block"; resetTargeting(); }
function renderList() {
  list.style.display = annotations.length ? "block" : "none";
  const heading = mode === "feedback" ? messages.recentFeedback : messages.recentReview;
  list.innerHTML = '<strong data-markable-drag-handle style="display:block;margin-bottom:8px;cursor:move;user-select:none">' + heading + '</strong>' + (annotations.length ? annotations.slice(-4).reverse().map(item => '<article style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div style="min-width:0"><p style="margin:0 0 4px;color:#111827">' + escapeHtml(item.message).slice(0, 140) + '</p><small style="color:#6b7280">' + item.target.kind + ' · ' + new Date(item.createdAt).toLocaleTimeString(locale) + '</small></div><button type="button" data-markable-copy-json="' + escapeHtml(item.id) + '" aria-label="' + messages.copyJson + '" title="' + messages.copyJsonTitle + '" style="flex:0 0 auto;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:4px 8px;font-size:12px;line-height:1.2;cursor:pointer">JSON</button></div></article>').join('') : '<p style="margin:0;color:#6b7280">' + labels.empty + '</p>');
}
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])); }
function buildIssueBody(message) {
  const parts = [];
  if (message) { parts.push(message); parts.push(""); parts.push("---"); parts.push(""); }
  parts.push("**Page:** " + location.href);
  parts.push("**Target:** " + summarizeTarget(currentTarget()));
  parts.push("**Viewport:** " + innerWidth + "x" + innerHeight);
  return parts.join("\\n");
}

function makeDraggable(element, options = {}) {
  let drag = null;
  const handleSelector = options.handleSelector;
  element.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    if (handleSelector && !event.target.closest?.(handleSelector)) return;
    if (!handleSelector && event.target.closest?.("button, input, textarea, select, a")) return;
    const rect = element.getBoundingClientRect();
    drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, startX: event.clientX, startY: event.clientY, moved: false };
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  element.addEventListener("pointermove", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxLeft = Math.max(0, innerWidth - element.offsetWidth);
    const maxTop = Math.max(0, innerHeight - element.offsetHeight);
    drag.moved = drag.moved || Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3;
    const left = Math.min(Math.max(0, event.clientX - drag.offsetX), maxLeft);
    const top = Math.min(Math.max(0, event.clientY - drag.offsetY), maxTop);
    element.style.left = left + "px";
    element.style.top = top + "px";
    element.style.right = "auto";
    element.style.bottom = "auto";
  });
  element.addEventListener("pointerup", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    element.releasePointerCapture?.(event.pointerId);
    if (drag.moved) element.dataset.markableSuppressClickUntil = String(Date.now() + 250);
    drag = null;
  });
  element.addEventListener("pointercancel", event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    element.releasePointerCapture?.(event.pointerId);
    drag = null;
  });
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // Fall back for embedded browsers that expose clipboard but reject writes.
    }
  }
  const input = document.createElement("textarea");
  input.value = value;
  input.style.position = "fixed";
  input.style.left = "-9999px";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  return copied;
}

const launcher = document.querySelector("[data-markable-launcher]") || createLauncher();
const panel = document.querySelector("[data-markable-panel]") || createPanel();
const overlay = document.querySelector("[data-markable-highlight]") || createOverlay("element");
const boxOverlay = document.querySelector("[data-markable-box]") || createOverlay("box");
const list = document.querySelector("[data-markable-list]") || createList();
for (const node of [launcher, panel, overlay, boxOverlay, list]) if (!node.isConnected) document.body.append(node);
makeDraggable(launcher);
makeDraggable(panel, { handleSelector: "[data-markable-drag-handle]" });
makeDraggable(list, { handleSelector: "[data-markable-drag-handle]" });
setTab("primary"); renderList();

launcher.addEventListener("click", () => {
  if (Number(launcher.dataset.markableSuppressClickUntil || 0) > Date.now()) return;
  openPanel(null);
});
panel.querySelector("[data-markable-close]").addEventListener("click", closePanel);
panel.querySelector("[data-markable-cancel]").addEventListener("click", closePanel);
panel.querySelectorAll("[data-markable-tab]").forEach(button => button.addEventListener("click", () => setTab(button.getAttribute("data-markable-tab"))));
list.addEventListener("click", async event => {
  const button = event.target.closest?.("[data-markable-copy-json]");
  if (!button) return;
  const annotation = annotations.find(item => item.id === button.getAttribute("data-markable-copy-json"));
  if (!annotation) return;
  try {
    const copied = await copyText(JSON.stringify(annotation, null, 2));
    button.textContent = copied ? messages.copied : messages.copyFailed;
  } catch {
    button.textContent = messages.copyFailed;
  }
  setTimeout(() => { button.textContent = "JSON"; }, 1200);
});

document.addEventListener("pointermove", event => {
  if (!isPanelOpen()) return;
  if (dragging) { positionOverlay(boxOverlay, rectFromPoints(dragStart, { x: event.clientX, y: event.clientY })); return; }
  const element = targetAtPoint(event.clientX, event.clientY);
  if (!element) { candidateElement = null; if (!selectedElement) hideOverlay(overlay); return; }
  candidateElement = element;
  if (selectedElement) return;
  showOverlayFor(element);
}, true);
document.addEventListener("click", event => {
  if (!isPanelOpen()) return;
  const element = targetAtPoint(event.clientX, event.clientY);
  if (!element) return;
  event.preventDefault();
  event.stopPropagation();
  updateSelectedElement(element);
  updateSelectedTarget(elementTarget(element));
}, true);
document.addEventListener("pointerdown", event => {
  if (!isPanelOpen() || isMarkableElement(event.target)) return;
  const element = targetAtPoint(event.clientX, event.clientY);
  if (element) return;
  dragging = true;
  dragStart = { x: event.clientX, y: event.clientY };
  candidateElement = null;
  updateSelectedElement(null);
  hideOverlay(overlay);
  positionOverlay(boxOverlay, new DOMRect(dragStart.x, dragStart.y, 0, 0));
  event.preventDefault();
}, true);
document.addEventListener("pointerup", event => {
  if (!dragging) return;
  dragging = false;
  const rect = rectFromPoints(dragStart, { x: event.clientX, y: event.clientY });
  dragStart = null;
  if (rect.width > 8 && rect.height > 8) {
    updateSelectedTarget(bboxTarget(rect));
  } else {
    hideOverlay(boxOverlay);
  }
}, true);

panel.addEventListener("submit", async event => {
  event.preventDefault();
  const message = String(new FormData(panel).get("message") || "").trim();
  if (!message) return;
  const now = new Date().toISOString();
  const annotation = { id: "mark-" + Math.random().toString(36).slice(2, 10), mode, target: currentTarget(), message, status: "open", context: context(), createdAt: now, updatedAt: now };
  const status = panel.querySelector("[data-markable-status]");
  try {
    const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(annotation) });
    if (!response.ok) throw new Error("Request failed with " + response.status);
    status.textContent = mode === "feedback" ? messages.persistedFeedback : messages.persistedReview;
  } catch (error) {
    console.warn("markable: unable to persist annotation", error, annotation);
    status.textContent = messages.localOnly;
  }
  annotations.push(annotation);
  panel.reset();
  renderList();
  closePanel();
});
if (issueRepo) {
  panel.querySelector("[data-markable-issue-submit]").addEventListener("click", () => {
    const message = String(new FormData(panel).get("message") || "").trim();
    const rawTitle = message.split("\\n")[0].slice(0, 72) || issueTitleDefault;
    window.open("https://github.com/" + issueRepo + "/issues/new?title=" + encodeURIComponent(rawTitle) + "&body=" + encodeURIComponent(buildIssueBody(message)), "_blank", "noopener,noreferrer");
  });
}
`;
}
