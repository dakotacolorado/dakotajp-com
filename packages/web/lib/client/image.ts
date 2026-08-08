import { MAX_UPLOAD_BYTES } from "@dakotajp/core";

/**
 * Longest edge kept, in pixels. Comfortably above the widest the post column
 * ever renders, with headroom for a 2x display.
 */
const MAX_EDGE = 2000;

/** WebP quality. 0.82 is where the artefacts stop being visible on photos. */
const QUALITY = 0.82;

/**
 * Animation is a sequence of frames; a canvas only ever holds one. Resizing a
 * GIF would silently flatten it to a still, so these upload untouched and are
 * bounded by the size check instead.
 */
const PASS_THROUGH = new Set(["image/gif"]);

export interface PreparedImage {
  blob: Blob;
  contentType: string;
}

/**
 * Shrink an image in the browser before it is uploaded.
 *
 * Markdown renders a plain `<img>`, not `next/image`, so nothing downstream
 * will resize this -- whatever lands in S3 is what every reader downloads. A
 * phone photo is several MB and around 4000px wide, for a column that is never
 * more than about 700px.
 *
 * Falls back to the original bytes if anything here fails. A large image is a
 * worse outcome than a slow one, but both beat no image at all.
 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (PASS_THROUGH.has(file.type)) {
    return { blob: file, contentType: file.type };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));

    // Already small enough, and re-encoding would only lose quality.
    if (scale === 1 && file.size <= MAX_UPLOAD_BYTES / 2) {
      bitmap.close();
      return { blob: file, contentType: file.type };
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, contentType: file.type };
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", QUALITY),
    );
    if (!blob) return { blob: file, contentType: file.type };

    // Re-encoding a small PNG can make it bigger. Keep whichever won.
    if (blob.size >= file.size) return { blob: file, contentType: file.type };

    return { blob, contentType: "image/webp" };
  } catch {
    return { blob: file, contentType: file.type };
  }
}

/** `some-photo.HEIC` -> `some photo`, for alt text worth reading. */
export function altFromFilename(name: string): string {
  return (
    name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || "image"
  );
}
