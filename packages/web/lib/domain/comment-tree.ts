import type { Comment } from "@/lib/domain/comments";
import { commentComparator } from "@/lib/domain/sorting";

/** Max visual nesting depth; replies deeper than this render flattened. */
export const MAX_DEPTH = 5;

export interface CommentNode extends Comment {
  children: CommentNode[];
}

/**
 * Assemble a flat comment list into a tree by `parentId`, then sort siblings at
 * every level with the given sort. Comments whose parent is missing (e.g. a
 * hard-deleted leaf) fall back to top-level so nothing disappears.
 */
export function buildThread(comments: Comment[], sort: string): CommentNode[] {
  const byId = new Map<string, CommentNode>();
  for (const c of comments) byId.set(c.id, { ...c, children: [] });

  const roots: CommentNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const cmp = commentComparator(sort);
  const sortRec = (nodes: CommentNode[]) => {
    nodes.sort(cmp);
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}
