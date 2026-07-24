/**
 * Site identity in one place.
 *
 * The wordmark (top-left, footer) and the full name (page metadata, resume)
 * are deliberately separate: the mark wants to be short and the metadata wants
 * to be complete. Changing how the name reads across the whole site is a
 * one-line edit here.
 */
export const SITE = {
  /** Top-left mark. Short reads calmer than complete — the domain carries the "jp". */
  wordmark: "Dakota Parker",

  /** Full name — <title>, description, resume header, copyright. */
  fullName: "Dakota James Parker",

  /** Shown in the footer, where the middle initial quietly makes sense. */
  domain: "dakotajp.com",

  description: "Personal site of Dakota James Parker — writing, work, and résumé.",
} as const;
