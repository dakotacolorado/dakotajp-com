import * as path from "node:path";

/**
 * Absolute path to a workspace package's directory, resolved through its
 * manifest instead of by walking `../../..` from `__dirname`.
 *
 * The package must be a declared dependency of `@dakotajp/cdk`, and that is the
 * point: the link lives in `package.json` where npm can see it, rather than in a
 * relative path that silently breaks the next time either package moves on disk
 * (this repo has restructured its layout three times).
 */
export function packageRoot(packageName: string): string {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}
