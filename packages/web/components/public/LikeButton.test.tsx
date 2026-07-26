import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { LikeButton } from "./LikeButton";
import {
  togglePostLikeAction,
  toggleCommentLikeAction,
} from "@/app/actions";

// Server actions can't run under jsdom; the component's contract with them is
// "call once, then adopt whatever the server reports".
jest.mock("@/app/actions", () => ({
  togglePostLikeAction: jest.fn(),
  toggleCommentLikeAction: jest.fn(),
}));

const togglePost = togglePostLikeAction as jest.MockedFunction<
  typeof togglePostLikeAction
>;
const toggleComment = toggleCommentLikeAction as jest.MockedFunction<
  typeof toggleCommentLikeAction
>;

const count = () => screen.getByRole("button").textContent;
const pressed = () =>
  screen.getByRole("button").getAttribute("aria-pressed") === "true";

beforeEach(() => {
  togglePost.mockReset();
  toggleComment.mockReset();
});

describe("LikeButton", () => {
  it("renders the initial count and pressed state", () => {
    render(
      <LikeButton
        kind="post"
        slug="a-post"
        initialLikes={3}
        initiallyLiked={true}
      />,
    );
    expect(count()).toBe("3");
    expect(pressed()).toBe(true);
    expect(screen.getByRole("button")).toHaveAccessibleName("Unlike");
  });

  it("increments optimistically before the server responds", async () => {
    let release: (v: { liked: boolean; likes: number }) => void = () => {};
    togglePost.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );

    render(
      <LikeButton
        kind="post"
        slug="a-post"
        initialLikes={1}
        initiallyLiked={false}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    // Still in flight — the UI has already moved.
    expect(count()).toBe("2");
    expect(pressed()).toBe(true);

    release({ liked: true, likes: 2 });
    await waitFor(() => expect(togglePost).toHaveBeenCalledTimes(1));
  });

  it("adopts the server's count even when it disagrees with the guess", async () => {
    // Another reader liked concurrently: optimistic says 2, the server says 9.
    togglePost.mockResolvedValue({ liked: true, likes: 9 });

    render(
      <LikeButton
        kind="post"
        slug="a-post"
        initialLikes={1}
        initiallyLiked={false}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(count()).toBe("9"));
    expect(pressed()).toBe(true);
  });

  it("reverts the optimistic change when the action rejects", async () => {
    togglePost.mockRejectedValue(new Error("network"));

    render(
      <LikeButton
        kind="post"
        slug="a-post"
        initialLikes={4}
        initiallyLiked={false}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(count()).toBe("4"));
    expect(pressed()).toBe(false);
  });

  it("reverts an unlike back to liked when the action rejects", async () => {
    togglePost.mockRejectedValue(new Error("network"));

    render(
      <LikeButton
        kind="post"
        slug="a-post"
        initialLikes={4}
        initiallyLiked={true}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(count()).toBe("4"));
    expect(pressed()).toBe(true);
  });

  it("never renders a negative count", async () => {
    togglePost.mockRejectedValue(new Error("network"));

    render(
      <LikeButton
        kind="post"
        slug="a-post"
        initialLikes={0}
        initiallyLiked={true}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => expect(count()).toBe("0"));
  });

  it("calls the comment action with its identifying key", async () => {
    toggleComment.mockResolvedValue({ liked: true, likes: 1 });

    render(
      <LikeButton
        kind="comment"
        slug="a-post"
        commentId="c1"
        createdAt="2026-01-01T00:00:00.000Z"
        initialLikes={0}
        initiallyLiked={false}
      />,
    );
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(toggleComment).toHaveBeenCalledWith(
        "a-post",
        "c1",
        "2026-01-01T00:00:00.000Z",
      ),
    );
    expect(togglePost).not.toHaveBeenCalled();
  });
});
