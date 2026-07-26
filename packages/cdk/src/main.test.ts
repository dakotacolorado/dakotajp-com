import { Stack } from "aws-cdk-lib";

// Same light stub as site.spec — creating the app instantiates the site stack,
// so its Nextjs construct must not trigger a build.
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
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: "index.handler",
          code: lambda.Code.fromInline("exports.handler = async () => {};"),
        });
        this.serverFunction = { lambdaFunction: fn };
        this.distribution = { distributionDomain: "mock.cloudfront.net" };
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
