#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DakotajpSiteStack } from "./stacks/site";
import { GithubOidcStack } from "./stacks/github-oidc";

const app = new cdk.App();

const env = {
  account: "326571719118",
  region: "us-east-1",
};

// CloudFront requires its ACM certificate in us-east-1, so the whole stack
// lives in us-east-1 to keep the certificate in-stack (no cross-region wiring).
new DakotajpSiteStack(app, "DakotajpSiteStack", {
  env,
  description: "dakotajp.com — Next.js site (OpenNext on Lambda + CloudFront) + DynamoDB",
});

// Trust for GitHub Actions to deploy via OIDC (no stored AWS keys).
new GithubOidcStack(app, "GithubOidcStack", {
  env,
  description: "GitHub Actions OIDC provider + scoped deploy role",
});
