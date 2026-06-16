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
import { vitePlus } from "@f12o/markable/vite";
```

## Vite Plus usage

```ts
import { defineConfig } from "vite";
import { vitePlus } from "@f12o/markable/vite";

export default defineConfig({
  plugins: [
    vitePlus({
      mode: process.env.NODE_ENV === "production" ? "feedback" : "review",
      commentsFile: ".markable/comments.json",
      endpoint: "/__markable/comments"
    })
  ]
});
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
