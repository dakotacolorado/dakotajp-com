import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { packageRoot } from "../package-root";

/**
 * A `NodejsFunction` whose source lives in `@dakotajp/lambda`, with the house
 * defaults for runtime, entry resolution, and bundling.
 *
 * Adding one:
 *
 *     // packages/lambda/src/worker/index.ts
 *     export async function handler(event: SQSEvent) { ... }
 *
 *     const worker = new NodeLambda(this, "Worker", { handlerName: "worker" });
 *     table.grantReadWriteData(worker);
 *     worker.addEventSource(new SqsEventSource(queue));
 *
 * `handlerName` is resolved at synth, so a typo fails `cdk synth` rather than
 * deploying a function that cannot start.
 */

/** Every handler is `index.ts` exporting `handler`, under its own directory. */
const HANDLER_FILE = "index.ts";
const HANDLER_EXPORT = "handler";

const RUNTIME = lambda.Runtime.NODEJS_24_X;

const DEFAULT_TIMEOUT = cdk.Duration.seconds(30);

/** `packages/lambda/src`, located via the package manifest (see packageRoot). */
function handlerRoot(): string {
  return path.join(packageRoot("@dakotajp/lambda"), "src");
}

/** Absolute path to a handler's entry file, or a loud error naming the real ones. */
function resolveHandlerEntry(handlerName: string): string {
  const root = handlerRoot();
  const entry = path.join(root, handlerName, HANDLER_FILE);
  if (existsSync(entry)) return entry;

  const available = readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  throw new Error(
    `NodeLambda: no handler "${handlerName}" in @dakotajp/lambda. ` +
      `Expected ${entry}. Available: ${available.join(", ") || "(none)"}.`,
  );
}

/** `NodejsFunction` props, minus the three this construct owns. */
export interface NodeLambdaProps
  extends Omit<lambdaNode.NodejsFunctionProps, "entry" | "handler" | "runtime"> {
  /** Directory under `packages/lambda/src/` holding this function's `index.ts`. */
  readonly handlerName: string;
}

export class NodeLambda extends lambdaNode.NodejsFunction {
  constructor(scope: Construct, id: string, props: NodeLambdaProps) {
    const { handlerName, bundling, ...rest } = props;

    super(scope, id, {
      ...rest,
      entry: resolveHandlerEntry(handlerName),
      handler: HANDLER_EXPORT,
      runtime: RUNTIME,
      timeout: rest.timeout ?? DEFAULT_TIMEOUT,
      bundling: {
        // Bundle the AWS SDK rather than use the runtime's copy, so the
        // deployed version is the one that was built and tested.
        externalModules: [],
        ...bundling,
      },
    });
  }
}
