# ADR 0003 — Ephemeral state lives off the content table

<!-- Related: ADR 0002 -->

## Context

ADR 0002 put every key family in one table. Rate-limit windows were the one
family that is not content: they are written by unauthenticated visitors, live
120 seconds, and are read by nothing. On the content table they inherit
`RETAIN` and point-in-time recovery, so continuous backups bill for junk that
TTL is about to delete — and the only writes an attacker can drive share a
table with every post and comment.

## Decision

This narrows ADR 0002's "one table" to **one table for domain content**.
Everything else in ADR 0002 stands.

- Content — pages, posts, comments, likes, versions — stays in the content
  table under the key families in `keys.ts`.
- Ephemeral operational state gets its own table: no PITR, `DESTROY` on stack
  delete, TTL required. Rate-limit windows are the first.
- Such a table holds no domain data, is read by nothing outside the module that
  writes it, and owns its key beside that module rather than in `keys.ts`.
- Adding one is a table in the stack plus a grant to only the functions that
  need it — not a new access pattern on the content table.

## Consequences

Buys: attacker-driven writes cannot touch the content table, and backups cover
only data worth restoring.

Costs: a second table name, env var and grant to keep in sync, and a second
physical name that CloudFormation cannot rename in place. "Is this content or
operational state?" is now a question every new key family has to answer.
