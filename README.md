# markable

Make anything markable.

`markable` is a headless interaction layer for attaching structured feedback, review comments, and rewrite annotations to artifacts without changing the existing app implementation.

It is designed to work in two modes:

- **dev**: developer-oriented review annotations that can be consumed by agents and rewrite tools.
- **prod**: user-facing feedback and inquiry capture with URL, selection, viewport, and optional context.

## Package shape

The intended npm entry point is:

```bash
npm install @f12o/markable
```

Subpath exports are used for integrations:

```ts
import { createMarkable } from "@f12o/markable/core";
import { createDomAdapter } from "@f12o/markable/dom";
import { markable } from "@f12o/markable/vite";
```

## Vite usage

```ts
import { defineConfig } from "vite";
import { markable } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [
    markable({
      mode: process.env.NODE_ENV === "production" ? "feedback" : "review",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments",
    }),
  ],
});
```

## Vite+ compatibility

Vite+ is expected to run normal Vite plugins when it loads a Vite-compatible config. `markable` keeps the integration as a standard Vite plugin instead of exposing a Vite+-specific API.

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

## Current status

Initial scaffold.

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

In Vite development mode, `mode: "auto"` resolves to review mode. Select Todo text, click the floating Mark button, and submit a review annotation. The dev server endpoint writes structured annotation JSON to `.markable/comments.json` inside the demo app.

In production builds, `mode: "auto"` resolves to feedback mode. The floating control becomes user-facing feedback UI and captures page context such as URL, title, viewport, user agent, and the optional selected quote.

### GitHub Pages deployment

The `Deploy demo to GitHub Pages` workflow builds the package, builds `examples/vite-todo`, and publishes the static output to GitHub Pages at:

```text
https://f4ah6o.github.io/markable/
```

GitHub Pages is static hosting, so it can demonstrate the Todo app and injected feedback overlay but cannot persist POSTed feedback to `/.markable` or `/.json` files. For public static deployments, treat submitted feedback as local/session-only unless a remote endpoint is configured.

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
