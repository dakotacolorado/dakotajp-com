# Runbook: scan all content in DynamoDB

Read every content item out of the site table — pages, blog posts, version
snapshots, and comments. Use this to audit what is actually stored, to confirm
a deploy wrote what you expected, or to grab a backup before a destructive
change.

- **Table:** `dakotajp-site` (`TABLE_NAME` in `lib/dynamo.ts`, created by
  `infra/lib/dakotajp-site-stack.ts` with `RemovalPolicy.RETAIN`)
- **Region / account:** `us-east-1` / `326571719118`
- **Keys:** `pk` (partition, string), `sk` (sort, string). No GSIs.
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
| Post (blog) | `POST` | `<slug>` | `lib/content.ts` → `createPost` / `updatePost` |
| Version snapshot | `VERSION#PAGE#<key>`, `VERSION#POST#<slug>` | zero-padded version, e.g. `0000000003` | `lib/content.ts` → `commitVersion` |
| Comment | `COMMENT#<slug>` | `<ISO timestamp>#<uuid>` | `lib/comments.ts` → `addComment` |

The `PAGE` / `POST` item is always the *current* version; the `VERSION#…`
items are immutable snapshots of every save.

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
  --output json | jq -r '.Items[] | "\(.sk.S)\tpublished=\(.published.BOOL)\tv\(.version.N // "-")\t\(.title.S)"'
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

## 3. Read one item's full body

```bash
aws dynamodb get-item --table-name dakotajp-site --region us-east-1 \
  --key '{"pk":{"S":"POST"},"sk":{"S":"hello-world"}}' \
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
- **`COMMENT#<slug>` items with no matching `POST` item** are expected, not a
  bug you can rule out: `deletePost` (`lib/content.ts`) removes the post and
  its version history but never touches comments. Deleting a post always
  strands its comment thread. Find them with:

  ```bash
  aws dynamodb scan --table-name dakotajp-site --region us-east-1 \
    --output json | jq -r '
      (.Items | map(select(.pk.S == "POST") | .sk.S)) as $slugs
      | .Items[] | select(.pk.S | startswith("COMMENT#"))
      | select((.pk.S | sub("^COMMENT#"; "")) as $s | $slugs | index($s) | not)
      | "orphaned: \(.pk.S) | \(.sk.S) | \(.username.S)"'
  ```
- **`pk = "GUESTBOOK"`** is legacy from the initial deploy smoke test. Nothing
  in the app reads or writes it anymore; it is safe to ignore, and safe to
  delete once you have a backup.

## Last observed state (2026-07-24)

2 items total, no pagination needed:

| `pk` | `sk` | Notes |
| --- | --- | --- |
| `COMMENT#hello-world` | `2026-07-24T09:57:43.916Z#d75c9d9…` | from `chabba` — **orphaned**, its post is gone |
| `GUESTBOOK` | `2026-07-24T09:06:15.588Z#b4ceaec…` | legacy deploy smoke test |

There is currently **no published or draft content in the table at all**:

- No `POST` items. A `POST` / `hello-world` item ("Hello World",
  `published: false`, no `version` attribute — written before the versioning
  code landed) was present at the start of this scan and deleted partway
  through it. Its comment above is the leftover.
- No `PAGE` items — the About and Resume pages have never been saved, so the
  public pages fall back to whatever the app renders for a missing page.
- No `VERSION#…` snapshots — nothing has been written since versioning landed
  in `lib/content.ts`. The first admin save of any page or post creates
  `version: 1` and its first snapshot.
