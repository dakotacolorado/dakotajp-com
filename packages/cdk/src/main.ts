#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DakotajpSiteStack } from "./stacks/site";
import { GithubOidcStack } from "./stacks/github-oidc";

const env = {
  account: "326571719118",
  region: "us-east-1",
};

/** Build the CDK app and its stacks. Exported so tests can synth it. */
export function createApp(): cdk.App {
  const app = new cdk.App();

  // CloudFront requires its ACM certificate in us-east-1, so the whole stack
  // lives in us-east-1 to keep the certificate in-stack (no cross-region wiring).
  new DakotajpSiteStack(app, "DakotajpSiteStack", {
    env,
    description:
      "dakotajp.com — Next.js site (OpenNext on Lambda + CloudFront) + DynamoDB",
  });

  // Trust for GitHub Actions to deploy via OIDC (no stored AWS keys).
  new GithubOidcStack(app, "GithubOidcStack", {
    env,
    description: "GitHub Actions OIDC provider + scoped deploy role",
  });

  return app;
}

// Only build when run as the CDK entry (cdk.json), not when imported by a test.
if (require.main === module) {
  createApp();
}
