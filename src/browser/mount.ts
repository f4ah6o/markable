import { createMarkable, type MarkableAdapter, type MarkableAnnotation, type MarkableContext, type MarkableTarget } from "../core";
import { buildAnnotationContext } from "./context";
import { createCaptureState } from "./capture";
import { rectObject } from "./rect";
import { getLabels, getMessages } from "./locale";
import { resolveMountOptions, type MountMarkableOptions, type ResolvedMountOptions } from "./options";
import { getStyles } from "./styles";
import { createUI, escapeHtml } from "./ui";

export type { MountMarkableOptions } from "./options";

export interface MountedMarkable {
  unmount(): void;
}

export function mountMarkable(
  mountTarget: Element | ShadowRoot | undefined,
  options: MountMarkableOptions = {},
): MountedMarkable {
  const resolved = resolveMountOptions(options);
  const { mode, locale } = resolved;
  const messages = getMessages(locale);
  const labels = getLabels(messages, mode);

  const { target, autoCreated } = resolveMountTarget(mountTarget);
  const { container, styleElement, captureRoot, hostElement, hostMarked } = createMountRoot(target, resolved);

  const ui = createUI({
    container,
    mode,
    locale,
    messages,
    labels,
    issueRepo: resolved.issueRepo,
    poweredBy: resolved.poweredBy,
  });

  const capture = createCaptureState({ root: captureRoot, exclude: resolved.captureExclude });

  let selectedTarget: MarkableTarget | null = null;
  let selectedElement: Element | null = null;
  let candidateElement: Element | null = null;
  let dragging = false;
  let dragStart: { x: number; y: number } | null = null;
  let activeTab: "primary" | "secondary" = "primary";
  let annotations: MarkableAnnotation[] = [];

  const getContext = (): MarkableContext => {
    const base: MarkableContext = {
      url: globalThis.location?.href,
      title: document.title,
      viewport: {
        width: globalThis.innerWidth,
        height: globalThis.innerHeight,
      },
      userAgent: globalThis.navigator?.userAgent,
    };

    return buildAnnotationContext(base, resolved.extendContext, locale, activeTab);
  };

  const adapter: MarkableAdapter = {
    getTarget() {
      return selectedTarget ?? capture.pageTarget();
    },
    getContext,
    clearSelection() {
      resetTargeting();
    },
  };

  const runtime = createMarkable({
    mode,
    adapter,
    store: resolved.store,
    idFactory: resolved.idFactory,
    now: resolved.now,
  });

  // Load persisted annotations.
  runtime
    .load()
    .then((loaded) => {
      annotations = loaded;
      renderList();
    })
    .catch((error) => {
      console.warn("markable: failed to load annotations", error);
    });

  makeDraggable(ui.launcher);
  makeDraggable(ui.panel, { handleSelector: "[data-markable-drag-handle]" });
  makeDraggable(ui.list, { handleSelector: "[data-markable-drag-handle]" });
  setTab("primary");
  renderList();

  const listeners: Array<{ target: EventTarget; type: string; listener: EventListener; capture?: boolean }> = [];

  function addListener(
    target: EventTarget,
    type: string,
    listener: EventListener,
    capture = false,
  ) {
    target.addEventListener(type, listener, capture);
    listeners.push({ target, type, listener, capture });
  }

  function isPanelOpen(): boolean {
    return ui.panel.style.display !== "none";
  }

  function openPanel(target?: MarkableTarget): void {
    updateSelectedTarget(target ?? null);
    ui.panel.style.display = "block";
    ui.launcher.style.display = "none";
    ui.input.focus();
  }

  function closePanel(): void {
    ui.panel.style.display = "none";
    ui.launcher.style.display = "block";
    resetTargeting();
  }

  function resetTargeting(): void {
    candidateElement = null;
    selectedElement = null;
    dragging = false;
    dragStart = null;
    selectedTarget = null;
    hideOverlay(ui.overlay);
    hideOverlay(ui.boxOverlay);
  }

  function setTab(tab: "primary" | "secondary"): void {
    activeTab = tab;
    ui.input.placeholder = tab === "secondary" ? labels.secondaryPlaceholder : labels.placeholder;
    for (const button of ui.tabButtons) {
      const active = button.getAttribute("data-markable-tab") === tab;
      button.setAttribute("aria-selected", String(active));
    }
  }

  function summarizeTarget(target: MarkableTarget | null): string {
    if (target?.kind === "dom_element") {
      const locator = target.locator as {
        dataMarkableId?: string;
        id?: string;
        ariaLabel?: string;
        selector?: string;
        tag?: string;
      };
      return messages.targetElement + (locator.dataMarkableId || locator.id || locator.ariaLabel || locator.selector || locator.tag || "");
    }
    if (target?.kind === "bbox") return messages.targetBox;
    return messages.targetPage;
  }

  function updateSelectedTarget(target: MarkableTarget | null): void {
    selectedTarget = target;
    ui.targetSummary.textContent = summarizeTarget(selectedTarget);
  }

  function updateSelectedElement(element: Element | null): void {
    selectedElement = element;
    if (selectedElement) {
      positionOverlay(ui.overlay, selectedElement.getBoundingClientRect());
    }
  }

  function positionOverlay(overlay: HTMLElement, rect: DOMRect): void {
    overlay.style.display = "block";
    overlay.style.left = `${rect.x}px`;
    overlay.style.top = `${rect.y}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }

  function hideOverlay(overlay: HTMLElement): void {
    overlay.style.display = "none";
  }

  function rectFromPoints(a: { x: number; y: number }, b: { x: number; y: number }): DOMRect {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return new DOMRect(x, y, Math.abs(a.x - b.x), Math.abs(a.y - b.y));
  }

  function renderList(): void {
    const hasAnnotations = annotations.length > 0;
    ui.list.style.display = hasAnnotations ? "block" : "none";
    const heading = mode === "feedback" ? messages.recentFeedback : messages.recentReview;

    if (!hasAnnotations) {
      ui.list.innerHTML = `<strong data-markable-drag-handle data-markable-list-heading>${escapeHtml(heading)}</strong><p style="margin:0;color:#6b7280">${escapeHtml(labels.empty)}</p>`;
      return;
    }

    const items = annotations
      .slice(-4)
      .reverse()
      .map((item) => {
        const time = new Date(item.createdAt).toLocaleTimeString(locale);
        return `
          <article data-markable-list-item>
            <div data-markable-list-row>
              <div style="min-width:0">
                <p data-markable-list-message>${escapeHtml(item.message).slice(0, 140)}</p>
                <small data-markable-list-meta>${escapeHtml(item.target.kind)} · ${escapeHtml(time)}</small>
              </div>
              <button type="button" data-markable-copy-json="${escapeHtml(item.id)}" aria-label="${escapeHtml(messages.copyJson)}" title="${escapeHtml(messages.copyJsonTitle)}">JSON</button>
            </div>
          </article>
        `;
      })
      .join("");

    ui.list.innerHTML = `<strong data-markable-drag-handle data-markable-list-heading>${escapeHtml(heading)}</strong>${items}`;
  }

  function buildIssueBody(message: string): string {
    const parts: string[] = [];
    if (message) {
      parts.push(message);
      parts.push("");
      parts.push("---");
      parts.push("");
    }
    parts.push(`**Page:** ${globalThis.location.href}`);
    parts.push(`**Target:** ${summarizeTarget(selectedTarget ?? capture.pageTarget())}`);
    parts.push(`**Viewport:** ${globalThis.innerWidth}x${globalThis.innerHeight}`);
    return parts.join("\n");
  }

  // Event handlers.
  addListener(ui.launcher, "click", () => {
    const suppressUntil = Number(ui.launcher.dataset.markableSuppressClickUntil || 0);
    if (suppressUntil > Date.now()) return;
    openPanel();
  });

  addListener(ui.closeButton, "click", closePanel);
  addListener(ui.cancelButton, "click", closePanel);

  for (const button of ui.tabButtons) {
    addListener(button, "click", () => {
      const tab = button.getAttribute("data-markable-tab") as "primary" | "secondary";
      setTab(tab);
    });
  }

  addListener(ui.list, "click", async (event) => {
    const button = (event.target as HTMLElement).closest?.("[data-markable-copy-json]") as HTMLButtonElement | null;
    if (!button) return;
    const id = button.getAttribute("data-markable-copy-json");
    const annotation = annotations.find((item) => item.id === id);
    if (!annotation) return;
    try {
      const copied = await copyText(JSON.stringify(annotation, null, 2));
      button.textContent = copied ? messages.copied : messages.copyFailed;
    } catch {
      button.textContent = messages.copyFailed;
    }
    setTimeout(() => {
      button.textContent = "JSON";
    }, 1200);
  });

  addListener(
    document,
    "pointermove",
    (event) => {
      if (!isPanelOpen()) return;
      const pointer = event as PointerEvent;
      if (dragging && dragStart) {
        positionOverlay(ui.boxOverlay, rectFromPoints(dragStart, { x: pointer.clientX, y: pointer.clientY }));
        return;
      }
      const element = capture.targetAtPoint(pointer.clientX, pointer.clientY);
      if (!element) {
        candidateElement = null;
        if (!selectedElement) hideOverlay(ui.overlay);
        return;
      }
      candidateElement = element;
      if (selectedElement) return;
      positionOverlay(ui.overlay, element.getBoundingClientRect());
    },
    true,
  );

  addListener(
    document,
    "click",
    (event) => {
      if (!isPanelOpen()) return;
      const pointer = event as MouseEvent;
      const element = capture.targetAtPoint(pointer.clientX, pointer.clientY);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      updateSelectedElement(element);
      updateSelectedTarget(capture.elementTarget(element));
    },
    true,
  );

  addListener(
    document,
    "pointerdown",
    (event) => {
      if (!isPanelOpen()) return;
      const pointer = event as PointerEvent;
      if (capture.isExcluded(pointer.target as Element)) return;
      const element = capture.targetAtPoint(pointer.clientX, pointer.clientY);
      if (element) return;
      dragging = true;
      dragStart = { x: pointer.clientX, y: pointer.clientY };
      candidateElement = null;
      updateSelectedElement(null);
      hideOverlay(ui.overlay);
      positionOverlay(ui.boxOverlay, new DOMRect(dragStart.x, dragStart.y, 0, 0));
      event.preventDefault();
    },
    true,
  );

  addListener(
    document,
    "pointerup",
    (event) => {
      if (!dragging || !dragStart) return;
      dragging = false;
      const pointer = event as PointerEvent;
      const rect = rectFromPoints(dragStart, { x: pointer.clientX, y: pointer.clientY });
      dragStart = null;
      if (rect.width > 8 && rect.height > 8) {
        updateSelectedTarget(capture.bboxTarget(rect));
      } else {
        hideOverlay(ui.boxOverlay);
      }
    },
    true,
  );

  addListener(
    document,
    "pointercancel",
    () => {
      if (!dragging) return;
      resetTargeting();
    },
    true,
  );

  addListener(ui.panel, "submit", async (event) => {
    event.preventDefault();
    const message = String(new FormData(ui.panel).get("message") || "").trim();
    if (!message) return;

    ui.status.textContent = "";
    let annotation: MarkableAnnotation;
    let submitted = false;
    try {
      annotation = await runtime.submit(message);
      submitted = true;
      ui.status.textContent = mode === "feedback" ? messages.persistedFeedback : messages.persistedReview;
    } catch (error) {
      console.warn("markable: unable to persist annotation", error);
      ui.status.textContent = messages.localOnly;
      const timestamp = (resolved.now?.() ?? new Date()).toISOString();
      annotation = {
        id: resolved.idFactory?.() ?? defaultId(),
        mode,
        target: selectedTarget ?? capture.pageTarget(),
        message,
        status: "open",
        context: getContext(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    }

    if (submitted) {
      try {
        annotations = await runtime.load();
      } catch (loadError) {
        console.warn("markable: unable to reload annotations", loadError);
        annotations.push(annotation);
      }
    } else {
      annotations.push(annotation);
    }
    renderList();
    ui.panel.reset();
    closePanel();
  });

  if (ui.issueSubmitButton) {
    addListener(ui.issueSubmitButton, "click", () => {
      const message = String(new FormData(ui.panel).get("message") || "").trim();
      const rawTitle = message.split("\n")[0]?.slice(0, 72) || messages.issueTitleDefault;
      const url = `https://github.com/${resolved.issueRepo}/issues/new?title=${encodeURIComponent(rawTitle)}&body=${encodeURIComponent(buildIssueBody(message))}`;
      globalThis.open(url, "_blank", "noopener,noreferrer");
    });
  }

  return {
    unmount() {
      for (const { target, type, listener, capture } of listeners) {
        target.removeEventListener(type, listener, capture ?? false);
      }
      resetTargeting();
      if (container.isConnected) container.remove();
      if (styleElement.isConnected) styleElement.remove();
      if (hostMarked && hostElement && hostElement.isConnected) {
        hostElement.removeAttribute("data-markable-host");
      }
      if (autoCreated && target instanceof Element && target.isConnected) {
        target.remove();
      }
    },
  };
}

