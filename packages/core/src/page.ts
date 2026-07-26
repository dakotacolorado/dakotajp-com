/** The "Page" noun — a singleton markdown document (About, Resume). */

export interface PageProps {
  key: string;
  title: string;
  body: string; // markdown
  version: number;
  updatedAt: string;
}

export class Page {
  readonly key!: string;
  readonly title!: string;
  readonly body!: string;
  readonly version!: number;
  readonly updatedAt!: string;

  constructor(props: PageProps) {
    Object.assign(this, props);
  }

  static from(props: PageProps): Page {
    return new Page(props);
  }

  toJSON(): PageProps {
    return { ...this } as PageProps;
  }
}
