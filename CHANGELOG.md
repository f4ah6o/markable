# Changelog

## 2026.7.0

### Fixed

- Restored box-drag selection over generic containers. The fallback element
  targeting introduced earlier made every element clickable, which also made it
  impossible to start a rectangular selection anywhere inside page content.
  Clicks still fall back to generic elements; drags start wherever no
  interactive or semantic element sits under the pointer.

### Security

- The dev-server comments endpoint now validates annotations against the
  schema before persisting (422 on failure), rejects payloads over 256 KB
  (413), non-JSON content types (415), and malformed JSON bodies (400).
- Comments are written atomically (temp file + rename) and write cycles are
  serialized, so concurrent submissions can no longer corrupt or drop entries.
- Retried submissions with an already-persisted ID are ignored instead of
  duplicated.
- Endpoint responses carry `Cache-Control: no-store` and
  `X-Content-Type-Options: nosniff`; unsupported methods answer 405 with an
  `Allow` header.

### Added

- `@f12o/markable/annotations`: platform-neutral `normalizeAnnotation` so
  custom production endpoints (Workers, Express, …) can reuse the same
  validation as the dev server.
- `createAnnotationId` export in `@f12o/markable/core`; annotation IDs now use
  `crypto.randomUUID` when available.
- CI workflow running typecheck, unit tests, browser tests, and example builds
  on every push and pull request.
- SECURITY.md with a private reporting channel.

### Changed

- Injected panel accessibility: `role="dialog"`, polite live-region status,
  `aria-label`s on the launcher and message field, `Escape` closes the panel
  and returns focus to the launcher.
- Submissions are guarded against double activation while a save is in flight.
- Package metadata: `engines.node >= 20`, `sideEffects: false`, keywords,
  homepage, and bug tracker links.

## 2026.6.3 and earlier

See the git history.
