/**
 * Manual mock for the DynamoDB client, activated by `jest.mock("./client")`.
 *
 * Every repository in this package reaches the table through `ddb.send`, so
 * swapping this one module lets the real repository logic run — key shapes,
 * command construction, mapping, chunking — against a scripted `send`. Tests
 * assert on the commands it received.
 *
 * The table names deliberately differ from the production defaults so a test
 * asserting on `TableName` proves the code reads the module's value rather than
 * hard-coding one — and so a repository writing to the wrong one of the two is
 * visible in the assertion.
 */
export const TABLE_NAME = "test-table";
export const RATE_LIMIT_TABLE_NAME = "test-ratelimit-table";

export const ddb = { send: jest.fn() };