function resolveMountTarget(
  mountTarget: Element | ShadowRoot | undefined,
): { target: Element | ShadowRoot; autoCreated: boolean } {
  if (mountTarget) {
    return { target: mountTarget, autoCreated: false };
  }

  const host = document.createElement("div");
  host.id = "markable-host";
  document.body.append(host);
  return { target: host, autoCreated: true };
}

function createMountRoot(
  mountTarget: Element | ShadowRoot,
  resolved: ResolvedMountOptions,
): {
  root: Element | ShadowRoot;
  container: HTMLElement;
  styleElement: HTMLStyleElement;
  captureRoot: Document | ShadowRoot;
  hostElement: Element | null;
  hostMarked: boolean;
} {
  if (mountTarget instanceof ShadowRoot) {
    const container = document.createElement("div");
    container.setAttribute("data-markable-root", "");
    mountTarget.appendChild(container);
    const styleElement = injectStyles(mountTarget);
    const hostElement = mountTarget.host ?? null;
    const hostMarked = hostElement !== null && !hostElement.hasAttribute("data-markable-host");
    if (hostMarked) {
      hostElement.setAttribute("data-markable-host", "");
    }
    return { root: mountTarget, container, styleElement, captureRoot: mountTarget, hostElement, hostMarked };
  }

  const styleIsolation = resolved.styleIsolation;
  const hostMarked = styleIsolation === "shadow" && !mountTarget.hasAttribute("data-markable-host");
  if (hostMarked) {
    mountTarget.setAttribute("data-markable-host", "");
  }

  if (styleIsolation === "shadow") {
    const shadowRoot = mountTarget.shadowRoot ?? mountTarget.attachShadow({ mode: "open" });
    const container = document.createElement("div");
    container.setAttribute("data-markable-root", "");
    shadowRoot.appendChild(container);
    const styleElement = injectStyles(shadowRoot);
    return { root: shadowRoot, container, styleElement, captureRoot: document, hostElement: mountTarget, hostMarked };
  }

  const container = document.createElement("div");
  container.setAttribute("data-markable-root", "");
  mountTarget.appendChild(container);
  const styleElement = injectStyles(mountTarget);
  return { root: mountTarget, container, styleElement, captureRoot: document, hostElement: null, hostMarked: false };
}

