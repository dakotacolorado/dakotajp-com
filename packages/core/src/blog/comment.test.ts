import { Comment, type CommentProps } from "./comment";
import { buildThread } from "./comment-tree";

const base = (over: Partial<CommentProps>): Comment =>
  Comment.from({
    slug: "hello-world",
    id: "1",
    username: "ada",
    message: "hi",
    createdAt: "2026-01-01T00:00:00.000Z",
    likes: 0,
    ...over,
  });

describe("Comment entity", () => {
  it("round-trips through toJSON / from", () => {
    const props: CommentProps = {
      slug: "p",
      id: "abc",
      username: "ada",
      message: "hello",
      createdAt: "2026-01-01T00:00:00.000Z",
      likes: 3,
      parentId: "root",
    };
    const wire = JSON.parse(JSON.stringify(Comment.from(props)));
    const restored = Comment.from(wire);
    expect(restored.toJSON()).toEqual(props);
    expect(restored).toBeInstanceOf(Comment);
  });

  it("isReply reflects parentId", () => {
    expect(base({ parentId: "x" }).isReply).toBe(true);
    expect(base({}).isReply).toBe(false);
  });

  it("isDeleted reflects the tombstone flag", () => {
    expect(base({ deleted: true }).isDeleted).toBe(true);
    expect(base({}).isDeleted).toBe(false);
  });
});

describe("buildThread", () => {
  it("nests replies under their parent", () => {
    const tree = buildThread(
      [
        base({ id: "a", createdAt: "2026-01-01T00:00:00.000Z" }),
        base({ id: "b", parentId: "a", createdAt: "2026-01-02T00:00:00.000Z" }),
      ],
      "oldest",
    );
    expect(tree).toHaveLength(1);
    expect(tree[0].comment.id).toBe("a");
    expect(tree[0].children[0].comment.id).toBe("b");
    expect(tree[0].comment).toBeInstanceOf(Comment); // entity preserved
  });

  it("sorts siblings by the given order (most-liked default)", () => {
    const tree = buildThread(
      [
        base({ id: "a", likes: 1 }),
        base({ id: "b", likes: 5 }),
        base({ id: "c", likes: 3 }),
      ],
      "liked",
    );
    expect(tree.map((n) => n.comment.id)).toEqual(["b", "c", "a"]);
  });

  it("promotes orphans (missing parent) to top-level so nothing vanishes", () => {
    const tree = buildThread([base({ id: "x", parentId: "gone" })], "oldest");
    expect(tree).toHaveLength(1);
    expect(tree[0].comment.id).toBe("x");
  });
});
