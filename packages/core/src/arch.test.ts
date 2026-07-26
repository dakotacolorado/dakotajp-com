import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The core boundary, enforced. `@dakotajp/core` is bundled into the
 * Next server, client components, and the plain-Node summarizer Lambda, so it
 * must never import `server-only`, `next/*`, or an AWS SDK client. This test
 * fails if any source file under `src/` does — a boundary that relies on memory
 * erodes.
 */
const FORBIDDEN = [/(["'])server-only\1/, /(["'])next(\/[^"']*)?\1/, /@aws-sdk\//];

const SRC = __dirname;

/** Every shipped .ts file under src/, recursively. Tests aren't shipped. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    const shipped = entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts");
    return shipped ? [path] : [];
  });
}

describe("core boundary", () => {
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
