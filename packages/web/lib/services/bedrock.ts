import "server-only";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getPage, listPosts } from "@dakotajp/storage";
import { SEED_PAGES } from "@/lib/config/seed";

/**
 * Bedrock-backed site assistant, grounded on the About page in full plus each
 * published post's blurb.
 */

const region = process.env.AWS_REGION ?? "us-east-1";
export const CHAT_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";

const bedrock = new BedrockRuntimeClient({ region });

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function buildSystemPrompt(): Promise<string> {
  const [about, posts] = await Promise.all([
    getPage("about"),
    listPosts(), // published only
  ]);

  const aboutText = (about ?? SEED_PAGES.about).body;
  const postLines =
    posts
      .map((p) => `- "${p.title}" (/blog/${p.slug}): ${p.blurb}`)
      .join("\n") || "(no posts yet)";

  return [
    "You are a helpful assistant on Dakota James Parker's personal website.",
    "You are NOT Dakota — always refer to Dakota in the third person (\"Dakota is…\", \"he…\") and never answer in the first person on his behalf.",
    "The About page below is written by Dakota in the first person; translate it to the third person when you answer.",
    "Use ONLY the information below. If something isn't covered, say you don't know rather than guessing.",
    "Keep answers concise. When a blog post is relevant, name it and reference its /blog/<slug> path.",
    "",
    "## About",
    aboutText,
    "",
    "## Blog posts",
    postLines,
  ].join("\n");
}

/** Stream the assistant's reply token-by-token. */
export async function* streamChat(
  messages: ChatMessage[],
): AsyncGenerator<string> {
  const system = await buildSystemPrompt();

  const res = await bedrock.send(
    new ConverseStreamCommand({
      modelId: CHAT_MODEL_ID,
      system: [{ text: system }],
      messages: messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      inferenceConfig: { maxTokens: 800, temperature: 0.3 },
    }),
  );

  if (!res.stream) return;
  for await (const event of res.stream) {
    const text = event.contentBlockDelta?.delta?.text;
    if (text) yield text;
  }
}
