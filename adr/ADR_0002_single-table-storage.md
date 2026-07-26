# ADR 0002 — One DynamoDB table, keys owned by storage

<!-- Related: ADR 0001 -->

## Context

Pages, posts, comments, likes, version snapshots and rate-limit windows all
share one table. The `pk`/`sk` shapes are the contract between every reader and
writer — the Next server, the summarizer worker, the admin dashboard. A key
constructed outside the repositories is invisible to the code that has to read
it back, and a colliding prefix is invisible until it corrupts live data.

## Decision

One table. String `pk` and `sk`, on-demand billing, retained on stack delete.

- Every access goes through a repository in `storage`. Nothing outside
  `storage` constructs a key or holds a DynamoDB client.
- An entity's body lives in its own item, so list queries never read bodies.
- Counters live on their own item and move only by atomic `ADD` — never
  read-modify-write.
- Derived fields (an AI summary and its source version) carry across saves but
  are never written into a version snapshot.
- A new access pattern is a new key family or a GSI, added in `storage`. Not an
  ad-hoc query from a page or a handler.
- Every list read handles the 1 MB query cap. A truncated page is a wrong
  answer, not a smaller one.

## Consequences

Buys: single-round-trip reads, atomic multi-item writes, and one place to change
when the layout changes.

Costs: adding an access pattern always means touching `storage`. One table is
one blast radius — a bad key prefix lands on live data, and the physical table
name cannot change without replacing the table.
