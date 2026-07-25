// @dakotajp/core — runtime-agnostic DynamoDB data model.
//
// Pure TypeScript only: key builders + entity constants, types, and pure
// mappers. Never import "server-only", next/*, or an instantiated AWS SDK
// client here — this package is bundled into both the Next server and the
// plain-Node summarizer Lambda (see ADR 0001). The shared model moves in in
// PR 2; this stub establishes the package.
export {};
