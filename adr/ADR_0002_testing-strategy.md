# ADR 0002 — Jest as the unit-test framework, starting at `core`

Implements: #6 · Related: ADR 0001

## Context

There are no automated tests. Verification is lint, build, `cdk synth`, and a
manual smoke against a real table. The backlog (#1, #3, #6) all touch the
persistence model — the code whose bugs are silent, persistent, and expensive.

Testing needs both a framework and a beachhead. ADR 0001 makes `packages/core`
the beachhead: it is the primary data model, and it is pure by construction, so
it tests with no infrastructure — no credentials, no server, no mocks.

## Decision

Use **Jest** as the single unit-test framework across the app, `core`, and the
`infra` summarizer.

- **App / components:** Jest via `next/jest`, which wires the Next SWC compiler
  to transform TS/JSX and mocks CSS, fonts, and images — plus React Testing
  Library and jsdom. This is the officially supported Next path.
- **`core` and other pure packages:** a small standalone Jest config (`ts-jest`),
  since `next/jest` is app-oriented and these are not Next apps.
- A root `npm test` script, run by CI on every PR alongside lint and build.
- First tests target the invariants in `core`: key builders round-trip, mappers
  apply their fallbacks, `DERIVED_FIELDS` stays authoritative.

Jest is chosen over the built-in runner and Vitest primarily for **ubiquity**:
it has the widest ecosystem and the most training-data coverage, which makes
agent-authored tests (this project's working model) more reliable.

## Consequences

- One framework across every layer; agents and contributors already know its
  `expect` API, RTL, and snapshots.
- **Jest does not test async Server Components** (Next's own caveat) — so it
  covers `core`, pure utils, and *synchronous* client components. The rendered
  `app/` pages need E2E (Playwright) or the preview env (#5); that's a separate
  decision. The unit suite is not a substitute for seeing the site.
- `core` carries its own `ts-jest` config, a small duplication versus the app's
  `next/jest` setup, because Node's native TS execution isn't enough for Jest.
- ~5 dev dependencies and a config surface, versus the zero-dependency built-in
  runner.

## Alternatives considered

- **Vitest** — ESM/TS-native, one config across app and `core`, Jest-compatible
  API. Strong fit; chose Jest for ubiquity and agent-test reliability.
- **`node:test`** — zero dependencies and ideal for `core`, but no component/DOM
  story, so it can't be the single framework the app also needs.
