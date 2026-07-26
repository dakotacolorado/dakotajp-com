import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { DEFAULT_TABLE_NAME } from "@dakotajp/core";

/**
 * `client.ts` resolves its config at import time, so each case re-imports the
 * module in a fresh registry rather than reading a value that was fixed when
 * this file loaded.
 */
function loadClient(env: {
  TABLE_NAME?: string;
  AWS_REGION?: string;
}): typeof import("./client") {
  let mod!: typeof import("./client");
  jest.isolateModules(() => {
    for (const key of ["TABLE_NAME", "AWS_REGION"] as const) {
      if (env[key] === undefined) delete process.env[key];
      else process.env[key] = env[key];
    }
    mod = require("./client");
  });
  return mod;
}

describe("storage client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("falls back to the table the CDK stack creates", () => {
    expect(loadClient({}).TABLE_NAME).toBe(DEFAULT_TABLE_NAME);
  });

  it("lets TABLE_NAME point a runtime at a different table", () => {
    expect(loadClient({ TABLE_NAME: "staging-table" }).TABLE_NAME).toBe(
      "staging-table",
    );
  });

  it("defaults the region to us-east-1 and honours an override", async () => {
    await expect(loadClient({}).ddb.config.region()).resolves.toBe("us-east-1");
    await expect(
      loadClient({ AWS_REGION: "eu-west-1" }).ddb.config.region(),
    ).resolves.toBe("eu-west-1");
  });

  it("exposes a document client, not the raw DynamoDB client", () => {
    // Repositories send plain JS objects, not attribute-value maps — that only
    // works because what they get here is the *document* client. (Compared by
    // name: `isolateModules` reloads the SDK too, so `instanceof` won't match.)
    const { ddb } = loadClient({});
    expect(ddb.constructor.name).toBe(DynamoDBDocumentClient.name);
  });
});
