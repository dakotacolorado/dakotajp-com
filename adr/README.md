# Architecture Decision Records

An ADR records one architectural decision: the context that forced it, the
choice made, and the consequences accepted.

Write one for decisions that are expensive to reverse or easy to erode by
accident — boundaries, data models, cross-cutting conventions. Skip it for
routine implementation the code already makes obvious.

## How to add one

1. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `ADR_<next 4-digit number>_<kebab-slug>.md`.
2. Fill in Context, Decision, and Consequences. Keep it tight — one decision,
   no restating the whole system.
3. Open it as a PR.

## Conventions

- **One decision per record.** Link related ones by number.
- **Immutable once merged.** To change a decision, add a new ADR that supersedes
  the old one; don't rewrite history. Fixing a typo is fine.
- **No status field.** An ADR exists in the codebase only if it was approved —
  proposals live in their PR until then, and rejected ones never land. Presence
  is approval.
- **Authorship, date, and review live in the git history and PR**, not the
  document body.
