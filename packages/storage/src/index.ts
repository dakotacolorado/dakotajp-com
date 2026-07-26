// @dakotajp/storage — the persistence layer.
//
// DynamoDB repositories over the @dakotajp/core domain model: items in, entities
// out. Shared by the Next server and the Lambdas, so (like core) it stays
// runtime-agnostic — no "server-only", no next/*. Request-scoped concerns
// (reader cookie, admin session) stay in the web app and pass their inputs in.
export * from "./client";
export * from "./posts";
export * from "./pages";
export * from "./versioning";
export * from "./comments";
export * from "./likes";
