import { Stack } from "aws-cdk-lib";

// Same light stub as site.spec — creating the app instantiates the site stack,
// so its Nextjs construct must not trigger a build.
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
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: "index.handler",
          code: lambda.Code.fromInline("exports.handler = async () => {};"),
        });
        this.serverFunction = { lambdaFunction: fn };
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

import { createApp } from "./main";

describe("cdk app entry", () => {
  it("defines the site and OIDC stacks", () => {
    const app = createApp();
    const stackNames = app.node.children
      .filter((c): c is Stack => Stack.isStack(c))
      .map((s) => s.stackName)
      .sort();
    expect(stackNames).toEqual(["DakotajpSiteStack", "GithubOidcStack"]);
  });
});
