import { existsSync, readdirSync } from "node:fs";
import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";
import { packageRoot } from "../package-root";

/**
 * A Lambda whose source lives in the `@dakotajp/lambda` package.
 *
 * This *is* a `NodejsFunction` — it only supplies the house defaults (runtime,
 * entry resolution, bundling) so a new worker is three lines instead of ten,
 * and so those defaults live in one place.
 *
 * ## Adding a new Lambda
 *
 * 1. Create the handler in the lambda package, one directory per function:
 *
 *        packages/lambda/src/<name>/index.ts
 *
 *    exporting a function called `handler`:
 *
 *        export async function handler(event: SQSEvent): Promise<void> { ... }
 *
 * 2. Declare it in a stack, passing that same `<name>`:
 *
 *        const worker = new NodeLambda(this, "Worker", {
 *          handlerName: "worker",
 *          environment: { TABLE_NAME: table.tableName },
 *        });
 *
 * 3. Wire it up like any other function — grants, event sources, policies:
 *
 *        table.grantReadWriteData(worker);
 *        worker.addEventSource(new SqsEventSource(queue));
 *
 * `handlerName` is verified at synth time: a typo fails `cdk synth` (which CI
 * runs on every PR) with the list of handlers that do exist, rather than
 * deploying a function that cannot start.
 */

/** Every handler is `index.ts` exporting `handler`, under its own directory. */
const HANDLER_FILE = "index.ts";
const HANDLER_EXPORT = "handler";

/** One runtime for every worker, so they can't drift apart. */
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

/**
 * Everything `NodejsFunction` takes, except the three things this construct
 * owns: `entry` (derived from `handlerName`), `handler`, and `runtime`.
 */
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
        // Bundle the AWS SDK instead of using the runtime's built-in copy, so
        // the deployed version is the one that was built and tested.
        externalModules: [],
        ...bundling,
      },
    });
  }
}
