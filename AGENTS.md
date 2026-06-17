# Repository Instructions

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
