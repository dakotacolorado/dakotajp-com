import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ADR 0001's boundary guard, automated. `@dakotajp/core` is bundled into the
 * Next server, client components, and the plain-Node summarizer Lambda, so it
 * must never import `server-only`, `next/*`, or an AWS SDK client. This test
 * fails if any source file under `src/` does — a boundary that relies on memory
 * erodes.
 */
const FORBIDDEN = [/(["'])server-only\1/, /(["'])next(\/[^"']*)?\1/, /@aws-sdk\//];

const SRC = join(__dirname, "..", "src");

/** Every .ts source file under src/, recursively. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("core boundary (ADR 0001)", () => {
  const files = sourceFiles(SRC);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s imports nothing runtime-bound", (file) => {
    // Strip comments so documentation that *names* the forbidden modules
    // doesn't trip the guard — only real code counts.
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const pattern of FORBIDDEN) {
      expect(code).not.toMatch(pattern);
    }
  });
});
