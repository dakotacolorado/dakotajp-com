"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ALLOWED_IMAGE_TYPES } from "@dakotajp/core";
import { createUploadUrlAction } from "@/app/actions";
import { prepareImage, altFromFilename } from "@/lib/client/image";

type Mode = "write" | "split" | "preview";

const MODES: { id: Mode; label: string }[] = [
  { id: "write", label: "Write" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Preview" },
];

const ACCEPT = ALLOWED_IMAGE_TYPES.join(",");

/**
 * Markdown textarea with a live preview. GOTCHA: the textarea stays mounted in
 * Preview mode (hidden, not unmounted) so the form always submits its value.
 *
 * Images can be dropped, pasted, or picked. Each one is shrunk in the browser,
 * PUT straight to S3 with a presigned URL, and its markdown spliced in at the
 * caret -- the bytes never pass through the server.
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const textareaClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900";

  /**
   * Splice at the caret, reading it at call time. The upload is awaited first,
   * so a position captured earlier may be stale by now -- and if the field is
   * not focused at all, appending beats overwriting whatever is at index 0.
   */
  function insertAtCaret(snippet: string) {
    const el = textareaRef.current;
    setValue((current) => {
      const at = el && el.selectionStart !== null ? el.selectionStart : current.length;
      const before = current.slice(0, at);
      const after = current.slice(at);
      // Images need their own block; without the breaks markdown folds the
      // image into an adjacent paragraph.
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const trail = after.startsWith("\n") ? "" : "\n";
      return `${before}${lead}${snippet}${trail}${after}`;
    });
  }

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const { blob, contentType } = await prepareImage(file);

      const target = await createUploadUrlAction(contentType, blob.size);
      if ("error" in target) {
        setError(target.error);
        return;
      }

      const res = await fetch(target.uploadUrl, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": contentType },
      });
      if (!res.ok) {
        setError(`Upload failed (${res.status})`);
        return;
      }

      insertAtCaret(`![${altFromFilename(file.name)}](${target.publicUrl})`);
    } catch {
      setError("Upload failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadAll(files: File[]) {
    // Sequential on purpose: each insert reads the caret, and parallel uploads
    // would race to the same position and interleave their markdown.
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      await upload(file);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1 text-xs hover:bg-gray-100 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
          >
            {busy ? "Uploading…" : "Add image"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => {
              void uploadAll(Array.from(e.target.files ?? []));
              // Let the same file be picked twice in a row.
              e.target.value = "";
            }}
          />
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
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className={mode === "split" ? "grid gap-3 md:grid-cols-2" : "block"}>
        <textarea
          ref={textareaRef}
          name={name}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={rows}
          className={`${textareaClass} ${mode === "preview" ? "hidden" : ""} ${
            dragging ? "border-gray-900 dark:border-white" : ""
          }`}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) {
              // Otherwise the browser also pastes the image's filename as text.
              e.preventDefault();
              void uploadAll(files);
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void uploadAll(Array.from(e.dataTransfer.files));
          }}
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
