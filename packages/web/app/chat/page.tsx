import type { Metadata } from "next";
import { ChatBox } from "@/components/chat/ChatBox";

export const metadata: Metadata = {
  title: "Ask AI",
  description: "Chat with an AI about Dakota James Parker and this site.",
};

export default function ChatPage() {
  return (
    <section>
      <h1 className="mb-2 font-serif text-3xl tracking-tight">Ask AI</h1>
      <p className="mb-8 text-stone-600 dark:text-stone-400">
        A small assistant that knows about this site. Ask it about Dakota or
        any of the writing.
      </p>
      <ChatBox />
    </section>
  );
}
