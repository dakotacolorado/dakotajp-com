# ADR 0001 — Runtime-agnostic `core` data-model package

Implements: #6 · Related: ADR 0002

## Context

The persistence model — DynamoDB key shapes, entity constants, item↔type
mappers — is used from two runtimes: the Next.js server (`lib/`) and the plain
esbuild-bundled summarizer Lambda. Today they don't share it, they duplicate it:
the Lambda hand-copies `pk: "POST"` / `"POSTBODY"` and `summarySourceVersion`,
and the table name is a literal in two files. Nothing keeps them in sync, so a
key-shape change drifts silently and surfaces in production as data written under
the wrong key.

Most of `lib/` cannot be shared: files that begin with `import "server-only"`
throw if bundled outside a Next server, and Next APIs and instantiated AWS
clients are equally runtime-bound. A shared model is only safe if it is kept free
of all of that.

## Decision

Extract the data model into `packages/core`, importable unchanged by the Next
server, the Lambda, CDK, and tests. It is the single source of truth for how data
is shaped and keyed.

`core` **may contain only** key builders and constants, types, and pure mappers
(no I/O).

`core` **must never contain** `import "server-only"`, `next/*`, instantiated AWS
SDK clients, or any load-time side effect. Each consumer builds its own client;
`core` describes shapes, not connections.

Every consumer imports from `core`; the Lambda's hand-copied literals are deleted.
Enforce the boundary with an automated check (lint/CI) — it is easy to violate by
reflex, and a boundary that relies on memory erodes.

## Consequences

- One definition of the table's keys and types; drift becomes a compile error,
  not a production incident.
- `core` is pure and dependency-light, so it is trivially testable — which is why
  testing starts there (ADR 0002).
- Cost: a real constraint contributors must respect (hence the automated guard),
  one more package boundary, and judgment about what is "model" vs. "runtime."

## Alternatives considered

- **Keep duplicating** — silent drift with a production-data blast radius.
- **Share `lib/` with the Lambda** — it's server-bound; bundling it breaks.
- **Codegen the Lambda's model from `lib/`** — a build step and its own drift
  surface.
- **Two git repos** — rejected in #6; would freeze the duplication across a repo
  boundary.
