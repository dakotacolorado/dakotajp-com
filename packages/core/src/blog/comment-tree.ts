import { Comment } from "./comment";

/**
 * Threading — the "manager" for turning a flat comment list into a sorted tree.
 * Pure: no I/O, so it lives in core with the Comment noun it operates on.
 */

/** Max visual nesting depth; replies deeper than this render flattened. */
export const MAX_DEPTH = 5;

/** A comment plus its (already-sorted) replies. Keeps the entity, not a copy. */
export interface CommentNode {
  comment: Comment;
  children: CommentNode[];
}

/** Sibling ordering within one thread level. */
export function commentComparator(
  sort: string,
): (a: Comment, b: Comment) => number {
  switch (sort) {
    case "newest":
      return (a, b) => (a.createdAt < b.createdAt ? 1 : -1);
    case "oldest":
      return (a, b) => (a.createdAt < b.createdAt ? -1 : 1);
    default: // most liked; ties resolve oldest-first
      return (a, b) => b.likes - a.likes || (a.createdAt < b.createdAt ? -1 : 1);
  }
}

/**
 * Assemble a flat comment list into a tree by `parentId`, then sort siblings at
 * every level. Comments whose parent is missing (e.g. a hard-deleted leaf) fall
 * back to top-level so nothing disappears.
 */
export function buildThread(comments: Comment[], sort: string): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of comments) byId.set(c.id, { comment: c, children: [] });

  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.comment.parentId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const cmp = commentComparator(sort);
  const sortRec = (nodes: CommentNode[]) => {
    nodes.sort((a, b) => cmp(a.comment, b.comment));
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
