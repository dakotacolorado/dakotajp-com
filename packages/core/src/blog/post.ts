/**
 * Crosses the RSC boundary, so every field must stay JSON-serializable —
 * strings, numbers, booleans, arrays. No `Date`s, no class instances.
 */
export interface PostProps {
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
  /** Absent on list reads; loaded on the detail page. */
  body?: string;
  /** AI-generated. Absent until a summarizer has run over this post. */
  summary?: string;
  /** Body version `summary` was generated from; !== version means stale. */
  summarySourceVersion?: number;
}

/** What an author supplies when creating/updating a post. */
export interface PostInput {
  title: string;
  body: string;
  published: boolean;
  publishedAt?: string;
  tags?: string[];
}

export class Post {
  readonly slug!: string;
  readonly title!: string;
  readonly published!: boolean;
  readonly publishedAt!: string;
  readonly createdAt!: string;
  readonly updatedAt!: string;
  readonly version!: number;
  readonly excerpt!: string;
  readonly tags!: string[];
  readonly body?: string;
  readonly summary?: string;
  readonly summarySourceVersion?: number;

  constructor(props: PostProps) {
    Object.assign(this, props);
  }

  static from(props: PostProps): Post {
    return new Post(props);
  }

  toJSON(): PostProps {
    return { ...this } as PostProps;
  }

  get isDraft(): boolean {
    return !this.published;
  }

  /** The AI summary if present, else the excerpt. */
  get blurb(): string {
    return this.summary ?? this.excerpt;
  }

  get isSummaryStale(): boolean {
    return (
      this.summary !== undefined && this.summarySourceVersion !== this.version
    );
  }

  /** Whether the full body has been loaded (list reads omit it). */
  get hasBody(): boolean {
    return this.body !== undefined;
  }
}
