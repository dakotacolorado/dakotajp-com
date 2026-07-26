import nextJest from "next/jest.js";

/**
 * Two Jest projects run under one `npm test`:
 *
 *  - "web"  — app + client-component tests via next/jest (SWC transform, jsdom,
 *    React Testing Library). Officially supported Next path. NOTE: Jest can't
 *    test async Server Components (ADR 0002), so this covers pure logic and
 *    *synchronous* client components only.
 *  - "pure" — non-Next code via a standalone ts-jest config. This is where
 *    `packages/core` plugs in once #6 lands; today it runs the lib/* utils.
 */

const createJestConfig = nextJest({ dir: "./" });

const webProject = createJestConfig({
  displayName: "web",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testMatch: ["<rootDir>/{app,components}/**/*.test.{ts,tsx}"],
});

const pureProject = {
  displayName: "pure",
  testEnvironment: "node",
  testMatch: ["<rootDir>/lib/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.jest.json" }],
  },
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
};

const config = async () => ({
  projects: [await webProject(), pureProject],
  // Annotate failing assertions inline in GitHub Actions (no-op on pass/local).
  reporters: ["default", "github-actions"],
});

export default config;
