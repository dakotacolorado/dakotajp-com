import type { PostMeta } from "./types";

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
