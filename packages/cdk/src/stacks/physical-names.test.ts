import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

jest.mock("cdk-nextjs-standalone", () => {
  const { Construct } = jest.requireActual("constructs");
  const lambda = jest.requireActual("aws-cdk-lib/aws-lambda");
  return {
    Nextjs: class extends Construct {
      serverFunction: { lambdaFunction: unknown };
      distribution: { distributionDomain: string };
      constructor(scope: unknown, id: string) {
        super(scope, id);
        const fn = new lambda.Function(this, "ServerFn", {
          runtime: lambda.Runtime.NODEJS_24_X,
          handler: "index.handler",
          code: lambda.Code.fromInline("exports.handler = async () => {};"),
        });
        this.serverFunction = { lambdaFunction: fn };
        this.distribution = { distributionDomain: "mock.cloudfront.net" };
      }
    },
  };
});

import { DakotajpSiteStack } from "./site";
import { GithubOidcStack } from "./github-oidc";

/**
 * Physical names are load-bearing, so this test pins every one of them.
 *
 * CloudFormation cannot rename in place: changing `TableName` REPLACES the
 * table (the current one is retained, but empty and detached), changing
 * `IndexName` replaces the GSI, and `RoleName` is referenced from outside the
 * stack by `.github/workflows/deploy.yml` — renaming it leaves CI unable to
 * assume the role that deploys the fix.
 *
 * The inventory below is a sweep, not a list of specific assertions, so a NEW
 * hardcoded name added anywhere in either stack fails here rather than passing
 * unnoticed. When these names become prefix-derived, this test is what proves
 * the default prefix reproduces them exactly.
 */

/** CloudFormation properties that set a resource's physical name. */
const NAME_PROPS = [
  "TableName",
  "RoleName",
  "QueueName",
  "FunctionName",
  "BucketName",
  "LogGroupName",
  "TopicName",
  "StateMachineName",
  "IndexName",
  "DomainName",
];

/** Every literal (non-`Ref`, non-`Fn::`) physical name the template declares. */
function physicalNames(template: Template): string[] {
  const found: string[] = [];
  for (const resource of Object.values<{
    Type: string;
    Properties?: Record<string, unknown>;
  }>(template.toJSON().Resources ?? {})) {
    const walk = (value: unknown) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        // A token (Ref / Fn::GetAtt) is resolved by CloudFormation, so only a
        // literal string is a name someone chose and can accidentally change.
        if (NAME_PROPS.includes(key) && typeof child === "string") {
          found.push(`${resource.Type} ${key}=${child}`);
        }
        walk(child);
      }
    };
    walk(resource.Properties);
  }
  return [...new Set(found)].sort();
}

const synth = <T extends cdk.Stack>(
  Stack: new (s: cdk.App, id: string, p: cdk.StackProps) => T,
  id: string,
) =>
  Template.fromStack(
    new Stack(new cdk.App(), id, {
      env: { account: "111111111111", region: "us-east-1" },
    }),
  );

describe("physical resource names", () => {
  it("pins every literal name in the site stack", () => {
    expect(physicalNames(synth(DakotajpSiteStack, "TestSite"))).toEqual([
      "AWS::CertificateManager::Certificate DomainName=dakotajp.com",
      "AWS::CertificateManager::Certificate DomainName=www.dakotajp.com",
      "AWS::DynamoDB::Table IndexName=GSI1",
      "AWS::DynamoDB::Table TableName=dakotajp-ratelimit",
      "AWS::DynamoDB::Table TableName=dakotajp-site",
    ]);
  });

  it("pins every literal name in the OIDC stack", () => {
    expect(physicalNames(synth(GithubOidcStack, "TestOidc"))).toEqual([
      "AWS::IAM::Role RoleName=github-actions-dakotajp-deploy",
    ]);
  });

  it("pins the SSM parameter path the server Lambda may read", () => {
    // Created out-of-band by `set-admin-password`, so the stack and the script
    // have to agree on this path or the admin can never sign in.
    synth(DakotajpSiteStack, "TestSite").hasResourceProperties(
      "AWS::IAM::Policy",
      {
        PolicyDocument: Match.objectLike({
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "ssm:GetParameter",
              Resource: Match.stringLikeRegexp("parameter/dakotajp/\\*$"),
            }),
          ]),
        }),
      },
    );
  });
});
