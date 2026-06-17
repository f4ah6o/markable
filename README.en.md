# markable

[日本語](README.md)

Make anything markable.

`markable` is a headless interaction layer for attaching structured feedback, review comments, and rewrite annotations to artifacts without changing the existing app implementation.

It is designed to work in two modes:

- **dev**: developer-oriented review annotations that can be consumed by agents and rewrite tools.
- **prod**: user-facing feedback and inquiry capture with URL, selection, viewport, and optional context.

## Package shape

The intended npm entry point is:

````bash
npm install @f12o/markable
````

Subpath exports are used for integrations:

````ts
import { createMarkable } from "@f12o/markable/core";
import { createDomAdapter } from "@f12o/markable/dom";
import { markable } from "@f12o/markable/vite";
````

## Vite usage

````ts
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
````

## UI locale

The UI injected by Markable supports Japanese and English. Japanese is the default locale.

````ts
markable({ locale: "ja" }); // Japanese, default
markable({ locale: "en" }); // English
````

Localized strings include the floating launcher, composer, tabs, placeholders, target summaries, recent submission list, copy results, and submission status. The selected locale is also recorded as `context.markableLocale` in submitted annotations.

## Vite+ compatibility

Vite+ is expected to run normal Vite plugins when it loads a Vite-compatible config. `markable` keeps the integration as a standard Vite plugin instead of exposing a Vite+-specific API.

Initial compatibility target:

````bash
vp dev
vp build
````

The plugin currently uses standard Vite hooks:

````text
transformIndexHtml
configureServer
resolveId
load
````

## Core idea

````text
artifact
  -> mark target
  -> annotate / comment / feedback
  -> structured event
  -> ticket / JSON / agent input
  -> rewrite / resolve / follow-up
````

`markable` does not own your UI. The core is headless. DOM and Vite integrations provide capture and injection only.

## Current status

Initial scaffold.

## Inspiration

The production feedback selection UX is inspired by [`u-ichi/reviewable-html-workbench`](https://github.com/u-ichi/reviewable-html-workbench), particularly its clear review state, contextual highlighting, and visually anchored comments. `markable` generalizes that interaction pattern for production web app feedback while keeping the core package headless.

## Demo app

A lightweight Vue 3 + Vite Todo demo lives in `examples/vite-todo`. It is intentionally small so the markable integration is easy to inspect:

````bash
pnpm install
pnpm build
pnpm --filter @f12o/markable-vite-todo-demo dev
````

The demo config uses the package Vite plugin directly:

````ts
markable({
  mode: "auto",
  locale: "en",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
````

In Vite development mode, `mode: "auto"` resolves to review mode. Use the floating Mark button to open a composer. Practical page elements highlight automatically as you move over them; click a highlighted element to attach the mark to that DOM element, drag an empty page area to attach it to a rectangular screen region, or save without choosing a target to attach it to the current page. The dev server endpoint writes structured annotation JSON to `.markable/comments.json` inside the demo app.

In production builds, `mode: "auto"` resolves to feedback mode. The floating Feedback button opens a user-facing feedback panel with Feedback and Question tabs, the same automatic element and box targeting behavior, and an in-session list of recent submissions. Captured context includes URL, title, viewport, user agent, the active tab intent, UI locale, and the optional selected element or rectangle.

### shadcn-admin example

A larger React dashboard example lives in `examples/shadcn-admin`. It vendors [`satnaing/shadcn-admin`](https://github.com/satnaing/shadcn-admin) at commit `e16c87f213a5ba5e45964e9b67c792105ec74d26` and adds the markable Vite plugin so the overlay can be exercised against a realistic shadcn UI:

````bash
pnpm install
pnpm --filter @f12o/markable-shadcn-admin-demo dev
pnpm --filter @f12o/markable-shadcn-admin-demo build
````

The example config uses the same local development endpoint as the Todo demo:

````ts
markable({
  mode: "auto",
  locale: "en",
  commentsFile: ".markable/comments.json",
  endpoint: "/__markable/comments",
});
````

In local development, submitted marks are persisted to `examples/shadcn-admin/.markable/comments.json`.

### GitHub Pages deployment

The `Deploy demo to GitHub Pages` workflow builds the package, builds the examples, generates an example index, and publishes the static output to GitHub Pages at:

````text
https://f4ah6o.github.io/markable/
https://f4ah6o.github.io/markable/vue-todo/
https://f4ah6o.github.io/markable/shadcn-admin/
````

The index page is generated from `examples/examples.json` by `scripts/build-pages-index.mjs`, so new examples can be added to the listing by updating the manifest.

GitHub Pages is static hosting, so it can demonstrate the example apps and injected feedback overlay but cannot persist POSTed feedback to `/.markable` or `/.json` files. For public static deployments, treat submitted feedback as local/session-only unless a remote endpoint is configured.

### Cloudflare Workers follow-up

For persistent production feedback, point the markable endpoint at a Worker route such as `/api/feedback`:

````text
browser
  -> markable feedback UI
  -> /api/feedback
  -> Cloudflare Worker
  -> D1, KV, R2, GitHub Issues, a queue, or a webhook
````

That follow-up can keep the static GitHub Pages demo lightweight while adding real storage, notification, or issue creation behind a Worker-backed endpoint.
