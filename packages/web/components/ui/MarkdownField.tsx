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

/**
 * Deliberately `image/*` and not the allow-list. A phone's camera roll is HEIC,
 * which is not a type the server will sign for -- but the browser re-encodes to
 * WebP before it ever asks. Naming specific types here makes iOS grey out the
 * library and hides the Camera option; the real gate is server-side anyway.
 */
const ACCEPT = "image/*";

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
  /** Last caret position the user set. null until they have touched the field. */
  const caretRef = useRef<number | null>(null);

  const textareaClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm dark:border-gray-700 dark:bg-gray-900";

  /**
   * Splice at the last caret position the user actually put there.
   *
   * Reading selectionStart at call time does not work: tapping "Add image"
   * blurs the textarea, and a field that was never focused reports 0 -- which
   * silently inserts the image above everything already written. That is the
   * normal path on a phone, where nobody taps into the text first. Falls back
   * to appending, which is wrong far less often than prepending.
   */
  function insertAtCaret(snippet: string) {
    setValue((current) => {
      const at = caretRef.current ?? current.length;
      const before = current.slice(0, at);
      const after = current.slice(at);
      // Images need their own block; without the breaks markdown folds the
      // image into an adjacent paragraph.
      const lead = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
      const trail = after.startsWith("\n") ? "" : "\n";
      const next = `${before}${lead}${snippet}${trail}${after}`;
      // Leave the caret after what was just inserted, so a second image does
      // not land on top of the first.
      caretRef.current = before.length + lead.length + snippet.length;
      return next;
    });
  }

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const { blob, contentType } = await prepareImage(file);

      // Reached when the browser could not decode the file, so the original
      // type survived -- HEIC from a camera roll on a browser that cannot read
      // it. The server would reject this anyway; say something useful instead.
      if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(contentType)) {
        setError(
          `This device produced a ${contentType || "file"} the browser could not convert. Try saving it as JPEG first.`,
        );
        return;
      }

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
          onChange={(e) => {
            setValue(e.target.value);
            caretRef.current = e.target.selectionStart;
          }}
          // Covers typing, tapping, and arrow keys in one event, and fires
          // before the button click that blurs the field.
          onSelect={(e) => {
            caretRef.current = (e.target as HTMLTextAreaElement).selectionStart;
          }}
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
