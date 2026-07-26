import * as path from "node:path";

/**
 * Absolute path to a workspace package's directory, resolved through its
 * manifest. The package must be a declared dependency of `@dakotajp/cdk`.
 */
export function packageRoot(packageName: string): string {
  return path.dirname(require.resolve(`${packageName}/package.json`));
}
