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
let selectionMode = "browse";
let candidateElement = null;
let selectedTarget = null;

function createControl() {
  const control = document.createElement("div");
  control.setAttribute("data-markable-control", "");
  control.style.position = "fixed";
  control.style.right = "16px";
  control.style.bottom = "16px";
  control.style.zIndex = "2147483647";
  control.style.display = "flex";
  control.style.gap = "4px";
  control.style.padding = "4px";
  control.style.border = "1px solid color-mix(in srgb, CanvasText 30%, transparent)";
  control.style.borderRadius = "999px";
  control.style.background = "Canvas";
  control.style.color = "CanvasText";
  control.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.18)";

  for (const value of ["browse", "element", "text"]) {
    const button = document.createElement("button");
    button.type = "button";
    button.value = value;
    button.textContent = value === "browse" ? "Browse" : value === "element" ? "Select element" : "Select text";
    button.setAttribute("data-markable-mode", value);
    button.style.border = "0";
    button.style.borderRadius = "999px";
    button.style.padding = "6px 10px";
    button.style.background = value === selectionMode ? "Highlight" : "transparent";
    button.style.color = value === selectionMode ? "HighlightText" : "inherit";
    control.append(button);
  }

  return control;
}

function createPanel() {
  const panel = document.createElement("form");
  panel.setAttribute("data-markable-panel", "");
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "64px";
  panel.style.zIndex = "2147483647";
  panel.style.display = "none";
  panel.style.background = "Canvas";
  panel.style.color = "CanvasText";
  panel.style.border = "1px solid color-mix(in srgb, CanvasText 30%, transparent)";
  panel.style.padding = "12px";
  panel.style.borderRadius = "12px";
  panel.style.boxShadow = "0 12px 32px rgba(0, 0, 0, 0.22)";
  panel.style.width = "min(360px, calc(100vw - 32px))";

  const target = document.createElement("p");
  target.setAttribute("data-markable-target-summary", "");
  target.style.margin = "0 0 8px";
  target.style.fontSize = "12px";
  target.textContent = mode === "feedback" ? "Choose an element or selected text to attach feedback." : "Choose a target for your review comment.";

  const textarea = document.createElement("textarea");
  textarea.name = "message";
  textarea.required = true;
  textarea.placeholder = mode === "feedback" ? "Feedback or inquiry" : "Review comment";
  textarea.setAttribute("data-markable-input", "");
  textarea.style.boxSizing = "border-box";
  textarea.style.width = "100%";
  textarea.style.minHeight = "96px";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";
  actions.style.marginTop = "8px";

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  cancel.setAttribute("data-markable-cancel", "");

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Send";
  submit.setAttribute("data-markable-submit", "");

  const status = document.createElement("p");
  status.setAttribute("data-markable-status", "");
  status.setAttribute("role", "status");
  status.style.margin = "8px 0 0";
  status.style.fontSize = "12px";

  actions.append(cancel, submit);
  panel.append(target, textarea, actions, status);
  return panel;
}

function createOverlay() {
  const overlay = document.createElement("div");
  overlay.setAttribute("data-markable-highlight", "");
  overlay.style.position = "fixed";
  overlay.style.zIndex = "2147483646";
  overlay.style.pointerEvents = "none";
  overlay.style.border = "2px solid #2563eb";
  overlay.style.borderRadius = "6px";
  overlay.style.boxShadow = "0 0 0 4px rgba(37, 99, 235, 0.18)";
  overlay.style.display = "none";
  return overlay;
}

function isMarkableElement(element) {
  return Boolean(element?.closest?.("[data-markable-control], [data-markable-panel], [data-markable-highlight]"));
}

function selectorFor(element) {
  if (element.id) return "#" + cssEscape(element.id);
  const parts = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }
    const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
    parts.unshift(siblings.length === 1 ? tag : tag + ":nth-of-type(" + (siblings.indexOf(current) + 1) + ")");
    current = parent;
  }
  return parts.join(" > ");
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function elementTarget(element) {
  const rect = element.getBoundingClientRect();
  const locator = {
    tag: element.tagName.toLowerCase(),
    selector: selectorFor(element),
    dataMarkableId: element.getAttribute("data-markable-id") || undefined,
    id: element.id || undefined,
    classes: element.classList.length ? Array.from(element.classList).slice(0, 8) : undefined,
    ariaLabel: element.getAttribute("aria-label") || undefined,
    role: element.getAttribute("role") || undefined,
    textSnippet: (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160) || undefined
  };
  return {
    kind: "dom_element",
    locator,
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  };
}

