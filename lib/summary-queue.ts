import "server-only";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

/**
 * Enqueue a post for async AI summarization. Best-effort by design: the queue
 * decouples saving from Bedrock, so a failure to enqueue must never fail the
 * save. Also a no-op when the queue isn't configured (e.g. local dev).
 */

const region = process.env.AWS_REGION ?? "us-east-1";
const QUEUE_URL = process.env.SUMMARY_QUEUE_URL;

const sqs = new SQSClient({ region });

export async function enqueueSummary(slug: string): Promise<void> {
  if (!QUEUE_URL) return; // not configured — skip silently
  try {
    await sqs.send(
      new SendMessageCommand({
        QueueUrl: QUEUE_URL,
        MessageBody: JSON.stringify({ slug }),
      }),
    );
  } catch (err) {
    console.error("Failed to enqueue summary for", slug, err);
  }
}
