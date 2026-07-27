import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

// The real Nextjs construct builds the whole app (OpenNext) at synth — far too
// heavy for a unit test. Swap it for a light stub exposing only what the stack
// touches: a Lambda to grant on and a distribution domain to output.
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

const template = (() => {
  const app = new cdk.App();
  const stack = new DakotajpSiteStack(app, "TestSite", {
    env: { account: "111111111111", region: "us-east-1" },
  });
  return Template.fromStack(stack);
})();

describe("DakotajpSiteStack", () => {
  it("creates the content store with a GSI, retained and backed up", () => {
    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Retain",
      Properties: Match.objectLike({
        TableName: "dakotajp-site",
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
        GlobalSecondaryIndexes: Match.arrayWith([
          Match.objectLike({ IndexName: "GSI1" }),
        ]),
      }),
    });
  });

  it("creates the rate-limit store as throwaway: TTL, no PITR, destroyed", () => {
    // ADR 0003 — nothing here is worth retaining or backing up.
    template.hasResource("AWS::DynamoDB::Table", {
      DeletionPolicy: "Delete",
      Properties: Match.objectLike({
        TableName: "dakotajp-ratelimit",
        TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
        PointInTimeRecoverySpecification: Match.absent(),
      }),
    });
  });

  it("creates the summary queue and its dead-letter queue", () => {
    template.resourceCountIs("AWS::SQS::Queue", 2);
  });

  it("grants Bedrock invoke to the workloads", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(["bedrock:InvokeModel"]),
          }),
        ]),
      }),
    });
  });
});
