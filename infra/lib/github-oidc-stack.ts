import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";

const GITHUB_OWNER = "dakotacolorado";
const GITHUB_REPO = "dakotajp-com";

/**
 * Trust between GitHub Actions and this AWS account via OIDC.
 *
 * Creates:
 *  - An IAM OIDC identity provider for token.actions.githubusercontent.com
 *  - A deploy role that ONLY workflows on the `main` branch of this repo may
 *    assume (short-lived, no stored access keys).
 *
 * The role's only permission is to assume the CDK bootstrap roles, which is all
 * `cdk deploy` needs — least privilege, no broad admin rights in CI.
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
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
        },
        StringLike: {
          // Only the main branch of this exact repo can assume the role.
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_OWNER}/${GITHUB_REPO}:ref:refs/heads/main`,
        },
      }),
    });

    // cdk deploy works by assuming the CDK bootstrap roles; grant only that.
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
