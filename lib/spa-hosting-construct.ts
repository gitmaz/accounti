import * as fs from "fs";
import * as path from "path";
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

import type { SpaHostingMode } from "./resolve-spa-hosting";
import type { StageId } from "./stage-config";

export interface SpaHostingConstructProps {
  readonly stage: StageId;
  readonly mode: SpaHostingMode;
  readonly upload?: boolean;
}

/** Publishes the Vite SPA from spa/dist to S3 + CloudFront (OAC, SPA fallback). */
export class SpaHostingConstruct extends Construct {
  readonly cloudFrontUrl: string;

  constructor(scope: Construct, id: string, props: SpaHostingConstructProps) {
    super(scope, id);
    const { stage } = props;
    const upload = props.upload !== false;
    const stack = Stack.of(this);
    const distPath = path.join(__dirname, "..", "spa", "dist");
    if (upload && !fs.existsSync(distPath)) {
      throw new Error("spa/dist is missing. Run npm run spa:build before deploy (or deploy with spaUpload=false).");
    }

    const bucket = new s3.Bucket(this, "SpaOrigin", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      autoDeleteObjects: stage !== "prod",
      removalPolicy: stage === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      enforceSSL: true,
    });

    const priceClass = stage === "prod" ? cloudfront.PriceClass.PRICE_CLASS_ALL : cloudfront.PriceClass.PRICE_CLASS_100;
    const distribution = new cloudfront.Distribution(this, "SpaDistribution", {
      comment: `Accounti SPA (${stage})`,
      defaultRootObject: "index.html",
      priceClass,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        compress: true,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: "/index.html", ttl: Duration.minutes(5) },
      ],
    });

    if (upload) {
      new s3deploy.BucketDeployment(this, "SpaDeploy", {
        sources: [s3deploy.Source.asset(distPath)],
        destinationBucket: bucket,
        distribution,
        distributionPaths: ["/*"],
        memoryLimit: 4096,
      });
    }

    this.cloudFrontUrl = `https://${distribution.distributionDomainName}`;
    new CfnOutput(stack, "SpaCloudFrontUrl", {
      value: this.cloudFrontUrl,
      description: "Accounti SPA. Companies live at /{company-slug}/.",
    });
    new CfnOutput(stack, "SpaCloudFrontDistributionId", { value: distribution.distributionId });
  }
}
