# @dakotajp/core

The domain model for **dakotajp.com** — the system's glossary. Entities (`Post`,
`Comment`, `Page`), the pure services that operate on them, and the DynamoDB
schema constants. Everything the site is *about*, in one place.

## Why it's here

`core` is imported by three runtimes: the Next server, **client** components (as
type imports), and the plain-Node Lambdas. So it must stay **runtime-agnostic** —
no `server-only`, no `next/*`, no AWS SDK. That's what lets both the web app and
the workers share one definition of the data instead of drifting apart.
`tst/arch.test.ts` fails the build if any `src/` file breaks that rule.

## Layout

```
src/
  schema.ts        # DynamoDB keys/table constants (cross-cutting)
  version.ts       # VersionSummary (cross-cutting)
  page.ts          # Page entity
  blog/            # the blog sub-domain
    post.ts        # Post entity
    comment.ts     # Comment entity
    comment-tree.ts# buildThread — threading "manager" + sibling comparator
    excerpt.ts     # pure service
tst/               # tests mirror src/
```

Grouped by sub-domain where it earns it (`blog/`); cross-cutting types stay at
the root. Config lives in `package.json` (Jest) and `tsconfig.json`.

## When to use it

- **Import from it** whenever you need a domain type or a domain rule — a `Post`,
  the excerpt derivation, thread assembly. Both `web` and the Lambdas do.
- **Don't** reach past it into persistence: `core` holds the *shapes and rules*,
  not how they're stored. DynamoDB reads/writes live in the storage layer.

## What to add — and the pattern

Entities are classes over a plain `…Props` interface:

- `constructor(props)` + `static from(props)` + `toJSON(): Props` — the
  **RSC-boundary contract**. Entities live server-side; hand `toJSON()` across to
  a client component, rehydrate with `from()`. Keep `Props` plain (no `Date`s, no
  nested instances).
- Behavior that belongs *to* the noun goes on it as **getters/methods**
  (`post.blurb`, `comment.isReply`) — not re-derived at call sites.
- A complex operation over many of a noun is a **service/"manager"** in the same
  sub-domain (`buildThread`), pure and testable.

Add a matching test under `tst/`. Never add `server-only`, `next/*`, or
`@aws-sdk` — the arch test guards it.
