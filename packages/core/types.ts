/** Content-model types. Pure interfaces — see ADR 0001. */

export interface Page {
  key: string;
  title: string;
  body: string; // markdown
  version: number;
  updatedAt: string;
}

/** Everything the list views need. Deliberately excludes the body. */
export interface PostMeta {
  slug: string;
  title: string;
  published: boolean;
  /** Authored publish date — backdatable, and what the site sorts by. */
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  /** Plain-text opening, derived from the body on save. Always present. */
  excerpt: string;
  tags: string[];
  /** AI-generated. Absent until a summarizer has run over this post. */
  summary?: string;
  /** Body version `summary` was generated from; !== version means stale. */
  summarySourceVersion?: number;
}

export interface Post extends PostMeta {
  body: string; // markdown
}

export interface PostInput {
  title: string;
  body: string;
  published: boolean;
  publishedAt?: string;
  tags?: string[];
}

export interface VersionSummary {
  version: number;
  savedAt: string;
  restoredFrom?: number;
  title: string;
  preview: string;
}
