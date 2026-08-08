import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";

// The real Nextjs construct builds the whole app (OpenNext) at synth — far too
// heavy for a unit test. Swap it for a light stub exposing only what the stack
// touches: a Lambda to grant on and a distribution domain to output.
jest.mock("cdk-nextjs-standalone", () => {
  const { Construct } = jest.requireActual("constructs");
  const lambda = jest.requireActual("aws-cdk-lib/aws-lambda");
  const cloudfront = jest.requireActual("aws-cdk-lib/aws-cloudfront");
  const origins = jest.requireActual("aws-cdk-lib/aws-cloudfront-origins");
  const s3 = jest.requireActual("aws-cdk-lib/aws-s3");
  return {
    Nextjs: class extends Construct {
      serverFunction: { lambdaFunction: unknown };
      distribution: { distributionDomain: string; distribution: unknown };
      constructor(scope: unknown, id: string) {
        super(scope, id);
        const fn = new lambda.Function(this, "ServerFn", {
          runtime: lambda.Runtime.NODEJS_24_X,
          handler: "index.handler",
          code: lambda.Code.fromInline("exports.handler = async () => {};"),
        });
        this.serverFunction = { lambdaFunction: fn };
        // A real Distribution, not a stub: the stack calls addBehavior on it to
        // attach the media path, and a stub would make that assertion vacuous.
        this.distribution = {
          distributionDomain: "mock.cloudfront.net",
          distribution: new cloudfront.Distribution(this, "Dist", {
            // An S3 origin, not an HttpOrigin: its DomainName resolves to a
            // token, so this scaffolding stays out of the physical-name sweep.
            defaultBehavior: {
              origin: origins.S3BucketOrigin.withOriginAccessControl(
                new s3.Bucket(this, "DistBucket"),
              ),
            },
          }),
        };
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

  // The uploads bucket holds admin-authored content served publicly through
  // CloudFront. Public access on it would expose the bucket API itself, not
  // just the images, so these are the assertions worth pinning.
  it("keeps the media bucket private and encrypted", () => {
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Retain",
      Properties: Match.objectLike({
        PublicAccessBlockConfiguration: {
          BlockPublicAcls: true,
          BlockPublicPolicy: true,
          IgnorePublicAcls: true,
          RestrictPublicBuckets: true,
        },
        BucketEncryption: Match.objectLike({
          ServerSideEncryptionConfiguration: Match.anyValue(),
        }),
      }),
    });
  });

  it("lets the browser PUT to the media bucket from the site only", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      CorsConfiguration: {
        CorsRules: [
          Match.objectLike({
            AllowedMethods: ["PUT"],
            AllowedOrigins: ["https://dakotajp.com", "https://www.dakotajp.com"],
          }),
        ],
      },
    });
  });

  it("serves /media/* from the distribution", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: Match.objectLike({
        CacheBehaviors: Match.arrayWith([
          Match.objectLike({
            PathPattern: "media/*",
            ViewerProtocolPolicy: "redirect-to-https",
          }),
        ]),
      }),
    });
  });

  // Write-only, and only here: the server signs uploads but never reads one
  // back, and nothing else in the stack should be able to touch the bucket.
  it("grants the server function put-only access to the media bucket", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(["s3:PutObject"]),
          }),
        ]),
      }),
    });

    const policies = Object.values(
      template.findResources("AWS::IAM::Policy"),
    ) as { Properties: { PolicyDocument: { Statement: unknown[] } } }[];
    const actions = policies
      .flatMap((p) => p.Properties.PolicyDocument.Statement)
      .flatMap((s) => {
        const action = (s as { Action?: string | string[] }).Action;
        return Array.isArray(action) ? action : action ? [action] : [];
      });
    expect(actions).not.toContain("s3:GetObject");
    expect(actions).not.toContain("s3:*");
  });
});
