/**
 * Plain-text excerpt derived from markdown.
 *
 * This is stored on the post's metadata item at save time rather than computed
 * at render time, because the list views deliberately never read post bodies
 * (see the key layout in `content.ts`). It is the fallback the cards show
 * until an AI-generated `summary` exists.
 */

/** Strip markdown down to readable prose. Not a parser — good enough for a card. */
function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ") // fenced code
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → their text
    .replace(/<[^>]+>/g, " ") // raw html
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // heading markers
    .replace(/^\s{0,3}>\s?/gm, "") // blockquote markers
    .replace(/^\s{0,3}[-*+]\s+/gm, "") // bullets
    .replace(/^\s{0,3}\d+\.\s+/gm, "") // ordered list markers
    .replace(/^\s{0,3}([-*_]\s*){3,}$/gm, " ") // horizontal rules
    .replace(/(\*\*|__|\*|_|~~)/g, "") // emphasis
    .replace(/\s+/g, " ")
    .trim();
}

export function excerpt(markdown: string, max = 180): string {
  const text = toPlainText(markdown ?? "");
  if (text.length <= max) return text;
  // Cut on a word boundary so the ellipsis doesn't land mid-word.
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}
