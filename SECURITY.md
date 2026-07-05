# Security Policy

## Supported versions

Only the latest published version of `@f12o/markable` receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub Security Advisories](https://github.com/f4ah6o/markable/security/advisories/new)
rather than opening a public issue. Include the affected version, a
reproduction, and the impact you expect.

You should receive an acknowledgement within a week. Once a fix is available it
will be released as a new version and the advisory will be published.

## Scope notes

- The Vite dev-server endpoint (`/__markable/comments` by default) is intended
  for local development only. It validates and size-caps incoming payloads, but
  it has no authentication — do not expose a dev server to untrusted networks.
- Production feedback endpoints are supplied by the host application.
  Authentication, authorization, and rate limiting there are the host's
  responsibility; `@f12o/markable/annotations` provides reusable payload
  validation for such endpoints.
