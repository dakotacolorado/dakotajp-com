import { Page, type PageProps } from "./page";

describe("Page entity", () => {
  it("round-trips through toJSON / from", () => {
    const props: PageProps = {
      key: "about",
      title: "About Me",
      body: "# Hi",
      version: 2,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const wire = JSON.parse(JSON.stringify(Page.from(props)));
    const restored = Page.from(wire);
    expect(restored.toJSON()).toEqual(props);
    expect(restored).toBeInstanceOf(Page);
  });
});
