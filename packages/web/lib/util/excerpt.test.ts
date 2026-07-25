import { excerpt } from "@/lib/util/excerpt";

describe("excerpt — markdown stripping", () => {
  it("leaves short plain text unchanged", () => {
    expect(excerpt("Hello world")).toBe("Hello world");
  });

  it("removes heading markers", () => {
    expect(excerpt("# Title\n\nBody text")).toBe("Title Body text");
  });

  it("strips emphasis", () => {
    expect(excerpt("This is **bold** and _italic_")).toBe(
      "This is bold and italic",
    );
  });

  it("keeps link text, drops the URL", () => {
    expect(excerpt("See [my site](https://example.com)")).toBe("See my site");
  });

  it("unwraps inline code and removes fenced code", () => {
    expect(excerpt("Run `npm test` now")).toBe("Run npm test now");
    expect(excerpt("Before\n```\ncode here\n```\nAfter")).toBe("Before After");
  });

  it("collapses whitespace", () => {
    expect(excerpt("a\n\n  b   c")).toBe("a b c");
  });

  it("handles empty input", () => {
    expect(excerpt("")).toBe("");
  });
});

describe("excerpt — truncation", () => {
  it("cuts on a word boundary and appends an ellipsis", () => {
    expect(excerpt("alpha beta gamma delta", 12)).toBe("alpha beta…");
  });

  it("hard-cuts when the only word boundary is too early (< 0.6 * max)", () => {
    expect(excerpt("ab cdefghijklmnopqrst", 12)).toBe("ab cdefghijk…");
  });

  it("ends with an ellipsis and respects the max for long input", () => {
    const result = excerpt("word ".repeat(60));
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(181); // 180 + the ellipsis
  });
});
