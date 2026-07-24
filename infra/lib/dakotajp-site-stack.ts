import * as path from "node:path";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import { Nextjs } from "cdk-nextjs-standalone";

const DOMAIN_NAME = "dakotajp.com";
const WWW_DOMAIN = `www.${DOMAIN_NAME}`;
const TABLE_NAME = "dakotajp-site";

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
    });

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
      nextjsPath: path.resolve(__dirname, "..", ".."), // repo root (the Next.js app)
      environment: {
        TABLE_NAME: table.tableName,
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

    // --- Outputs ---
    new cdk.CfnOutput(this, "SiteUrl", { value: `https://${DOMAIN_NAME}` });
    new cdk.CfnOutput(this, "DistributionDomain", {
      value: site.distribution.distributionDomain,
    });
    new cdk.CfnOutput(this, "TableNameOutput", { value: table.tableName });
  }
}
