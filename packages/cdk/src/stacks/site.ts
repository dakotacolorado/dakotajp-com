import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Nextjs } from "cdk-nextjs-standalone";
import {
  DEFAULT_TABLE_NAME,
  DEFAULT_RATE_LIMIT_TABLE_NAME,
} from "@dakotajp/core";
import { NodeLambda } from "../constructs/node-lambda";
import { packageRoot } from "../package-root";

const DOMAIN_NAME = "dakotajp.com";
const WWW_DOMAIN = `www.${DOMAIN_NAME}`;

// Cross-region inference profile. Overridable per function via the env.
const BEDROCK_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// Covers the inference profile and the foundation models it routes to.
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
      tableName: DEFAULT_TABLE_NAME,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
    });

    // Rate-limit windows, kept off the content table (ADR 0003). Everything
    // here is throwaway: no PITR to bill for backing up 120-second junk, and
    // DESTROY because there is nothing to preserve.
    const rateLimitTable = new dynamodb.Table(this, "RateLimitTable", {
      tableName: DEFAULT_RATE_LIMIT_TABLE_NAME,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: "ttl",
    });

    // Cross-post comment feed. One constant partition, so it is a hot one —
    // an accepted trade at personal-blog volume.
    table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // --- Async AI summaries: queue -> summarizer Lambda -> Bedrock ---
    const summaryDlq = new sqs.Queue(this, "SummaryDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });
    const summaryQueue = new sqs.Queue(this, "SummaryQueue", {
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue: { queue: summaryDlq, maxReceiveCount: 3 },
    });

    const summarizer = new NodeLambda(this, "Summarizer", {
      handlerName: "summarizer",
      timeout: cdk.Duration.seconds(60),
      // Bounds Bedrock load, and cost.
      reservedConcurrentExecutions: 2,
      environment: {
        TABLE_NAME: table.tableName,
        BEDROCK_MODEL_ID,
      },
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
      nextjsPath: packageRoot("@dakotajp/web"), // packages/web (the Next.js app)
      environment: {
        TABLE_NAME: table.tableName,
        RATE_LIMIT_TABLE_NAME: rateLimitTable.tableName,
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

    table.grantReadWriteData(site.serverFunction.lambdaFunction);
    // Only the server function rate-limits; the summarizer has no public entry
    // point, so it gets no grant here.
    rateLimitTable.grantReadWriteData(site.serverFunction.lambdaFunction);
    site.serverFunction.lambdaFunction.addToRolePolicy(bedrockInvokePolicy());
    summaryQueue.grantSendMessages(site.serverFunction.lambdaFunction);

    // GOTCHA: these parameters are created out-of-band by `set-admin-password`,
    // not by this stack. A fresh deploy has no admin until that script runs.
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
