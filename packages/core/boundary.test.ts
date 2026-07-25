import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ADR 0001's boundary guard, automated. `@dakotajp/core` is bundled into both
 * the Next server and the plain-Node summarizer Lambda, so it must never import
 * `server-only`, `next/*`, or an AWS SDK client. This test fails if any source
 * file does — a boundary that relies on memory erodes.
 */
const FORBIDDEN = [/(["'])server-only\1/, /(["'])next(\/[^"']*)?\1/, /@aws-sdk\//];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .map((f) => join(dir, f));
}

describe("core boundary (ADR 0001)", () => {
  const files = sourceFiles(__dirname);

  it("has source files to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)("%s imports nothing runtime-bound", (file) => {
    // Strip comments so documentation that *names* the forbidden modules
    // (like this file does) doesn't trip the guard — only real code counts.
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const pattern of FORBIDDEN) {
      expect(code).not.toMatch(pattern);
    }
  });
});
