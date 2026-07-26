import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { GithubOidcStack } from "./github-oidc";

const template = (() => {
  const app = new cdk.App();
  const stack = new GithubOidcStack(app, "TestOidc", {
    env: { account: "111111111111", region: "us-east-1" },
  });
  return Template.fromStack(stack);
})();

describe("GithubOidcStack", () => {
  it("registers the GitHub OIDC provider", () => {
    template.resourceCountIs("Custom::AWSCDKOpenIdConnectProvider", 1);
  });

  it("creates the deploy role with a 1-hour max session", () => {
    template.hasResourceProperties("AWS::IAM::Role", {
      RoleName: "github-actions-dakotajp-deploy",
      MaxSessionDuration: 3600,
    });
  });

  it("only lets the role assume the CDK bootstrap roles", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({ Action: "sts:AssumeRole", Effect: "Allow" }),
        ]),
      }),
    });
  });
});
