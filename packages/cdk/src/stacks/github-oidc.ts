import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

const GITHUB_OWNER = "dakotacolorado";
const GITHUB_REPO = "dakotajp-com";

/**
 * OIDC trust for GitHub Actions: a deploy role assumable only by workflows on
 * this repo's `main` branch, whose one permission is to assume the CDK
 * bootstrap roles.
 */
export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    const provider = new iam.OpenIdConnectProvider(this, "GithubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIds: ["sts.amazonaws.com"],
    });

    const deployRole = new iam.Role(this, "GithubActionsDeployRole", {
      roleName: "github-actions-dakotajp-deploy",
      description: "Assumed by GitHub Actions (main branch) to run cdk deploy",
      maxSessionDuration: cdk.Duration.hours(1),
      // GOTCHA: this account emits `sub` with numeric database IDs appended
      // (repo:owner@123/repo@456:ref:...), so StringLike wildcards those IDs.
      // Owner, repo, and the main-branch ref stay pinned.
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_OWNER}@*/${GITHUB_REPO}@*:ref:refs/heads/main`,
        },
      }),
    });

    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: "AssumeCdkBootstrapRoles",
        actions: ["sts:AssumeRole"],
        resources: [`arn:aws:iam::${this.account}:role/cdk-hnb659fds-*`],
      }),
    );

    new cdk.CfnOutput(this, "DeployRoleArn", {
      value: deployRole.roleArn,
      description: "Set as AWS_DEPLOY_ROLE in the GitHub Actions workflow",
    });
  }
}
