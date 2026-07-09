# markable

[日本語版](README.ja.md)

Make anything markable.

`markable` is a headless interaction layer for attaching structured feedback, review comments, and rewrite annotations to artifacts without changing the existing app implementation.

Two modes:

- dev: developer-oriented review annotations that can be consumed by agents and rewrite tools.
- prod: user-facing feedback and inquiry capture with URL, selection, viewport, and optional context.

## Install

```bash
npm install @f12o/markable
```

Subpath exports are used for integrations:

```ts
import { createMarkable } from "@f12o/markable/core";
import { createDomAdapter } from "@f12o/markable/dom";
import { markable } from "@f12o/markable/vite";
import { normalizeAnnotation } from "@f12o/markable/annotations";
```

## Vite usage

```ts
import { defineConfig } from "vite";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [
    markable({
      mode: process.env.NODE_ENV === "production" ? "feedback" : "review",
      locale: "en",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments",
      // Set to false to hide the default "Powered by Markable" footer link.
      poweredBy: true,
    }),
  ],
});
```

## CLI: dev-only setup

For projects that use Markable only as a developer review tool, the bundled CLI
wires up a safe, development-only configuration:

```bash
pnpm dlx @f12o/markable init
```

`init` adds `@f12o/markable` to `devDependencies`, writes a Markable-owned
`markable.config.ts`, adds a minimal `markable()` plugin call to your existing
`vite.config.*`, and appends `.markable/` to `.gitignore`. The vite config edit
is a byte-range insertion that preserves your formatting, comments, and plugin
order; complex configs are never overwritten — the CLI prints a manual snippet
instead.

```ts
// markable.config.ts (generated)
import { defineMarkableConfig } from "@f12o/markable/config";

export default defineMarkableConfig({
  devOnly: true,
  mode: "review",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
```

With `devOnly: true`, Markable runs under `vite dev` and is excluded from
`vite build`. Running `init` again is idempotent. Two more commands are
available:

```bash
markable doctor    # report the current integration status
markable remove    # undo the CLI-owned edits (only when still unmodified)
markable comments  # list captured annotations as agent-ready markdown
```

The `devOnly` option is also available directly on the plugin
(`markable({ devOnly: true })`), which sets Vite's `apply: "serve"`.

## UI locale

The UI injected by Markable supports English and Japanese. English is the default locale.

```ts
markable({ locale: "en" }); // English, default
markable({ locale: "ja" }); // Japanese
```

Localized strings include the floating launcher, composer, tabs, placeholders, target summaries, recent submission list, copy results, and submission status. The selected locale is also recorded as `context.markableLocale` in submitted annotations.

## Vite+ compatibility

Vite+ is expected to run normal Vite plugins when it loads a Vite-compatible config. `markable` is a standard Vite plugin and does not expose a Vite+-specific API.

Initial compatibility target:

```bash
vp dev
vp build
```

The plugin currently uses standard Vite hooks:

```text
transformIndexHtml
configureServer
resolveId
load
```

## Core idea

```text
artifact
  -> mark target
  -> annotate / comment / feedback
  -> structured event
  -> ticket / JSON / agent input
  -> rewrite / resolve / follow-up
```

`markable` does not own your UI. The core is headless. DOM and Vite integrations provide capture and injection only.

## What annotations contain (for coding agents)

Each element-target annotation carries enough structured context for a coding
agent to identify the screen, locate the corresponding source code, and act on
instructions like "fix this button on the settings screen":

