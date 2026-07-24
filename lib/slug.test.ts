import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and hyphenates words", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("trims surrounding whitespace", () => {
    expect(slugify("  Trim Me  ")).toBe("trim-me");
  });

  it("drops characters that aren't letters, numbers, space or hyphen", () => {
    expect(slugify("Special!@#Chars")).toBe("specialchars");
    expect(slugify("café crème")).toBe("caf-crme"); // accents removed
  });

  it("collapses runs of spaces and hyphens into one hyphen", () => {
    expect(slugify("multiple   spaces")).toBe("multiple-spaces");
    expect(slugify("a---b")).toBe("a-b");
  });

  it("strips underscores (not in the allowed set)", () => {
    expect(slugify("under_score")).toBe("underscore");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify("--leading and trailing--")).toBe("leading-and-trailing");
  });

  it("keeps numbers", () => {
    expect(slugify("Post 123")).toBe("post-123");
  });

  it("caps length at 80 characters", () => {
    expect(slugify("a".repeat(200)).length).toBe(80);
  });

  it("returns an empty string when nothing survives", () => {
    expect(slugify("!!!")).toBe("");
  });
});
