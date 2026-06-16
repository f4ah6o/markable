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
            src: "/@markable/client"
          },
          injectTo: "body"
        }
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
    }
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
    req.on("data", chunk => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendJson(res: NodeJS.WritableStream & { setHeader(name: string, value: string): void; statusCode?: number }, value: unknown) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}

function clientSource(endpoint: string, mode: MarkableMode): string {
  return `
const endpoint = ${JSON.stringify(endpoint)};
const mode = ${JSON.stringify(mode)};

function createButton() {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = mode === "feedback" ? "Feedback" : "Mark";
  button.setAttribute("data-markable-trigger", "");
  button.style.position = "fixed";
  button.style.right = "16px";
  button.style.bottom = "16px";
  button.style.zIndex = "2147483647";
  return button;
}

function createPanel() {
  const panel = document.createElement("form");
  panel.setAttribute("data-markable-panel", "");
  panel.style.position = "fixed";
  panel.style.right = "16px";
  panel.style.bottom = "56px";
  panel.style.zIndex = "2147483647";
  panel.style.display = "none";
  panel.style.background = "Canvas";
  panel.style.color = "CanvasText";
  panel.style.border = "1px solid currentColor";
  panel.style.padding = "8px";
  panel.style.borderRadius = "8px";

  const textarea = document.createElement("textarea");
  textarea.name = "message";
  textarea.required = true;
  textarea.placeholder = mode === "feedback" ? "Feedback or inquiry" : "Review comment";
  textarea.setAttribute("data-markable-input", "");

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Send";
  submit.setAttribute("data-markable-submit", "");

  panel.append(textarea, submit);
  return panel;
}

function currentTarget() {
  const selection = document.getSelection();
  const quote = selection && !selection.isCollapsed ? selection.toString() : undefined;
  return {
    kind: "dom_range",
    locator: { url: location.href },
    quote
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

const trigger = document.querySelector("[data-markable-trigger]") || createButton();
const panel = document.querySelector("[data-markable-panel]") || createPanel();

if (!trigger.isConnected) document.body.append(trigger);
if (!panel.isConnected) document.body.append(panel);

trigger.addEventListener("click", () => {
  panel.style.display = panel.style.display === "none" ? "block" : "none";
});

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
  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(annotation)
  });
  panel.reset();
  panel.style.display = "none";
});
`;
}
