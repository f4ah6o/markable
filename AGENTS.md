# Repository Instructions

## Reading annotations

When acting on screen feedback captured by markable (in this repo or in a host
project), read the annotations with the CLI instead of parsing JSON by hand:

```bash
pnpm exec markable comments --status open   # in a host project
node dist/cli.js comments --cwd <project>   # in this repo, after pnpm build
```

Each markdown section carries the fields needed to map a mark back to source
code. Use them in this order of reliability:

1. `component` — dev-build component names and `file:line`
   (`componentHints.source`) point directly at the source file.
2. `attributes` — `data-testid` and other stable attributes are usually
   greppable verbatim.
3. `region` + `ancestors` — heading/landmark text and the ancestor chain
   identify the screen section; grep for the heading text or landmark label.
4. `selector` / `text` — the CSS path and visible text narrow down the exact
   element within that section.

Feedback-mode (production) annotations omit `outerHtml` and `componentHints`
by default; expect to rely on ancestors/attributes/heading text there.

## Examples

When adding or updating examples, prefer the same workflow used for the current
examples.

- Vendor the referenced implementation into `examples/<example-id>` instead of
  depending on a live remote checkout at build time.
- Pin the source to a concrete upstream commit when the example is based on an
  external repository.
- Keep enough upstream files to make provenance and licensing clear, including
  the upstream `LICENSE` and useful README or attribution files when present.
- Update `examples/examples.json` whenever an example is added, renamed, moved,
  or materially changed.
- Make the reference source traceable from the generated GitHub Pages index by
  filling in `sourceRepo`, `sourceCommit`, and `inspirationUrl` where applicable.
- Respect the upstream license. Do not remove license notices, copyright
  notices, or attribution that the source project requires.
- Configure Vite examples so GitHub Pages can host them side by side under
  `/markable/<example-id>/`.
- Keep generated Pages output such as `pages-dist/` out of the repository.

Before finishing an example change, run the package build, the affected example
build, and `node scripts/build-pages-index.mjs` to verify the generated index can
be produced from `examples/examples.json`.
