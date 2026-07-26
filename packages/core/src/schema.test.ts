import {
  DEFAULT_TABLE_NAME,
  PK,
  bodyPk,
  versionPk,
  pad,
  DERIVED_FIELDS,
} from "./schema";

describe("core schema (keys)", () => {
  it("declares the table name", () => {
    expect(DEFAULT_TABLE_NAME).toBe("dakotajp-site");
  });

  it("does not resolve the table name from the environment", () => {
    // cdk uses this constant to *name* the table, so a stray TABLE_NAME in a
    // deploy environment must not be able to rename production. Re-import with
    // the env set to prove the module never reads it.
    process.env.TABLE_NAME = "some-other-table";
    try {
      jest.resetModules();
      const reloaded = require("./schema") as typeof import("./schema");
      expect(reloaded.DEFAULT_TABLE_NAME).toBe("dakotajp-site");
    } finally {
      delete process.env.TABLE_NAME;
    }
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
