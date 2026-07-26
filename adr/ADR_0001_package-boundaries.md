# ADR 0001 — Package boundaries and dependency direction

## Context

The domain runs in three places: the Next server, plain-Node Lambdas, and tests.
Whichever runtime touches a rule first tends to claim it, and a rule written
against Next or the AWS SDK cannot be reused or tested anywhere else. No single
file reveals which way a dependency is allowed to point, so the direction erodes
one import at a time.

## Decision

Dependencies point one way: `core` ← `storage` ← (`web`, `lambda`). `cdk`
depends only on packages whose source it bundles.

- `core` holds the domain — entities and pure rules. It imports nothing
  runtime-bound: no `server-only`, no `next/*`, no AWS SDK.
- `storage` owns every DynamoDB access. It stays runtime-agnostic;
  request-scoped values (reader id, admin session) are passed in as parameters,
  never read there.
- `web` and `lambda` are adapters. Business rules do not live in them.
- No package reaches past another's entry point. Deep imports are unavailable.

Enforced by an automated boundary test, not by review.

## Consequences

Buys: the domain is testable without AWS, and one rule runs identically in the
Next server and in a worker.

Costs: request-scoped state must be threaded through call signatures instead of
read where it is needed. A rule only one worker calls still lives in `core`, so
`core` accumulates logic no UI touches.
