# Runbook: scan all content in DynamoDB

Read every content item out of the site table — pages, blog posts, version
snapshots, and comments. Use this to audit what is actually stored, to confirm
a deploy wrote what you expected, or to grab a backup before a destructive
change.

- **Table:** `dakotajp-site` (`TABLE_NAME` in `lib/dynamo.ts`, created by
  `infra/lib/dakotajp-site-stack.ts` with `RemovalPolicy.RETAIN`)
- **Region / account:** `us-east-1` / `326571719118`
- **Keys:** `pk` (partition, string), `sk` (sort, string).
- **Index:** one GSI, `GSI1` (`GSI1PK` / `GSI1SK`), used only for the
  cross-post comment feed — see below.
- **Read cost:** pay-per-request. A full scan of this table is a handful of
  RCUs — safe to run against prod.

## Prerequisites

```bash
aws sts get-caller-identity   # must print account 326571719118
```

If it prints a different account, set `AWS_PROFILE` first. Everything below is
read-only.

## Key layout

Every item lives in one table, distinguished by the `pk` prefix:

| Entity | `pk` | `sk` | Written by |
| --- | --- | --- | --- |
| Page (About, Resume) | `PAGE` | `<key>` | `lib/content.ts` → `savePage` |
| Post metadata (blog) | `POST` | `<slug>` | `lib/content.ts` → `createPost` / `updatePost` |
| Post body | `POSTBODY` | `<slug>` | same, same transaction |
| Version snapshot | `VERSION#PAGE#<key>`, `VERSION#POST#<slug>` | zero-padded version, e.g. `0000000003` | `lib/content.ts` → `commitVersion` |
| Comment | `COMMENT#<slug>` | `<ISO timestamp>#<uuid>` | `lib/comments.ts` → `addComment` |
| Post stats | `POSTSTATS` | `<slug>` | `lib/likes.ts` (likes) + `lib/comments.ts` (commentCount) |
| Like dedupe | `LIKE#<readerId>` | `<slug>#post`, `<slug>#c#<commentId>` | `lib/likes.ts` → toggles |

`POSTSTATS` holds denormalized `{ likes, commentCount }` per post so list views can
sort by them without reading bodies or comment threads. Both are atomic `ADD`
counters — a like is **not** an edit, so it never goes through `commitVersion`
(no version bump, no snapshot) and lives off the `POST` item so a like landing
mid-save can't be clobbered. Comment items carry their own `likes` attribute.
`LIKE#<readerId>` items dedupe one like per anonymous reader (a signed cookie ID)
per target; they're deliberately orphaned when a post is deleted (tiny, harmless).

**Cross-post comment feed (`GSI1`).** Comments are partitioned per post, so the
admin dashboard reads them by recency through a GSI instead: every comment also
carries `GSI1PK = "COMMENT"` and `GSI1SK = <ISO timestamp>`. That gives "newest
across all posts" and "since T" as one query (`lib/comments.ts` →
`listRecentComments` / `countCommentsSince`). A single hot partition is the
accepted trade at this volume. Comments written before the index existed lack
these keys and are invisible to it until backfilled with
`scripts/backfill-comment-gsi.mjs`. Query the feed directly with:

```bash
aws dynamodb query --table-name dakotajp-site --region us-east-1 \
  --index-name GSI1 --no-scan-index-forward --max-items 10 \
  --key-condition-expression 'GSI1PK = :p' \
  --expression-attribute-values '{":p":{"S":"COMMENT"}}' \
  --output json | jq -r '.Items[] | "\(.GSI1SK.S)\t\(.pk.S)\t\(.username.S)"'
```

The `PAGE` / `POST` / `POSTBODY` items are always the *current* version; the
`VERSION#…` items are immutable snapshots of every save. One save writes all of
them in a single transaction, so a `POST` without a matching `POSTBODY` should
never exist.

**A post's body is not on its `POST` item.** Metadata (title, `publishedAt`,
`tags`, `excerpt`, `summary`) and body are separate items so list views can read
every post without reading every body — a query is capped at 1 MB *before*
projection. Scanning for content means looking at `POSTBODY`, not `POST`.

