/** The "Page" noun — a singleton markdown document (About, Resume). */
export interface Page {
  key: string;
  title: string;
  body: string; // markdown
  version: number;
  updatedAt: string;
}
