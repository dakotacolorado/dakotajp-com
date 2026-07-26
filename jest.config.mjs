import nextJest from "next/jest.js";

/**
 * One Jest config for the whole workspace. `npm test` at the root runs every
 * project; filter with `npx jest --selectProjects core`.
 *
 * Tests are colocated with their source as `*.test.ts(x)` — one convention in
 * every package, so a new package needs a project entry here and nothing else.
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

// The CDK package compiles as NodeNext; Jest needs CommonJS.
const cdkProject = nodeProject("cdk", { module: "commonjs", moduleResolution: "node" });

// Next's own Jest transform (SWC), plus jsdom and React Testing Library.
const webProject = nextJest({ dir: "./packages/web" })({
  displayName: "web",
  rootDir: "packages/web",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/{app,components}/**/*.test.{ts,tsx}"],
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
    cdkProject,
    await webProject(),
    webLibProject,
  ],
  // Annotate failing assertions inline in GitHub Actions (no-op on pass/local).
  reporters: ["default", "github-actions"],
});
