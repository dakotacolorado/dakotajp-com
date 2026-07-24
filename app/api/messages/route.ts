import { NextResponse } from "next/server";
import { listMessages, addMessage } from "@/lib/messages";

// Always run this route dynamically on the server (never statically cached).
export const dynamic = "force-dynamic";

export async function GET() {
  const messages = await listMessages();
  return NextResponse.json({ messages });
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { name, body } = (payload ?? {}) as {
    name?: unknown;
    body?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "`name` is required." }, { status: 400 });
  }
  if (typeof body !== "string" || body.trim().length === 0) {
    return NextResponse.json({ error: "`body` is required." }, { status: 400 });
  }
  if (name.length > 80 || body.length > 500) {
    return NextResponse.json(
      { error: "`name` must be ≤ 80 chars and `body` ≤ 500 chars." },
      { status: 400 },
    );
  }

  const message = await addMessage({ name: name.trim(), body: body.trim() });
  return NextResponse.json({ message }, { status: 201 });
}
