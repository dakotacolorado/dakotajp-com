import "server-only";
import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { getPage, listPosts } from "./content";
import { SEED_PAGES } from "./seed";

/**
 * Bedrock-backed site assistant. Grounded on the site's own content: the About
 * and Resume pages (small, included in full) plus every published post's
 * AI-generated summary (compact, so the prompt stays cheap as posts accumulate).
 */

const region = process.env.AWS_REGION ?? "us-east-1";
// Overridable so the Haiku version can change without a code deploy.
export const CHAT_MODEL_ID =
  process.env.BEDROCK_MODEL_ID ?? "us.anthropic.claude-3-5-haiku-20241022-v1:0";

const bedrock = new BedrockRuntimeClient({ region });

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function buildSystemPrompt(): Promise<string> {
  const [about, resume, posts] = await Promise.all([
    getPage("about"),
    getPage("resume"),
    listPosts(), // published only
  ]);

  const aboutText = (about ?? SEED_PAGES.about).body;
  const resumeText = (resume ?? SEED_PAGES.resume).body;
  const postLines =
    posts
      .map((p) => `- "${p.title}" (/blog/${p.slug}): ${p.summary ?? p.excerpt}`)
      .join("\n") || "(no posts yet)";

  return [
    "You are a friendly assistant on Dakota James Parker's personal website.",
    "Answer visitor questions about Dakota and this site using ONLY the",
    "information below. If something isn't covered, say you don't know rather",
    "than guessing. Keep answers concise. When a blog post is relevant, name it",
    "and reference its /blog/<slug> path.",
    "",
    "## About",
    aboutText,
    "",
    "## Resume",
    resumeText,
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
