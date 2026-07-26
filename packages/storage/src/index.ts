// @dakotajp/storage — the persistence layer.
//
// DynamoDB repositories over the @dakotajp/core domain model: items in, entities
// out. Shared by the Next server and the Lambdas, so (like core) it stays
// runtime-agnostic — no "server-only", no next/*. Request-scoped concerns
// (reader cookie, admin session) stay in the web app and pass their inputs in.
//
// `client.ts` is deliberately NOT exported: the DynamoDB client and table name
// are this package's internals. Everything reaching the table goes through one
// of the modules below, so there is no path around the repositories.
export * from "./posts";
export * from "./pages";
export * from "./versioning";
export * from "./comments";
export * from "./likes";
export * from "./ratelimit";
