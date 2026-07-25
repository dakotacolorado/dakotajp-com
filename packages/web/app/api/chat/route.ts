import { NextResponse } from "next/server";
import { streamChat, type ChatMessage } from "@/lib/services/bedrock";
import { tryAcquire } from "@/lib/services/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 20;
const MAX_LEN = 4000;

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const raw = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: "`messages` is required." }, { status: 400 });
  }

  // Keep only well-formed recent turns; cap length to bound cost.
  const messages: ChatMessage[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    const role = (m as { role?: unknown }).role;
    const content = (m as { content?: unknown }).content;
    if (
      (role === "user" || role === "assistant") &&
      typeof content === "string" &&
      content.trim()
    ) {
      messages.push({ role, content: content.slice(0, MAX_LEN) });
    }
  }
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json(
      { error: "The last message must be from the user." },
      { status: 400 },
    );
  }

  // Global 1 TPS cap on the Bedrock chat API.
  if (!(await tryAcquire("bedrock-chat", 1))) {
    return NextResponse.json(
      { error: "The assistant is busy right now — please try again in a moment." },
      { status: 429 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of streamChat(messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err) {
        console.error("Chat stream error:", err);
        controller.enqueue(
          encoder.encode("\n\n[The assistant ran into an error. Please try again.]"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
