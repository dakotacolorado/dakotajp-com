import { excerpt } from "./excerpt";

describe("excerpt", () => {
  it("strips markdown to plain prose", () => {
    const md = "# Title\n\nSome **bold** and `code` and a [link](https://x.io).";
    expect(excerpt(md)).toBe("Title Some bold and code and a link.");
  });

  it("drops fenced code blocks and images", () => {
    const md = "Intro.\n\n```js\nconst x = 1;\n```\n\n![alt](/img.png) End.";
    expect(excerpt(md)).toBe("Intro. End.");
  });

  it("truncates on a word boundary with an ellipsis", () => {
    const long = "word ".repeat(60).trim();
    const out = excerpt(long, 40);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(41);
    expect(out).not.toMatch(/wor…$/); // never mid-word
  });

  it("returns short text unchanged", () => {
    expect(excerpt("Just a line.")).toBe("Just a line.");
  });

  it("handles empty input", () => {
    expect(excerpt("")).toBe("");
  });
});
