"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Mode = "write" | "split" | "preview";

const MODES: { id: Mode; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Preview" },
];

/**
 * A markdown textarea with a live preview that renders as you type.
 *
 * The textarea is always mounted (just visually hidden in Preview mode) so its
 * value is always submitted with the form, regardless of the active view.
 */
export function MarkdownField({
  name,
  label = "Content (Markdown)",
  defaultValue = "",
  rows = 22,
}: {
  name: string;
  label?: string;
  defaultValue?: string;
  rows?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [mode, setMode] = useState<Mode>("split");

  const textareaClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="inline-flex overflow-hidden rounded-md border border-gray-300 text-xs dark:border-gray-700">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={mode === m.id}
              className={`px-3 py-1 ${
                mode === m.id
                  ? "bg-gray-900 text-white dark:bg-white dark:text-black"
                  : "hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div
        className={mode === "split" ? "grid gap-3 md:grid-cols-2" : "block"}
      >
        <textarea
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={rows}
          className={`${textareaClass} ${mode === "preview" ? "hidden" : ""}`}
        />

        {mode !== "write" && (
          <div className="markdown min-h-[28rem] overflow-auto rounded-md border border-gray-200 bg-white px-4 py-3 dark:border-gray-800 dark:bg-black">
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            ) : (
              <p className="text-sm text-gray-400">Nothing to preview yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
