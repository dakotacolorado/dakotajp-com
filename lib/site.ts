/**
 * Site identity in one place.
 *
 * Two forms of the same name: the mark wants to be quiet, and page titles want
 * to be legible in a browser tab and a search result. Changing how the name
 * reads across the site is a one-line edit here.
 *
 * The middle name is deliberately absent — the domain already carries the "jp".
 */
export const SITE = {
  /** Top-left mark. Lowercase on purpose — reads as a corner of the internet. */
  wordmark: "dakota parker",

  /** <title>, descriptions, anywhere the name is read rather than looked at. */
  name: "Dakota Parker",

  domain: "dakotajp.com",

  /** Public source for this site. */
  repo: "https://github.com/dakotacolorado/dakotajp-com",

  description: "Writing, work, and résumé.",
} as const;
