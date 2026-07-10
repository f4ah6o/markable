import type { MarkableMode } from "../core";
import type { LocaleMessages, ModeLabels } from "./locale";
import type { ResolvedIssueTarget } from "./options";

export interface UIElements {
  root: HTMLElement;
  launcher: HTMLButtonElement;
  panel: HTMLFormElement;
  overlay: HTMLDivElement;
  boxOverlay: HTMLDivElement;
  list: HTMLElement;
  closeButton: HTMLButtonElement;
  cancelButton: HTMLButtonElement;
  submitButton: HTMLButtonElement;
  issueSubmitButton: HTMLButtonElement | null;
  input: HTMLTextAreaElement;
  targetSummary: HTMLParagraphElement;
  status: HTMLParagraphElement;
  tabButtons: HTMLButtonElement[];
  poweredBy: HTMLElement | null;
}

export interface CreateUIOptions {
  container: HTMLElement;
  mode: MarkableMode;
  locale: string;
  messages: LocaleMessages;
  labels: ModeLabels;
  issueTarget?: ResolvedIssueTarget;
  poweredBy?: boolean;
}

export function createUI(options: CreateUIOptions): UIElements {
  const { container, mode, locale, messages, labels, issueTarget, poweredBy } = options;

  const root = container;

  const launcher = document.createElement("button");
  launcher.type = "button";
  launcher.lang = locale;
  launcher.setAttribute("data-markable-launcher", "");
  launcher.setAttribute("data-markable-mode", mode);
  launcher.setAttribute("aria-haspopup", "dialog");
  launcher.textContent = labels.launcher;

  const panel = document.createElement("form");
  panel.lang = locale;
  panel.style.display = "none";
  panel.setAttribute("data-markable-panel", "");
  panel.setAttribute("data-markable-mode", mode);
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-label", labels.panelTitle);
  panel.noValidate = true;

  const issueSubmitButton = issueTarget ? document.createElement("button") : null;
  if (issueSubmitButton) {
    issueSubmitButton.type = "button";
    issueSubmitButton.setAttribute("data-markable-issue-submit", "");
    issueSubmitButton.textContent = issueTarget?.label ?? messages.issueSubmitLabel;
  }

  const poweredByFooter = poweredBy ? document.createElement("footer") : null;
  if (poweredByFooter) {
    poweredByFooter.setAttribute("data-markable-powered-by", "");
    poweredByFooter.innerHTML =
      'Powered by <a href="https://github.com/f4ah6o/markable/" target="_blank" rel="noopener noreferrer">Markable</a>';
  }

  panel.innerHTML = `
    <div data-markable-header>
      <strong data-markable-drag-handle>${escapeHtml(labels.panelTitle)}</strong>
      <button type="button" data-markable-close aria-label="${escapeHtml(messages.close)}">×</button>
    </div>
    <div data-markable-tabs role="tablist">
      <button type="button" data-markable-tab="primary" role="tab" aria-selected="true">${escapeHtml(labels.tabPrimary)}</button>
      <button type="button" data-markable-tab="secondary" role="tab" aria-selected="false">${escapeHtml(labels.tabSecondary)}</button>
    </div>
    <p data-markable-target-summary>${escapeHtml(labels.helper)}</p>
    <textarea name="message" required maxlength="10000" data-markable-input aria-label="${escapeHtml(labels.placeholder)}"></textarea>
    <div data-markable-footer>
      <button type="button" data-markable-cancel>${escapeHtml(messages.cancel)}</button>
      <div data-markable-actions></div>
    </div>
    <p data-markable-status role="status" aria-live="polite"></p>
  `;

  if (poweredByFooter) {
    panel.appendChild(poweredByFooter);
  }

  const actions = panel.querySelector("[data-markable-actions]") as HTMLDivElement;
  if (issueSubmitButton) {
    actions.appendChild(issueSubmitButton);
  }

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.setAttribute("data-markable-submit", "");
  submitButton.textContent = labels.submit;
  actions.appendChild(submitButton);

  const overlay = createOverlay("element");
  const boxOverlay = createOverlay("box");

  const list = document.createElement("aside");
  list.lang = locale;
  list.setAttribute("data-markable-list", "");

  root.appendChild(launcher);
  root.appendChild(panel);
  root.appendChild(overlay);
  root.appendChild(boxOverlay);
  root.appendChild(list);

  return {
    root,
    launcher,
    panel,
    overlay,
    boxOverlay,
    list,
    closeButton: panel.querySelector("[data-markable-close]") as HTMLButtonElement,
    cancelButton: panel.querySelector("[data-markable-cancel]") as HTMLButtonElement,
    submitButton,
    issueSubmitButton,
    input: panel.querySelector("[data-markable-input]") as HTMLTextAreaElement,
    targetSummary: panel.querySelector("[data-markable-target-summary]") as HTMLParagraphElement,
    status: panel.querySelector("[data-markable-status]") as HTMLParagraphElement,
    tabButtons: Array.from(panel.querySelectorAll("[data-markable-tab]")),
    poweredBy: poweredByFooter,
  };
}

function createOverlay(kind: "element" | "box"): HTMLDivElement {
  const overlay = document.createElement("div");
  overlay.setAttribute(kind === "box" ? "data-markable-box" : "data-markable-highlight", "");
  return overlay;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return char;
    }
  });
}
