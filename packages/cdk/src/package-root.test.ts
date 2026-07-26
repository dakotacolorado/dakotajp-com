import { existsSync } from "node:fs";
import * as path from "node:path";
import { packageRoot } from "./package-root";

describe("packageRoot", () => {
  it.each(["@dakotajp/lambda", "@dakotajp/web"])(
    "locates %s by its manifest, not by a relative path",
    (pkg) => {
      const root = packageRoot(pkg);
      expect(path.isAbsolute(root)).toBe(true);
      expect(existsSync(path.join(root, "package.json"))).toBe(true);
      // The directory name is incidental — what matters is that the manifest
      // there really is the package we asked for.
      const manifest = require(path.join(root, "package.json")) as {
        name: string;
      };
      expect(manifest.name).toBe(pkg);
    },
  );

  it("throws for a package that isn't a declared dependency", () => {
    expect(() => packageRoot("@dakotajp/not-a-package")).toThrow();
  });
});
