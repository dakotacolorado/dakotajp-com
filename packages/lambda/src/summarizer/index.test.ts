import type { SQSEvent, SQSRecord } from "aws-lambda";
import { Post } from "@dakotajp/core";

const mockBedrockSend = jest.fn();

jest.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: jest.fn(() => ({ send: mockBedrockSend })),
  ConverseCommand: jest.fn(function ConverseCommand(input: unknown) {
    return { input };
  }),
}));

jest.mock("@dakotajp/storage", () => ({
  getPost: jest.fn(),
  setPostSummary: jest.fn(),
}));

import { getPost, setPostSummary } from "@dakotajp/storage";

const MODEL_ID = "test.model-v1";
// The handler reads BEDROCK_MODEL_ID at import time, so the env has to be set
// before the module is loaded — hence `require` rather than a hoisted `import`.
process.env.BEDROCK_MODEL_ID = MODEL_ID;
const { handler } = require("./index") as typeof import("./index");

const mockGetPost = getPost as jest.MockedFunction<typeof getPost>;
const mockSetPostSummary = setPostSummary as jest.MockedFunction<
  typeof setPostSummary
>;

const post = (over: Partial<ConstructorParameters<typeof Post>[0]> = {}) =>
  Post.from({
    slug: "a-post",
    title: "A post",
    published: true,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 2,
    excerpt: "Opening.",
    tags: [],
    body: "The body of the post.",
    ...over,
  });

/** An SQS event carrying one message body per argument. */
const event = (...bodies: string[]): SQSEvent =>
  ({
    Records: bodies.map(
      (body, i) => ({ messageId: `m${i}`, body }) as SQSRecord,
    ),
  }) as SQSEvent;

const job = (slug: string) => JSON.stringify({ slug });

