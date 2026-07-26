export interface CommentProps {
  /** The post this comment belongs to. */
  slug: string;
  id: string;
  username: string;
  message: string;
  createdAt: string;
  likes: number;
  /** Parent comment's `id`. Absent for top-level comments. */
  parentId?: string;
  /** Tombstone: deleted, but kept as a node so its replies aren't orphaned. */
  deleted?: boolean;
}

export class Comment {
  readonly slug!: string;
  readonly id!: string;
  readonly username!: string;
  readonly message!: string;
  readonly createdAt!: string;
  readonly likes!: number;
  readonly parentId?: string;
  readonly deleted?: boolean;

  constructor(props: CommentProps) {
    Object.assign(this, props);
  }

  static from(props: CommentProps): Comment {
    return new Comment(props);
  }

  toJSON(): CommentProps {
    return { ...this } as CommentProps;
  }

  get isReply(): boolean {
    return this.parentId !== undefined;
  }

  get isDeleted(): boolean {
    return this.deleted === true;
  }
}
