# Architecture Decision Records

An ADR records one architectural decision: the context that forced it, the
choice made, and the consequences accepted.

Write one for decisions that are expensive to reverse or easy to erode by
accident — boundaries, data models, cross-cutting conventions. Skip it for
routine implementation the code already makes obvious.

## How to add one

1. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `ADR_<next 4-digit number>_<kebab-slug>.md`.
2. Fill in Context, Decision, and Consequences. Keep it tight — one decision per
   record, no restating the whole system. Link related ones by number.
3. Open it as a PR.
