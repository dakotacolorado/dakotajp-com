/** The blog domain's "Post" noun and its projections. */

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

/** What an author supplies when creating/updating a post. */
export interface PostInput {
  title: string;
  body: string;
  published: boolean;
  publishedAt?: string;
  tags?: string[];
}

/** DynamoDB item → PostMeta, with the same fallbacks the app has always used. */
export function itemToMeta(item: Record<string, unknown>): PostMeta {
  const createdAt = item.createdAt as string;
  return {
    slug: item.sk as string,
    title: item.title as string,
    published: Boolean(item.published),
    // Posts written before publishedAt existed fall back to their write time.
    publishedAt: (item.publishedAt as string) ?? createdAt,
    createdAt,
    updatedAt: item.updatedAt as string,
    version: (item.version as number) ?? 1,
    excerpt: (item.excerpt as string) ?? "",
    tags: (item.tags as string[]) ?? [],
    summary: item.summary as string | undefined,
    summarySourceVersion: item.summarySourceVersion as number | undefined,
  };
}