function injectStyles(root: Element | ShadowRoot): HTMLStyleElement {
  const style = document.createElement("style");
  style.textContent = getStyles();
  root.prepend(style);
  return style;
}

function defaultId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `mark-${random}`;
}

function makeDraggable(element: HTMLElement, options: { handleSelector?: string } = {}): void {
  let drag: {
    pointerId: number;
    offsetX: number;
    offsetY: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null = null;

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (options.handleSelector && !(event.target as Element).closest?.(options.handleSelector)) return;
    if (!options.handleSelector && (event.target as Element).closest?.("button, input, textarea, select, a")) {
      return;
    }
    const rect = element.getBoundingClientRect();
    drag = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    element.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });

  element.addEventListener("pointermove", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const maxLeft = Math.max(0, globalThis.innerWidth - element.offsetWidth);
    const maxTop = Math.max(0, globalThis.innerHeight - element.offsetHeight);
    drag.moved =
      drag.moved ||
      Math.abs(event.clientX - drag.startX) > 3 ||
      Math.abs(event.clientY - drag.startY) > 3;
    const left = Math.min(Math.max(0, event.clientX - drag.offsetX), maxLeft);
    const top = Math.min(Math.max(0, event.clientY - drag.offsetY), maxTop);
    element.style.left = `${left}px`;
    element.style.top = `${top}px`;
    element.style.right = "auto";
    element.style.bottom = "auto";
  });

  element.addEventListener("pointerup", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    element.releasePointerCapture?.(event.pointerId);
    if (drag.moved) {
      element.dataset.markableSuppressClickUntil = String(Date.now() + 250);
    }
    drag = null;
  });

  element.addEventListener("pointercancel", (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    element.releasePointerCapture?.(event.pointerId);
    drag = null;
  });
}

async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      // fall through
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
