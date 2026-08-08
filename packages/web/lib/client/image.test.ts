import { altFromFilename } from "./image";

// prepareImage is not covered here: it is canvas and createImageBitmap all the
// way down, neither of which jsdom implements, so a test would only assert the
// fallback path this project cannot distinguish from a real failure.
describe("altFromFilename", () => {
  it("turns a filename into something worth reading aloud", () => {
    expect(altFromFilename("sunset-over-the-bay.jpg")).toBe(
      "sunset over the bay",
    );
    expect(altFromFilename("my_first_post.png")).toBe("my first post");
  });

  it("drops only the final extension", () => {
    expect(altFromFilename("archive.tar.webp")).toBe("archive.tar");
  });

  it("falls back rather than producing empty alt text", () => {
    expect(altFromFilename(".png")).toBe("image");
    expect(altFromFilename("")).toBe("image");
    expect(altFromFilename("---")).toBe("image");
  });
});
