import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as lambdaNode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Nextjs } from "cdk-nextjs-standalone";
import { TABLE_NAME } from "@dakotajp/core";

const DOMAIN_NAME = "dakotajp.com";
const WWW_DOMAIN = `www.${DOMAIN_NAME}`;

// Bedrock model for chat + summaries. Cross-region inference profile for
// Claude Haiku 4.5; overridable via the Lambda env without a code change.
const BEDROCK_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// Permission to invoke Claude on Bedrock (streaming + non-streaming), covering
// the inference profile and the underlying foundation models it routes to.
const bedrockInvokePolicy = () =>
  new iam.PolicyStatement({
    sid: "InvokeBedrockClaude",
    actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
    resources: [
      "arn:aws:bedrock:*::foundation-model/anthropic.claude-*",
      `arn:aws:bedrock:*:*:inference-profile/*`,
    ],
  });

// Existing hosted zone in this account (already registered domain).
const HOSTED_ZONE_ID = "Z04322111ALVGO0YUTVTM";

export class DakotajpSiteStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    // --- Data: single-table DynamoDB, on-demand, retained on stack delete ---
    const table = new dynamodb.Table(this, "SiteTable", {
      tableName: TABLE_NAME,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecovery: true,
      // Lets rate-limit window items self-expire.
      timeToLiveAttribute: "ttl",
    });

    // Cross-post comment feed for the admin dashboard. Comments are otherwise
    // partitioned per post (COMMENT#<slug>), so there's no way to read them all
    // by recency. One constant-partition index gives "newest N" / "since T" as a
    // single query. A single hot partition is the standard, acceptable trade at
    // personal-blog volume. Only comments written with GSI1PK/GSI1SK appear here.
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // --- Async AI summaries: queue -> summarizer Lambda -> Bedrock ---
    // Decouples saving a post from Bedrock: a save enqueues a job and returns;
    // if Bedrock is slow or down, SQS retries and (after 3 tries) parks the
    // message in the DLQ instead of failing the save.
    const summaryDlq = new sqs.Queue(this, "SummaryDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });
    const summaryQueue = new sqs.Queue(this, "SummaryQueue", {
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue: { queue: summaryDlq, maxReceiveCount: 3 },
    });

    const summarizer = new lambdaNode.NodejsFunction(this, "Summarizer", {
      entry: path.resolve(
        __dirname,
        "..",
        "..",
        "lambda",
        "summarizer",
        "index.ts",
      ),
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      // Keep Bedrock load low; also naturally bounds cost.
      reservedConcurrentExecutions: 2,
      environment: {
        TABLE_NAME: table.tableName,
        BEDROCK_MODEL_ID,
      },
      bundling: { externalModules: [] }, // bundle the SDK (incl. bedrock-runtime)
    });
    summarizer.addEventSource(
      new SqsEventSource(summaryQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      }),
    );
    table.grantReadWriteData(summarizer);
    summarizer.addToRolePolicy(bedrockInvokePolicy());

    // --- DNS + TLS ---
    const hostedZone = route53.HostedZone.fromHostedZoneAttributes(
      this,
      "HostedZone",
      {
        hostedZoneId: HOSTED_ZONE_ID,
        zoneName: DOMAIN_NAME,
      },
    );

    // Certificate must be in us-east-1 for CloudFront (this stack is us-east-1).
    // DNS-validated against the hosted zone above — creates records automatically.
    const certificate = new acm.Certificate(this, "SiteCertificate", {
      domainName: DOMAIN_NAME,
      subjectAlternativeNames: [WWW_DOMAIN],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // --- Next.js site: OpenNext build -> Lambda + CloudFront + S3 ---
    const site = new Nextjs(this, "Site", {
      nextjsPath: path.resolve(__dirname, "..", "..", "..", "web"), // packages/web (the Next.js app)
      environment: {
        TABLE_NAME: table.tableName,
        SUMMARY_QUEUE_URL: summaryQueue.queueUrl,
        BEDROCK_MODEL_ID,
      },
      domainProps: {
        domainName: DOMAIN_NAME,
        alternateNames: [WWW_DOMAIN],
        hostedZone,
        certificate,
      },
    });

    // Least-privilege: the server Lambda may read/write only this table.
    table.grantReadWriteData(site.serverFunction.lambdaFunction);

    // Chat calls Bedrock directly; saving a post enqueues a summary job.
    site.serverFunction.lambdaFunction.addToRolePolicy(bedrockInvokePolicy());
    summaryQueue.grantSendMessages(site.serverFunction.lambdaFunction);

    // Allow the server Lambda to read the admin auth secrets from SSM
    // (password hash + session signing secret), created out-of-band by the
    // `set-admin-password` script. Scoped to the /dakotajp/ path only.
    site.serverFunction.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "ReadAdminSecrets",
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/dakotajp/*`,
        ],
      }),
    );
    // Decrypt permission for the SecureString values, scoped to SSM only.
    site.serverFunction.lambdaFunction.addToRolePolicy(
      new iam.PolicyStatement({
        sid: "DecryptSsmSecureStrings",
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: {
            "kms:ViaService": `ssm.${this.region}.amazonaws.com`,
          },
        },
      }),
    );

    // --- Outputs ---
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${DOMAIN_NAME}` });
    new cdk.CfnOutput(this, "DistributionDomain", {
      value: site.distribution.distributionDomain,
    });
    new cdk.CfnOutput(this, "TableNameOutput", { value: table.tableName });
  }
}
