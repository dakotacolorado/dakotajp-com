import {
  TABLE_NAME,
  PK,
  bodyPk,
  versionPk,
  pad,
  DERIVED_FIELDS,
} from "../src/schema";

describe("core schema (keys)", () => {
  it("resolves a single table name", () => {
    expect(TABLE_NAME).toBe("dakotajp-site");
  });

  it("has the fixed content partition keys", () => {
    expect(PK).toEqual({ page: "PAGE", post: "POST", postBody: "POSTBODY" });
  });

  it("builds body partition keys per entity", () => {
    expect(bodyPk("POST")).toBe("POSTBODY");
    expect(bodyPk("PAGE")).toBe("PAGEBODY");
  });

  it("builds version partition keys", () => {
    expect(versionPk("POST", "hello-world")).toBe("VERSION#POST#hello-world");
    expect(versionPk("PAGE", "about")).toBe("VERSION#PAGE#about");
  });

  it("zero-pads version numbers to a fixed, sortable width", () => {
    expect(pad(3)).toBe("0000000003");
    expect(pad(3)).toHaveLength(10);
    expect(pad(1234567890)).toBe("1234567890");
  });

  it("declares the derived (non-versioned) fields", () => {
    expect(DERIVED_FIELDS).toEqual(["summary", "summarySourceVersion"]);
  });
});
