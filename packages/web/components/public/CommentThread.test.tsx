import { render, screen } from "@testing-library/react";
import { Comment, MAX_DEPTH, type CommentNode } from "@dakotajp/core";
import { CommentThread } from "./CommentThread";

jest.mock("@/app/actions", () => ({
  togglePostLikeAction: jest.fn(),
  toggleCommentLikeAction: jest.fn(),
  deleteCommentAction: jest.fn(),
  addCommentAction: jest.fn(),
}));

const comment = (id: string, over: Partial<Comment> = {}) =>
  Comment.from({
    slug: "a-post",
    id,
    username: `user-${id}`,
    message: `message ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    likes: 0,
    ...over,
  });

const node = (id: string, children: CommentNode[] = []): CommentNode => ({
  comment: comment(id),
  children,
});

/** A single chain `depth + 1` levels deep: root → c1 → c2 → … */
const chain = (depth: number): CommentNode => {
  let leaf = node(`c${depth}`);
  for (let i = depth - 1; i >= 0; i--) leaf = node(`c${i}`, [leaf]);
  return leaf;
};

const renderThread = (nodes: CommentNode[], admin = false) =>
  render(
    <CommentThread
      nodes={nodes}
      slug="a-post"
      admin={admin}
      readerLikes={new Set()}
    />,
  );

describe("CommentThread", () => {
  it("renders a comment's author and message", () => {
    renderThread([node("a")]);
    expect(screen.getByText("user-a")).toBeInTheDocument();
    expect(screen.getByText("message a")).toBeInTheDocument();
  });

  it("renders replies nested under their parent", () => {
    renderThread([node("a", [node("b")])]);
    expect(screen.getByText("message a")).toBeInTheDocument();
    expect(screen.getByText("message b")).toBeInTheDocument();
  });

  it("shows a tombstone as [deleted], without author, message or controls", () => {
    render(
      <CommentThread
        nodes={[{ comment: comment("x", { deleted: true }), children: [] }]}
        slug="a-post"
        admin={true}
        readerLikes={new Set()}
      />,
    );
    expect(screen.getByText("[deleted]")).toBeInTheDocument();
    expect(screen.queryByText("user-x")).not.toBeInTheDocument();
    expect(screen.queryByText("message x")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /like/i })).not.toBeInTheDocument();
    expect(screen.queryByText("Reply")).not.toBeInTheDocument();
  });

  it("keeps a tombstone's replies visible", () => {
    render(
      <CommentThread
        nodes={[{ comment: comment("x", { deleted: true }), children: [node("y")] }]}
        slug="a-post"
        admin={false}
        readerLikes={new Set()}
      />,
    );
    expect(screen.getByText("[deleted]")).toBeInTheDocument();
    expect(screen.getByText("message y")).toBeInTheDocument();
  });

  it("indents each level up to MAX_DEPTH", () => {
    const { container } = renderThread([chain(MAX_DEPTH - 1)]);
    // One indent wrapper per parent→child hop, all of them within the limit.
    expect(container.querySelectorAll(".border-l")).toHaveLength(MAX_DEPTH - 1);
  });

  it("stops indenting past MAX_DEPTH so deep threads stay readable", () => {
    const deep = MAX_DEPTH + 3;
    const { container } = renderThread([chain(deep)]);

    // Every level still renders...
    expect(screen.getByText(`message c${deep}`)).toBeInTheDocument();
    // ...but indentation caps out rather than growing with depth.
    expect(container.querySelectorAll(".border-l")).toHaveLength(MAX_DEPTH);
  });

  it("shows delete controls only to an admin", () => {
    const { unmount } = renderThread([node("a")], false);
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    unmount();

    renderThread([node("a")], true);
    expect(screen.getByText("Delete")).toBeInTheDocument();
  });

  it("renders nothing for an empty thread", () => {
    const { container } = renderThread([]);
    expect(container.textContent).toBe("");
  });
});