function textTarget() {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return {
    kind: "dom_range",
    locator: { url: location.href, startOffset: range.startOffset, endOffset: range.endOffset },
    quote: selection.toString(),
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  };
}

function currentTarget() {
  return selectedTarget || textTarget() || {
    kind: "dom_range",
    locator: { url: location.href },
    quote: undefined
  };
}

function context() {
  return {
    url: location.href,
    title: document.title,
    viewport: { width: innerWidth, height: innerHeight },
    userAgent: navigator.userAgent
  };
}

function setMode(nextMode) {
  selectionMode = nextMode;
  candidateElement = null;
  if (nextMode !== "element") hideOverlay();
  control.querySelectorAll("[data-markable-mode]").forEach(button => {
    const active = button.value === selectionMode;
    button.style.background = active ? "Highlight" : "transparent";
    button.style.color = active ? "HighlightText" : "inherit";
  });
}

function showOverlayFor(element) {
  const rect = element.getBoundingClientRect();
  overlay.style.display = "block";
  overlay.style.left = rect.x + "px";
  overlay.style.top = rect.y + "px";
  overlay.style.width = rect.width + "px";
  overlay.style.height = rect.height + "px";
}

function hideOverlay() {
  overlay.style.display = "none";
}

function targetAtPoint(clientX, clientY) {
  const element = document.elementFromPoint(clientX, clientY);
  if (!element || isMarkableElement(element)) return null;
  return element.closest("[data-markable-id]") || element;
}

function openPanel(target) {
  selectedTarget = target || textTarget();
  const summary = panel.querySelector("[data-markable-target-summary]");
  if (summary) {
    if (selectedTarget?.kind === "dom_element") {
      const locator = selectedTarget.locator;
      summary.textContent = "Feedback target: " + (locator.dataMarkableId || locator.id || locator.ariaLabel || locator.selector || locator.tag);
    } else if (selectedTarget?.quote) {
      summary.textContent = "Feedback target: selected text — “" + selectedTarget.quote.slice(0, 80) + "”";
    } else {
      summary.textContent = "Feedback target: current page";
    }
  }
  panel.style.display = "block";
  panel.querySelector("[data-markable-input]")?.focus();
}

const control = document.querySelector("[data-markable-control]") || createControl();
const panel = document.querySelector("[data-markable-panel]") || createPanel();
const overlay = document.querySelector("[data-markable-highlight]") || createOverlay();

if (!control.isConnected) document.body.append(control);
if (!panel.isConnected) document.body.append(panel);
if (!overlay.isConnected) document.body.append(overlay);

control.addEventListener("click", event => {
  const button = event.target.closest?.("[data-markable-mode]");
  if (!button) return;
  setMode(button.value);
  if (button.value === "text") openPanel(textTarget());
});

panel.querySelector("[data-markable-cancel]")?.addEventListener("click", () => {
  panel.style.display = "none";
  selectedTarget = null;
});

document.addEventListener("pointermove", event => {
  if (selectionMode !== "element") return;
  const element = targetAtPoint(event.clientX, event.clientY);
  if (!element) {
    candidateElement = null;
    hideOverlay();
    return;
  }
  candidateElement = element;
  showOverlayFor(element);
}, true);

document.addEventListener("click", event => {
  if (selectionMode !== "element") return;
  const element = candidateElement || targetAtPoint(event.clientX, event.clientY);
  if (!element) return;
  event.preventDefault();
  event.stopPropagation();
  setMode("browse");
  showOverlayFor(element);
  openPanel(elementTarget(element));
}, true);

panel.addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(panel);
  const message = String(form.get("message") || "");
  const now = new Date().toISOString();
  const annotation = {
    id: "mark-" + Math.random().toString(36).slice(2, 10),
    mode,
    target: currentTarget(),
    message,
    status: "open",
    context: context(),
    createdAt: now,
    updatedAt: now
  };
  const status = panel.querySelector("[data-markable-status]");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(annotation)
    });
    if (!response.ok) throw new Error("Request failed with " + response.status);
    if (status) status.textContent = "Annotation saved.";
    panel.reset();
    panel.style.display = "none";
    selectedTarget = null;
    hideOverlay();
  } catch (error) {
    console.warn("markable: unable to persist annotation", error, annotation);
    if (status) {
      status.textContent = "Captured locally. Configure a remote endpoint to persist feedback on static hosts.";
    }
  }
});
`;
}
