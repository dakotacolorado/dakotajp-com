/** Standalone ts-jest config for the pure @dakotajp/core package (ADR 0002). */
const config = {
  displayName: "core",
  testEnvironment: "node",
  testMatch: ["<rootDir>/**/*.test.ts"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  // Annotate failing assertions inline in GitHub Actions (no-op on pass/local).
  reporters: ["default", "github-actions"],
};

export default config;