Notable attributes on a `POST` item:

| Attribute | Meaning |
| --- | --- |
| `publishedAt` | Authored date; what the site sorts and displays. May be backdated, so it can differ from `createdAt`. |
| `excerpt` | Plain-text opening, recomputed from the body on every save. Never edit by hand — the next save overwrites it. |
| `tags` | List of strings, lowercased and hyphenated on input. |
| `summary` | AI-generated. Absent until a summarizer has run. |
| `summarySourceVersion` | Body version `summary` was generated from. If it differs from `version`, the summary is stale. |

## 1. Full scan (everything)

```bash
aws dynamodb scan \
  --table-name dakotajp-site \
  --region us-east-1 \
  --output json > /tmp/ddb-scan.json

jq '.Count, .ScannedCount, (.LastEvaluatedKey != null)' /tmp/ddb-scan.json
```

A single `scan` returns at most 1 MB. If the third value is `true`, the result
is truncated — use the paginated form instead:

```bash
aws dynamodb scan \
  --table-name dakotajp-site \
  --region us-east-1 \
  --page-size 100 \
  --output json | jq -s '{Items: map(.Items) | add, Count: map(.Count) | add}' \
  > /tmp/ddb-scan.json
```

(`aws dynamodb scan` paginates automatically and emits one JSON document per
page; the `jq -s` merges them.)

### Grouped summary

```bash
jq -r '
  .Items
  | group_by(.pk.S | sub("#.*$"; "#*"))
  | .[]
  | "== \(.[0].pk.S | sub("#.*$"; "#*"))  (\(length))",
    (.[] | "   \(.pk.S) | \(.sk.S) | v=\(.version.N // "-") | \(.title.S // .username.S // .name.S // "-")")
' /tmp/ddb-scan.json
```

## 2. Scan one entity type

Filter server-side so you only pay for what you read.

Current pages:

```bash
aws dynamodb query --table-name dakotajp-site --region us-east-1 \
  --key-condition-expression 'pk = :pk' \
  --expression-attribute-values '{":pk":{"S":"PAGE"}}' \
  --output json | jq -r '.Items[] | "\(.sk.S)\tv\(.version.N // "-")\t\(.title.S)"'
```

Current posts (including drafts):

```bash
aws dynamodb query --table-name dakotajp-site --region us-east-1 \
  --key-condition-expression 'pk = :pk' \
  --expression-attribute-values '{":pk":{"S":"POST"}}' \
  --output json | jq -r '.Items[] | "\(.sk.S)\tpublished=\(.published.BOOL)\tv\(.version.N // "-")\t\(.publishedAt.S // "-")\t\(.title.S)"'
```

Posts whose AI summary has fallen behind the body:

```bash
aws dynamodb query --table-name dakotajp-site --region us-east-1 \
  --key-condition-expression 'pk = :pk' \
  --expression-attribute-values '{":pk":{"S":"POST"}}' \
  --output json | jq -r '
    .Items[]
    | select(.summary != null and .summarySourceVersion.N != .version.N)
    | "stale: \(.sk.S) — summary of v\(.summarySourceVersion.N), body is v\(.version.N)"'
```

Version history for one entity (newest first):

```bash
aws dynamodb query --table-name dakotajp-site --region us-east-1 \
  --key-condition-expression 'pk = :pk' \
  --expression-attribute-values '{":pk":{"S":"VERSION#POST#hello-world"}}' \
  --no-scan-index-forward \
  --output json | jq -r '.Items[] | "v\(.version.N)\t\(.savedAt.S)\trestoredFrom=\(.restoredFrom.N // "-")"'
```

Comments on one post:

```bash
aws dynamodb query --table-name dakotajp-site --region us-east-1 \
  --key-condition-expression 'pk = :pk' \
  --expression-attribute-values '{":pk":{"S":"COMMENT#hello-world"}}' \
  --output json | jq -r '.Items[] | "\(.createdAt.S)\t\(.username.S)\t\(.message.S)"'
```

