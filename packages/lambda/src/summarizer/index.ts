import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getPost, setPostSummary } from "@dakotajp/storage";
import type { SQSEvent, SQSBatchResponse } from "aws-lambda";

/**
 * Summarizer: drains the summary queue, generates an AI summary for a post via
 * Bedrock, and writes it back to the post record. Runs async so a blog save
 * never blocks on (or fails because of) Bedrock — if this errors, SQS retries
 * and eventually parks the message in the DLQ.
 *
 * Idempotent: a job carries only the slug. We summarize the *current* body and
 * stamp its version; if the summary is already current, we skip. That makes
 * retries and duplicate deliveries harmless.
 */

const MODEL_ID = process.env.BEDROCK_MODEL_ID!;
const region = process.env.AWS_REGION ?? "us-east-1";

const bedrock = new BedrockRuntimeClient({ region });

const SYSTEM_PROMPT =
  "You write a concise, factual 1–2 sentence summary of a blog post for use " +
  "as search context and a listing blurb. No preamble, no first person, no " +
  "marketing tone. Return only the summary text.";

async function summarize(title: string, body: string): Promise<string> {
  const res = await bedrock.send(
    new ConverseCommand({
      modelId: MODEL_ID,
      system: [{ text: SYSTEM_PROMPT }],
      messages: [
        {
          role: "user",
          content: [
            { text: `Title: ${title}\n\nPost:\n${body.slice(0, 12000)}` },
          ],
        },
      ],
      inferenceConfig: { maxTokens: 200, temperature: 0.2 },
    }),
  );
  const text = res.output?.message?.content?.[0]?.text?.trim();
  if (!text) throw new Error("Bedrock returned an empty summary");
  return text;
}

async function processSlug(slug: string): Promise<void> {
  const post = await getPost(slug);
  if (!post) return; // post was deleted — nothing to do
  if (post.summarySourceVersion === post.version) return; // already current

  const body = post.body ?? "";
  if (!body.trim()) return;

  const summary = await summarize(post.title, body);
  await setPostSummary(slug, summary, post.version);
}

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const { slug } = JSON.parse(record.body) as { slug?: string };
      if (slug) await processSlug(slug);
    } catch (err) {
      console.error("Failed to summarize", record.body, err);
      // Report only this message as failed so the batch's successes still ack.
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
}
