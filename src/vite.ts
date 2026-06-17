import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";
import type { MarkableAnnotation, MarkableMode } from "./core";

export interface MarkableViteOptions {
  mode?: MarkableMode | "auto";
  commentsFile?: string;
  endpoint?: string;
  inject?: boolean;
}

export function markable(options: MarkableViteOptions = {}): Plugin {
  const endpoint = options.endpoint ?? "/__markable/comments";
  const commentsFile = options.commentsFile ?? ".markable/comments.json";
  const inject = options.inject ?? true;
  let root = process.cwd();
  let resolvedMode: MarkableMode = "review";

  return {
    name: "markable",

    configResolved(config) {
      root = config.root;
      resolvedMode = resolveMode(options.mode, config.mode);
    },

    transformIndexHtml() {
      if (!inject) return [];
      return [
        {
          tag: "script",
          attrs: {
            type: "module",
          },
          children: clientSource(endpoint, resolvedMode),
          injectTo: "body",
        },
      ];
    },

    configureServer(server) {
      server.middlewares.use(endpoint, async (req, res) => {
        const file = path.resolve(root, commentsFile);

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
      if (id === "/@markable/client") return id;
    },

    load(id) {
      if (id !== "/@markable/client") return null;
      return clientSource(endpoint, resolvedMode);
    },
  };
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

function clientSource(endpoint: string, mode: MarkableMode): string {
  return `
const endpoint = ${JSON.stringify(endpoint)};
const mode = ${JSON.stringify(mode)};
let candidateElement = null;
let selectedElement = null;
let selectedTarget = null;
let dragging = false;
let dragStart = null;
let activeTab = "primary";
const annotations = [];

const labels = {
  review: {
    launcher: "Mark",
    panelTitle: "Mark this page",
    tabPrimary: "Comment",
    tabSecondary: "Ask AI",
    placeholder: "Leave a review comment",
    submit: "Save mark",
    helper: "Click a highlighted element, drag an empty area, or save general page feedback.",
    empty: "No marks yet."
  },
  feedback: {
    launcher: "Feedback",
    panelTitle: "Send feedback",
    tabPrimary: "Feedback",
    tabSecondary: "Question",
    placeholder: "Share feedback about this page",
    submit: "Send feedback",
    helper: "Click a highlighted element, drag an empty area, or send general page feedback.",
    empty: "No feedback submitted in this session."
  }
}[mode];

function applyBaseStyles(element) {
  element.style.fontFamily = 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  element.style.fontSize = "14px";
}

function createLauncher() {
  const launcher = document.createElement("button");
  launcher.type = "button";
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
  panel.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px"><strong data-markable-title style="font-size:16px">' + labels.panelTitle + '</strong><button type="button" data-markable-close aria-label="Close" style="border:0;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#6b7280">×</button></div><div data-markable-tabs style="display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:999px;background:#f3f4f6;margin-bottom:12px"><button type="button" data-markable-tab="primary" style="border:0;border-radius:999px;padding:8px;background:#fff;color:#111827;box-shadow:0 1px 3px rgba(0,0,0,.08);cursor:pointer">' + labels.tabPrimary + '</button><button type="button" data-markable-tab="secondary" style="border:0;border-radius:999px;padding:8px;background:transparent;color:#6b7280;cursor:pointer">' + labels.tabSecondary + '</button></div><p data-markable-target-summary style="margin:0 0 8px;color:#4b5563;font-size:12px">' + labels.helper + '</p><textarea name="message" required data-markable-input style="box-sizing:border-box;width:100%;min-height:104px;border:1px solid #d1d5db;border-radius:12px;padding:10px;resize:vertical"></textarea><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px"><button type="button" data-markable-cancel style="border:1px solid #d1d5db;background:#fff;border-radius:999px;padding:8px 12px;cursor:pointer">Cancel</button><button type="submit" data-markable-submit style="border:0;background:#2563eb;color:#fff;border-radius:999px;padding:8px 14px;cursor:pointer">' + labels.submit + '</button></div><p data-markable-status role="status" style="min-height:16px;margin:8px 0 0;color:#4b5563;font-size:12px"></p>';
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
function context() { return { url: location.href, title: document.title, viewport: { width: innerWidth, height: innerHeight }, userAgent: navigator.userAgent, markableTab: activeTab }; }

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
  input.placeholder = tab === "secondary" ? (mode === "feedback" ? "Ask a question about this page" : "Describe the AI change you want") : labels.placeholder;
  panel.querySelectorAll("[data-markable-tab]").forEach(button => {
    const active = button.getAttribute("data-markable-tab") === tab;
    button.style.background = active ? "#fff" : "transparent";
    button.style.color = active ? "#111827" : "#6b7280";
    button.style.boxShadow = active ? "0 1px 3px rgba(0,0,0,.08)" : "none";
  });
}
function summarizeTarget(target) {
  if (target?.kind === "dom_element") { const l = target.locator; return "Target: " + (l.dataMarkableId || l.id || l.ariaLabel || l.selector || l.tag); }
  if (target?.kind === "bbox") return "Target: selected screen area";
  return "Target: current page";
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
  list.innerHTML = '<strong style="display:block;margin-bottom:8px">Recent ' + (mode === "feedback" ? "feedback" : "marks") + '</strong>' + (annotations.length ? annotations.slice(-4).reverse().map(item => '<article style="border-top:1px solid #e5e7eb;padding-top:8px;margin-top:8px"><div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px"><div style="min-width:0"><p style="margin:0 0 4px;color:#111827">' + escapeHtml(item.message).slice(0, 140) + '</p><small style="color:#6b7280">' + item.target.kind + ' · ' + new Date(item.createdAt).toLocaleTimeString() + '</small></div><button type="button" data-markable-copy-json="' + escapeHtml(item.id) + '" aria-label="Copy mark JSON" title="Copy JSON" style="flex:0 0 auto;border:1px solid #d1d5db;background:#fff;color:#374151;border-radius:999px;padding:4px 8px;font-size:12px;line-height:1.2;cursor:pointer">JSON</button></div></article>').join('') : '<p style="margin:0;color:#6b7280">' + labels.empty + '</p>');
}
function escapeHtml(value) { return String(value).replace(/[&<>"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char])); }
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
setTab("primary"); renderList();

launcher.addEventListener("click", () => { openPanel(null); });
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
    button.textContent = copied ? "Copied" : "Copy failed";
  } catch {
    button.textContent = "Copy failed";
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
    status.textContent = mode === "feedback" ? "Thanks — feedback sent." : "Mark saved.";
  } catch (error) {
    console.warn("markable: unable to persist annotation", error, annotation);
    status.textContent = "Captured locally. Configure an endpoint to persist it.";
  }
  annotations.push(annotation);
  panel.reset();
  renderList();
  closePanel();
});
`;
}