All version snapshots across every entity (scan — no way to query a key
prefix):

```bash
aws dynamodb scan --table-name dakotajp-site --region us-east-1 \
  --filter-expression 'begins_with(pk, :p)' \
  --expression-attribute-values '{":p":{"S":"VERSION#"}}' \
  --projection-expression 'pk, sk, version, savedAt, title' \
  --output json | jq -r '.Items[] | "\(.pk.S)\t\(.sk.S)\t\(.savedAt.S)"'
```

> `--filter-expression` runs *after* the read, so it reduces output but not
> read cost. Fine at this table's size.

## 3. Read one post's full body

The body is on the `POSTBODY` item, not `POST`:

```bash
aws dynamodb get-item --table-name dakotajp-site --region us-east-1 \
  --key '{"pk":{"S":"POSTBODY"},"sk":{"S":"hello-world"}}' \
  --output json | jq -r '.Item.body.S'
```

A page's body *is* inline on its own item, since pages are never listed:

```bash
aws dynamodb get-item --table-name dakotajp-site --region us-east-1 \
  --key '{"pk":{"S":"PAGE"},"sk":{"S":"about"}}' \
  --output json | jq -r '.Item.body.S'
```

## 4. Backup before a destructive change

```bash
aws dynamodb scan --table-name dakotajp-site --region us-east-1 \
  --output json > "ddb-backup-$(date +%Y%m%dT%H%M%SZ).json"
```

Keep it out of git — it contains full page and post bodies.

## Interpreting the results

- **A `POST` or `PAGE` item with no `version` attribute** predates the
  versioning code in `lib/content.ts`. It has no `VERSION#…` snapshots; the
  next save through the admin UI writes `version: 1` and its first snapshot.
- **`VERSION#…` items with no matching current item** are orphaned history.
  `deletePost` clears history before deleting the current item, so this only
  happens if a delete was interrupted.
- **A `POST` with no `POSTBODY`** (or the reverse) means a save was not applied
  atomically, which the transaction in `commitVersion` should make impossible.
  Treat it as a real bug, not stale data. Find them with:

  ```bash
  aws dynamodb scan --table-name dakotajp-site --region us-east-1 \
    --output json | jq -r '
      (.Items | map(select(.pk.S == "POST")     | .sk.S)) as $meta
    | (.Items | map(select(.pk.S == "POSTBODY") | .sk.S)) as $body
    | (($meta - $body) | .[] | "missing body: \(.)"),
      (($body - $meta) | .[] | "orphaned body: \(.)")'
  ```
- **Orphaned `COMMENT#<slug>` threads** should no longer appear: `deletePost`
  calls `deleteComments`. Any you find predate that fix (or come from a
  half-finished delete). Find them with:

  ```bash
  aws dynamodb scan --table-name dakotajp-site --region us-east-1 \
    --output json | jq -r '
      (.Items | map(select(.pk.S == "POST") | .sk.S)) as $slugs
      | .Items[] | select(.pk.S | startswith("COMMENT#"))
      | select((.pk.S | sub("^COMMENT#"; "")) as $s | $slugs | index($s) | not)
      | "orphaned: \(.pk.S) | \(.sk.S) | \(.username.S)"'
  ```
- **A `summary` with no `summarySourceVersion`**, or one that doesn't match
  `version`, means the summary describes an older body. That is expected and
  safe — the site keeps showing it until a summarizer refreshes it. See the
  stale-summary query in section 2.

## Last observed state (2026-07-24)

**The table is empty — 0 items.** The site renders entirely from the fallbacks
in `lib/seed.ts` until something is saved in `/admin`.

Earlier the same day it held a `POST`/`hello-world` draft, one comment, and a
legacy `GUESTBOOK` row from the first deploy's smoke test; all have since been
deleted. Nothing has been written since, so there are no `PAGE` items and no
`VERSION#…` snapshots yet. The first admin save of any page or post creates
`version: 1` and its first snapshot.
