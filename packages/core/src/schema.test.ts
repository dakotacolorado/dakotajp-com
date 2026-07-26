import { DEFAULT_TABLE_NAME, DERIVED_FIELDS } from "./schema";

describe("core schema", () => {
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

  it("declares the derived (non-versioned) fields", () => {
    expect(DERIVED_FIELDS).toEqual(["summary", "summarySourceVersion"]);
  });
});
