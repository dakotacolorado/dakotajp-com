# ADR 0004 — Uploaded images are untracked S3 objects

<!-- Related: ADR 0002 -->

## Context

Post images need somewhere to live. The obvious move is an `ASSET` key family
on the content table (ADR 0002) recording type, size and owning post — which
buys a media library, reuse across posts, and cleanup on `deletePost`.

None of that is asked for. What is asked for is putting an image in a post.
A registry is a second source of truth for a fact the markdown already states,
and it can disagree with the body it describes.

## Decision

An upload is an S3 object and nothing else. No DynamoDB item, no entity type,
no `storage/` module. The reference to it exists only as `![alt](/media/...)`
inside the post body.

Orphans are accepted. Deleting a post or removing a tag leaves the object in
place, and nothing sweeps it — a personal blog's orphan rate is a few stray
objects a year against a `RETAIN` bucket that already holds every live image.

Keys are `media/<yyyy>/<mm>/<uuid>.<ext>` — immutable, so a URL always names
the same bytes and CloudFront can cache it indefinitely. The bucket is private;
CloudFront reaches it through Origin Access Control on a `media/*` behaviour,
so uploads share the site's domain and certificate.

## Consequences

Adding an image touches no domain code and cannot corrupt post state. The cost
is that nothing can list, reuse, or garbage-collect an upload: a media-library
UI or a cleanup job would need the registry this rejects, and by then the
existing objects have no metadata to backfill it from. Reversible — the
markdown is the record, and keys are date-partitioned — but not free.
