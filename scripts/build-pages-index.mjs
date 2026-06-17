import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const examplesFile = path.join(root, "examples", "examples.json");
const outputDir = path.join(root, "pages-dist");
const outputFile = path.join(outputDir, "index.html");
const pagesBase = "/markable";

const examples = JSON.parse(await fs.readFile(examplesFile, "utf8"));

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(outputFile, renderPage(examples), "utf8");

function renderPage(items) {
  const cards = items.map(renderCard).join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>markable examples</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f7f7f4;
        --panel: #ffffff;
        --ink: #191a1c;
        --muted: #5f646d;
        --line: #deded8;
        --accent: #246bfe;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        background: var(--bg);
        color: var(--ink);
        font-family:
          Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
          "Segoe UI", sans-serif;
        line-height: 1.5;
      }

      main {
        width: min(1040px, calc(100% - 32px));
        margin: 0 auto;
        padding: 56px 0;
      }

      header {
        margin-bottom: 28px;
      }

      h1 {
        margin: 0 0 8px;
        font-size: clamp(2rem, 4vw, 3.25rem);
        line-height: 1.05;
        letter-spacing: 0;
      }

      header p {
        max-width: 680px;
        margin: 0;
        color: var(--muted);
        font-size: 1rem;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
      }

      article {
        display: flex;
        min-height: 260px;
        flex-direction: column;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--panel);
        padding: 20px;
      }

      h2 {
        margin: 0 0 8px;
        font-size: 1.25rem;
        letter-spacing: 0;
      }

      .description {
        margin: 0 0 16px;
        color: var(--muted);
      }

      .stack {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 0 0 20px;
        padding: 0;
        list-style: none;
      }

      .stack li {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 4px 8px;
        color: #333840;
        font-size: 0.8125rem;
      }

      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: auto;
      }

      a {
        color: inherit;
      }

      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px 12px;
        text-decoration: none;
        font-weight: 600;
      }

      .button.primary {
        border-color: var(--accent);
        background: var(--accent);
        color: #fff;
      }

      .meta {
        margin: 14px 0 0;
        color: var(--muted);
        font-size: 0.8125rem;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>markable examples</h1>
        <p>Runnable examples for trying the markable overlay in small and realistic Vite applications.</p>
      </header>
      <section class="grid" aria-label="Examples">
${cards}
      </section>
    </main>
  </body>
</html>
`;
}

function renderCard(example) {
  const demoHref = `${pagesBase}${example.demoPath}`;
  const stack = example.techStack
    .map((item) => `          <li>${escapeHtml(item)}</li>`)
    .join("\n");
  const sourceLink = example.sourceRepo
    ? `          <a class="button" href="${escapeAttribute(example.sourceRepo)}">Source</a>`
    : "";
  const inspirationLink =
    example.inspirationUrl && example.inspirationUrl !== example.sourceRepo
      ? `          <a class="button" href="${escapeAttribute(example.inspirationUrl)}">Inspiration</a>`
      : "";
  const commit = example.sourceCommit
    ? `        <p class="meta">Pinned source commit: <code>${escapeHtml(example.sourceCommit.slice(0, 12))}</code></p>`
    : "";

  return `        <article>
          <h2>${escapeHtml(example.title)}</h2>
          <p class="description">${escapeHtml(example.description)}</p>
          <ul class="stack">
${stack}
          </ul>
          <div class="actions">
            <a class="button primary" href="${escapeAttribute(demoHref)}">Open demo</a>
${sourceLink}
${inspirationLink}
          </div>
${commit}
        </article>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