const bedrockReplies = (text: string | undefined) =>
  mockBedrockSend.mockResolvedValueOnce({
    output: { message: { content: [{ text }] } },
  });

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("summarizer handler", () => {
  it("summarizes a post and stamps the version it summarized", async () => {
    mockGetPost.mockResolvedValueOnce(post());
    bedrockReplies("  A concise summary.  ");

    const res = await handler(event(job("a-post")));

    expect(mockSetPostSummary).toHaveBeenCalledWith(
      "a-post",
      "A concise summary.", // trimmed
      2, // the body version this summary was generated from
    );
    expect(res).toEqual({ batchItemFailures: [] });
  });

  it("sends the post to the configured model, capped and low-temperature", async () => {
    mockGetPost.mockResolvedValueOnce(post({ title: "Hello", body: "Prose." }));
    bedrockReplies("S.");

    await handler(event(job("a-post")));

    expect(mockBedrockSend.mock.calls[0][0].input).toMatchObject({
      modelId: MODEL_ID,
      messages: [
        { role: "user", content: [{ text: "Title: Hello\n\nPost:\nProse." }] },
      ],
      inferenceConfig: { maxTokens: 200, temperature: 0.2 },
    });
    expect(mockBedrockSend.mock.calls[0][0].input.system[0].text).toContain(
      "1–2 sentence summary",
    );
  });

  it("truncates a very long body rather than paying for the whole thing", async () => {
    mockGetPost.mockResolvedValueOnce(post({ body: "x".repeat(20_000) }));
    bedrockReplies("S.");

    await handler(event(job("a-post")));

    const { text } = mockBedrockSend.mock.calls[0][0].input.messages[0].content[0];
    expect(text).toHaveLength("Title: A post\n\nPost:\n".length + 12_000);
  });

  it("skips a post whose summary is already current", async () => {
    // Idempotency: a duplicate delivery or retry must not re-bill Bedrock.
    mockGetPost.mockResolvedValueOnce(
      post({ version: 2, summary: "Already done.", summarySourceVersion: 2 }),
    );

    const res = await handler(event(job("a-post")));

    expect(mockBedrockSend).not.toHaveBeenCalled();
    expect(mockSetPostSummary).not.toHaveBeenCalled();
    expect(res.batchItemFailures).toEqual([]);
  });

  it("re-summarizes when the summary has fallen behind the body", async () => {
    mockGetPost.mockResolvedValueOnce(
      post({ version: 3, summary: "Stale.", summarySourceVersion: 2 }),
    );
    bedrockReplies("Fresh.");

    await handler(event(job("a-post")));

    expect(mockSetPostSummary).toHaveBeenCalledWith("a-post", "Fresh.", 3);
  });

  it("acks a job for a post that was deleted before it ran", async () => {
    mockGetPost.mockResolvedValueOnce(null);

    const res = await handler(event(job("gone")));

    expect(mockBedrockSend).not.toHaveBeenCalled();
    expect(res.batchItemFailures).toEqual([]); // nothing to retry
  });

  it.each([
    ["an empty body", ""],
    ["a whitespace-only body", "   \n\t "],
    ["no body at all", undefined],
  ])("skips a post with %s", async (_label, body) => {
    mockGetPost.mockResolvedValueOnce(post({ body }));

    const res = await handler(event(job("a-post")));

    expect(mockBedrockSend).not.toHaveBeenCalled();
    expect(res.batchItemFailures).toEqual([]);
  });

  it("ignores a message that carries no slug", async () => {
    const res = await handler(event(JSON.stringify({})));

    expect(mockGetPost).not.toHaveBeenCalled();
    expect(res.batchItemFailures).toEqual([]);
  });

  it("fails the message when Bedrock returns nothing usable", async () => {
    mockGetPost.mockResolvedValueOnce(post());
    bedrockReplies("   "); // whitespace trims to empty

    const res = await handler(event(job("a-post")));

    expect(mockSetPostSummary).not.toHaveBeenCalled();
    expect(res.batchItemFailures).toEqual([{ itemIdentifier: "m0" }]);
  });

  it("fails the message on unparseable JSON", async () => {
    const res = await handler(event("not json"));

    expect(res.batchItemFailures).toEqual([{ itemIdentifier: "m0" }]);
  });

  it("fails only the messages that threw, so the batch's successes still ack", async () => {
    mockGetPost
      .mockResolvedValueOnce(post({ slug: "ok-1" }))
      .mockRejectedValueOnce(new Error("DynamoDB is having a day"))
      .mockResolvedValueOnce(post({ slug: "ok-2" }));
    bedrockReplies("One.");
    bedrockReplies("Two.");

    const res = await handler(event(job("ok-1"), job("boom"), job("ok-2")));

    expect(res.batchItemFailures).toEqual([{ itemIdentifier: "m1" }]);
    expect(mockSetPostSummary).toHaveBeenCalledTimes(2);
  });

  it("fails the message when the write-back fails", async () => {
    mockGetPost.mockResolvedValueOnce(post());
    bedrockReplies("A summary.");
    mockSetPostSummary.mockRejectedValueOnce(new Error("ConditionalCheckFailed"));

    const res = await handler(event(job("a-post")));

    expect(res.batchItemFailures).toEqual([{ itemIdentifier: "m0" }]);
  });

  it("returns no failures for an empty batch", async () => {
    await expect(handler(event())).resolves.toEqual({ batchItemFailures: [] });
  });
});

/**
 * `region` is resolved at import time from the ambient environment, so which
 * side of the `??` runs depends on whether AWS_REGION happens to be set — and
 * it is in the deploy workflow but not in CI. Pinning both sides here keeps the
 * lambda's coverage the same number in every environment.
 */
describe("region resolution", () => {
  const loadWith = (region: string | undefined): unknown => {
    const previous = process.env.AWS_REGION;
    if (region === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = region;

    let constructedWith: unknown;
    jest.isolateModules(() => {
      const sdk = require("@aws-sdk/client-bedrock-runtime");
      require("./index");
      constructedWith = (sdk.BedrockRuntimeClient as jest.Mock).mock.calls[0][0];
    });

    if (previous === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = previous;
    return constructedWith;
  };

  it("uses AWS_REGION when the runtime supplies one", () => {
    // Lambda always sets it, so this is the path that actually runs in prod.
    expect(loadWith("eu-west-1")).toEqual({ region: "eu-west-1" });
  });

  it("falls back to us-east-1 when it doesn't", () => {
    expect(loadWith(undefined)).toEqual({ region: "us-east-1" });
  });
});