| Locator field | Content | Captured by default in |
| --- | --- | --- |
| `tag`, `id`, `classes`, `role`, `ariaLabel` | Basic identity of the picked element | review & feedback |
| `selector` | CSS path, e.g. `main > form > button:nth-of-type(1)` | review & feedback |
| `textSnippet` | Visible text, first 160 characters | review & feedback |
| `ancestors` | Up to 6 ancestors (tag/id/classes/role), nearest first | review & feedback |
| `attributes` | Whitelisted attributes (`href`, `type`, `name`, `placeholder`, `alt`, `title`, `for`, `aria-*`, `data-*`) | review & feedback |
| `nearestHeading`, `landmark` | Closest preceding heading text and enclosing landmark region (nav/main/section[aria-label]/…) | review & feedback |
| `outerHtml` | Sanitized HTML snippet, ~2 KB — scripts removed, `value`/`style`/secret-looking attributes stripped, password and hidden inputs reduced, textarea content cleared | review only |
| `componentHints` | Framework component names and, in dev builds, `file:line` (React fiber `_debugSource`, Vue `__name`/`__file`, Svelte `__svelte_meta`) | review only |

The annotation context additionally records URL, page title, viewport, user
agent, active tab intent, and UI locale, and page/box targets carry the URL and
selected rectangle as before.

Defaults are mode-aware and overridable per field through the `capture` option
(same shape on the Vite plugin, `markable.config.ts`, and `mountMarkable`):

```ts
markable({
  capture: {
    outerHtml: true,       // opt in for feedback (production) mode
    componentHints: false, // or opt out anywhere
  },
});
```

The browser self-caps the serialized locator at 7 KiB before submitting
(dropping `outerHtml` first and truncating the selector only as a last
resort), staying under the endpoint's 8 KiB locator limit. Custom production
endpoints using `normalizeAnnotation` accept the new fields without changes.

### Reading annotations: `markable comments`

Agents (and humans) can read persisted annotations as markdown without parsing
JSON by hand:

```bash
markable comments                  # agent-ready markdown, all annotations
markable comments --status open    # comma-separated status filter
markable comments --mode feedback --limit 5
markable comments --json           # raw JSON with the same filters
```

Each markdown section contains the message plus every captured locator field:

```text
## 1. mark-6f2… [open] (review) — 2026-07-09T00:00:00.000Z

Make this button primary

- url: https://app.example/settings
- target: dom_element `button` — selector `main > form > button`
- ancestors: main > form
- region: heading "Settings" (h2) · landmark form
- component: SaveButton (src/Settings.tsx:30) [react]
- attributes: type="submit" data-testid="save"
- text: "Save"
- rect: 100×40 @ (10, 20) · viewport 1280×800
```

The comments file defaults to `commentsFile` from `markable.config.*`
(`.markable/comments.json` when unset); use `--file` to point at annotations
exported from a production feedback store.

## Security and data handling

The dev-server comments endpoint validates everything it receives before
touching disk:

- Request bodies are rejected over 256 KB, must be `application/json`, and must
  parse as JSON (413 / 415 / 400 responses).
- Each annotation is checked against the schema — message, mode, and target are
  required, unknown fields are stripped, and string sizes are capped — before it
  is persisted (422 on failure).
- Writes are serialized and atomic (write-to-temp, then rename), so concurrent
  submissions cannot corrupt or drop entries in `comments.json`, and retried
  submissions with a known ID are ignored instead of duplicated.
- Responses carry `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

The same validation is available to custom production endpoints (Cloudflare
Workers, Express, and so on) through a platform-neutral subpath export:

```ts
import { normalizeAnnotation } from "@f12o/markable/annotations";

