import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { NodeLambda, type NodeLambdaProps } from "./node-lambda";

/** A stack with one NodeLambda in it, synthesized. */
function synth(props: NodeLambdaProps): Template {
  const app = new cdk.App();
  const stack = new cdk.Stack(app, "TestStack", {
    env: { account: "111111111111", region: "us-east-1" },
  });
  new NodeLambda(stack, "Worker", props);
  return Template.fromStack(stack);
}

describe("NodeLambda", () => {
  it("resolves a handler from the lambda package and pins the house runtime", () => {
    synth({ handlerName: "summarizer" }).hasResourceProperties(
      "AWS::Lambda::Function",
      { Runtime: "nodejs24.x", Handler: "index.handler" },
    );
  });

  it("passes through function options like environment and concurrency", () => {
    const template = synth({
      handlerName: "summarizer",
      reservedConcurrentExecutions: 2,
      environment: { TABLE_NAME: "some-table" },
    });

    template.hasResourceProperties("AWS::Lambda::Function", {
      ReservedConcurrentExecutions: 2,
      Environment: { Variables: Match.objectLike({ TABLE_NAME: "some-table" }) },
    });
  });

  it("fails at synth on an unknown handler, naming the ones that exist", () => {
    // The whole point of resolving by name: a typo can't reach deploy.
    expect(() => synth({ handlerName: "summariser" })).toThrow(
      /no handler "summariser"[\s\S]*Available:[\s\S]*summarizer/,
    );
  });
});
