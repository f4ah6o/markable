export function getStyles(): string {
  return `
[data-markable-root] {
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
}

[data-markable-launcher] {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483647;
  border: 0;
  border-radius: 999px;
  padding: 12px 16px;
  background: #2563eb;
  color: #fff;
  box-shadow: 0 14px 36px rgba(0, 0, 0, 0.24);
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.2;
}

[data-markable-launcher][data-markable-mode="feedback"] {
  background: #111827;
}

[data-markable-panel] {
  position: fixed;
  right: 20px;
  bottom: 76px;
  z-index: 2147483647;
  display: none;
  background: #fff;
  color: #111827;
  border: 1px solid rgba(17, 24, 39, 0.14);
  padding: 16px;
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(15, 23, 42, 0.28);
  width: min(392px, calc(100vw - 32px));
  font-family: inherit;
  font-size: 14px;
  box-sizing: border-box;
}

[data-markable-panel] *,
[data-markable-panel] *::before,
[data-markable-panel] *::after {
  box-sizing: border-box;
}

[data-markable-header] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

[data-markable-drag-handle] {
  font-size: 16px;
  cursor: move;
  user-select: none;
}

[data-markable-close] {
  border: 0;
  background: transparent;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  color: #6b7280;
}

[data-markable-tabs] {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border-radius: 999px;
  background: #f3f4f6;
  margin-bottom: 12px;
}

[data-markable-tab] {
  border: 0;
  border-radius: 999px;
  padding: 8px;
  background: transparent;
  color: #6b7280;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}

[data-markable-tab][aria-selected="true"] {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

[data-markable-target-summary] {
  margin: 0 0 8px;
  color: #4b5563;
  font-size: 12px;
}

[data-markable-input] {
  box-sizing: border-box;
  width: 100%;
  min-height: 104px;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  padding: 10px;
  resize: vertical;
  font-family: inherit;
  font-size: 14px;
}

[data-markable-footer] {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

[data-markable-actions] {
  display: flex;
  gap: 8px;
}

[data-markable-cancel],
[data-markable-issue-submit] {
  border: 1px solid #d1d5db;
  background: #fff;
  border-radius: 999px;
  padding: 8px 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}

[data-markable-issue-submit] {
  border-color: #2563eb;
  color: #2563eb;
}

[data-markable-submit] {
  border: 0;
  background: #2563eb;
  color: #fff;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}

[data-markable-status] {
  margin: 8px 0 0;
  min-height: 1.2em;
  color: #4b5563;
  font-size: 12px;
}

[data-markable-powered-by] {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #e5e7eb;
  text-align: right;
  color: #6b7280;
  font-size: 11px;
}

[data-markable-powered-by] a {
  color: #2563eb;
  text-decoration: none;
}

[data-markable-highlight],
[data-markable-box] {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none;
  display: none;
  border-radius: 8px;
}

[data-markable-highlight] {
  border: 2px solid #2563eb;
  background: rgba(37, 99, 235, 0.08);
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12);
}

[data-markable-box] {
  border: 2px dashed #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

[data-markable-list] {
  position: fixed;
  left: 20px;
  bottom: 20px;
  z-index: 2147483645;
  width: min(320px, calc(100vw - 40px));
  max-height: 40vh;
  overflow: auto;
  display: none;
  border: 1px solid rgba(17, 24, 39, 0.14);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18px 46px rgba(15, 23, 42, 0.18);
  padding: 10px;
  font-family: inherit;
  font-size: 14px;
  box-sizing: border-box;
}

[data-markable-list] *,
[data-markable-list] *::before,
[data-markable-list] *::after {
  box-sizing: border-box;
}

[data-markable-list-heading] {
  display: block;
  margin-bottom: 8px;
}

[data-markable-list-item] {
  border-top: 1px solid #e5e7eb;
  padding-top: 8px;
  margin-top: 8px;
}

[data-markable-list-row] {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

[data-markable-list-message] {
  margin: 0 0 4px;
  color: #111827;
  word-break: break-word;
}

[data-markable-list-meta] {
  color: #6b7280;
  font-size: 12px;
}

[data-markable-copy-json] {
  flex: 0 0 auto;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #374151;
  border-radius: 999px;
  padding: 4px 8px;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
}
`;
}