const result = normalizeAnnotation(await request.json());
if (!result.ok) return new Response(result.error, { status: 422 });
await store.save(result.annotation);
```

Captured context is limited to what the page structurally shows: URL, page
title, viewport size, user agent, active tab intent, UI locale, and — for a
selected element — its tag/selector/classes/text snippet, ancestor chain,
whitelisted attributes, and nearby heading/landmark text (see "What annotations
contain" above). Markable does not read cookies, storage, form values, or
keystrokes: `value` attributes and secret-looking attribute names are always
stripped before serialization, and password/hidden inputs are reduced to their
structural attributes. Sanitized `outerHtml` snippets and framework
`componentHints` (which can expose source file paths from dev builds) are
captured in review mode only unless explicitly enabled for feedback mode via
the `capture` option. Authentication, authorization, and rate limiting for production
feedback endpoints remain the host application's responsibility — the dev
endpoint is intended for local development only, and `devOnly: true` keeps it
(and the injected UI) out of production builds entirely.

See [SECURITY.md](./SECURITY.md) for how to report vulnerabilities.

## Accessibility

The injected panel is announced as a dialog, submission status updates are
exposed through a polite live region, and `Escape` closes the panel and returns
focus to the launcher. Submissions are guarded against double activation while
a save is in flight.

## Current status

The core annotation flow — element, box, and page targeting, review and
feedback modes, English/Japanese locales, dev-server persistence, and the
dev-only CLI — is stable and covered by unit and browser tests in CI.

## Inspiration

The production feedback selection UX is inspired by [`u-ichi/reviewable-html-workbench`](https://github.com/u-ichi/reviewable-html-workbench), particularly its clear review state, contextual highlighting, and visually anchored comments. `markable` generalizes that interaction pattern for production web app feedback while keeping the core package headless.

## Demo app

A lightweight Vue 3 + Vite Todo demo lives in `examples/vite-todo`. It is intentionally small so the markable integration is easy to inspect:

```bash
pnpm install
pnpm build
pnpm --filter @f12o/markable-vite-todo-demo dev
```

The demo config uses the package Vite plugin directly:

```ts
markable({
  mode: "auto",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
```

In Vite development mode, `mode: "auto"` resolves to review mode. Use the floating Mark button to open a composer. Practical page elements highlight automatically as you move over them; click a highlighted element to attach the mark to that DOM element, drag an empty page area to attach it to a rectangular screen region, or save without choosing a target to attach it to the current page. The dev server endpoint writes structured annotation JSON to `.markable/comments.json` inside the demo app.

In production builds, `mode: "auto"` resolves to feedback mode. The floating Feedback button opens a user-facing feedback panel with Feedback and Question tabs, the same automatic element and box targeting behavior, and an in-session list of recent submissions. Captured context includes URL, title, viewport, user agent, the active tab intent, UI locale, and the optional selected element or rectangle.

### shadcn-admin example

A larger React dashboard example lives in `examples/shadcn-admin`. It vendors [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) at commit `e16c87f213a5ba5e45964e9b67c792105ec74d26` and adds the markable Vite plugin so the overlay can be exercised against a realistic shadcn UI:

```bash
pnpm install
pnpm --filter @f12o/markable-shadcn-admin-demo dev
pnpm --filter @f12o/markable-shadcn-admin-demo build
```

The example config uses the same local development endpoint as the Todo demo:

```ts
markable({
  mode: "auto",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
```

In local development, submitted marks are persisted to `examples/shadcn-admin/.markable/comments.json`.

### GitHub Pages deployment

The `Deploy demo to GitHub Pages` workflow builds the package, builds the examples, generates an example index, and publishes the static output to GitHub Pages at:

```text
https://f4ah6o.github.io/markable/
https://f4ah6o.github.io/markable/vue-todo/
https://f4ah6o.github.io/markable/shadcn-admin/
```

The index page is generated from `examples/examples.json` by `scripts/build-pages-index.mjs`, so new examples can be added to the listing by updating the manifest.

GitHub Pages is static hosting, so it can demonstrate the example apps and injected feedback overlay but cannot persist POSTed feedback to `/.markable` or `/.json` files. For public static deployments, treat submitted feedback as local/session-only unless a remote endpoint is configured.

### Cloudflare Workers follow-up

For persistent production feedback, point the markable endpoint at a Worker route such as `/api/feedback`:

```text
browser
  -> markable feedback UI
  -> /api/feedback
  -> Cloudflare Worker
  -> D1, KV, R2, GitHub Issues, a queue, or a webhook
```

That follow-up can keep the static GitHub Pages demo lightweight while adding real storage, notification, or issue creation behind a Worker-backed endpoint.
