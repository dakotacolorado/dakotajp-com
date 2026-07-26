# Architecture Decision Records

ADRs are the source of truth for how this codebase is built. Code comments are
not. If a rule matters, it lives here — a comment explaining why the
architecture is the way it is has no readers and no reviewers, and it rots
silently.

Anyone joining this codebase, human or agent, should be able to read every ADR
in a few minutes and know the rules they must not break. That only works if
there are very few of them and each one is short.

## The bar

Write an ADR only if the decision is all three:

- **Foundational** — code across more than one package depends on it.
- **Expensive to reverse** — undoing it means a migration, not a refactor.
- **Not inferable** — no single file reveals it; you learn it by reading
  everything, or by breaking it.

Everything else is not an ADR. Patterns, conventions, and rationale belong in
the code, expressed as code: a construct, a factory, a boundary test, a type.
If you are tempted to write a document so people follow a convention, build the
mechanism that makes the convention the shortest path instead.

## Limits

Each section has a hard character budget. They are not style guidance — they are
the filter.

| Section | Max characters |
| --- | --- |
| Title | 60 |
| Context | 500 |
| Decision | 800 |
| Consequences | 500 |

**If the decision does not fit the budget, it is not foundational enough to be
an ADR — or it is two ADRs.** Cutting to fit is the point: what survives is the
primitive rule, and the primitive rule is the part that has to be obeyed.

There is no "Alternatives considered" section. It is where narrative
accumulates, and a rejected option is not a rule anyone can follow.

## Writing one

1. Copy [`TEMPLATE.md`](./TEMPLATE.md) to `ADR_<next 4-digit number>_<kebab-slug>.md`.
2. Fill in Context, Decision, Consequences. State the Decision as a rule someone
   can follow: what is now required, and what is now disallowed.
3. Open it as a PR. Authorship, date, and review live in git history, not in the
   document.

Superseding an ADR is a new ADR that says so in its Context. Do not edit a
decision that has already shipped — replace it.
