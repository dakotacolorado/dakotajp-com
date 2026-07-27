import nextJest from "next/jest.js";

/**
 * One Jest config for the whole workspace. `npm test` at the root runs every
 * project; filter with `npx jest --selectProjects core`.
 *
 * Tests are colocated with their source as `*.test.ts(x)` — one convention in
 * every package, so a new package needs a project entry here and nothing else.
 *
 * Coverage is collected and enforced for the plain-Node packages only; see
 * `collectCoverageFrom` at the bottom.
 *
 * NOTE: Jest can't test async Server Components, so the `web` project covers
 * pure logic and *synchronous* client components only. Rendered pages are
 * verified by deploy + manual smoke.
 */

// Build output holds copies of package.json and compiled sources; without this
// Jest's module map finds both and warns about duplicate module names.
const BUILD_OUTPUT = ["<rootDir>/.next/", "<rootDir>/.open-next/", "<rootDir>/cdk.out/"];

/** A plain-Node package tested through ts-jest. */
const nodeProject = (name, tsconfig = "<rootDir>/tsconfig.json") => ({
  displayName: name,
  rootDir: `packages/${name}`,
  testEnvironment: "node",
  testMatch: ["<rootDir>/src/**/*.test.ts"],
  transform: { "^.+\\.ts$": ["ts-jest", { tsconfig }] },
  modulePathIgnorePatterns: BUILD_OUTPUT,
});

const cdkProject = nodeProject("cdk");

// Next's own Jest transform (SWC), plus jsdom and React Testing Library.
const webProject = nextJest({ dir: "./packages/web" })({
  displayName: "web",
  rootDir: "packages/web",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/{app,components}/**/*.test.{ts,tsx}"],
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  modulePathIgnorePatterns: BUILD_OUTPUT,
});

// The web app's non-Next code (lib/) — no jsdom, no SWC needed.
const webLibProject = {
  displayName: "web-lib",
  rootDir: "packages/web",
  testEnvironment: "node",
  testMatch: ["<rootDir>/lib/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  modulePathIgnorePatterns: BUILD_OUTPUT,
};

export default async () => ({
  projects: [
    nodeProject("core"),
    nodeProject("storage"),
    nodeProject("lambda"),
    cdkProject,
    await webProject(),
    webLibProject,
  ],
  // Annotate failing assertions inline in GitHub Actions (no-op on pass/local).
  reporters: ["default", "github-actions"],

  /**
   * Coverage (`npm run test:coverage`) is measured over the plain-Node packages
   * — the ones Jest can actually exercise end to end. `web` is excluded because
   * its async Server Components are untestable here (see the note above), and
   * `cdk` because its "coverage" would only ever measure `cdk synth`.
   */
  collectCoverageFrom: [
    "packages/{core,storage,lambda}/src/**/*.ts",
    "!**/*.test.ts",
    "!**/__mocks__/**",
    // Pure re-export manifests: no statement or branch a test could get wrong,
    // and istanbul counts each `export { x } from` as an uncalled function. The
    // surface they declare is asserted directly in `storage/src/index.test.ts`,
    // which is a stronger check than line coverage would be.
    "!packages/storage/src/index.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text-summary", "text", "lcov"],
  /**
   * A ratchet, not an aspiration. `storage` and `lambda` are small, pure, and
   * fully covered today, and neither has a runtime the tests can't reach — so
   * the bar is where they already stand, and an uncovered branch fails the run
   * instead of slipping in quietly. The way past it is a test, not a lower
   * number. `core` is left unthresholded: it holds view-layer helpers whose
   * coverage the web project can't contribute to from here.
   */
  coverageThreshold: {
    "./packages/storage/src/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
    "./packages/lambda/src/": {
      statements: 100,
      branches: 100,
      functions: 100,
      lines: 100,
    },
  },
});
