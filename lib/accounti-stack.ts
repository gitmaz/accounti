import * as path from "path";
import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

import { resolveSpaHosting, resolveSpaUpload } from "./resolve-spa-hosting";
import { SharedHttpLambdaIntegration } from "./shared-http-lambda-integration";
import { SpaHostingConstruct } from "./spa-hosting-construct";
import type { StageId } from "./stage-config";

export interface AccountiStackProps extends cdk.StackProps {
  stage: StageId;
}

export class AccountiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AccountiStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const removal = stage === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const table = (name: string, partitionKey: string) =>
      new dynamodb.Table(this, name, {
        tableName: `accounti-${name.toLowerCase()}`,
        partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: removal,
        pointInTimeRecovery: stage === "prod",
      });

    const companies = table("Companies", "slug");
    const accounts = table("Accounts", "email");
    const books = table("Books", "slug");
    const sesFromEmail =
      process.env.SES_FROM_EMAIL?.trim() ||
      String(this.node.tryGetContext("sesFromEmail") || "").trim() ||
      "mn.usyd@gmail.com";

    const apiFn = new NodejsFunction(this, "ApiFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: Duration.seconds(60),
      memorySize: 256,
      entry: path.join(__dirname, "..", "lambda", "api", "index.ts"),
      handler: "handler",
      description: `Accounti REST API (${stage})`,
      environment: {
        STAGE: stage,
        COMPANIES_TABLE_NAME: companies.tableName,
        ACCOUNTS_TABLE_NAME: accounts.tableName,
        BOOKS_TABLE_NAME: books.tableName,
        STORE: "dynamo",
        DEMO_AUTH: stage === "prod" ? "0" : "1",
        HANDSHAKE_SAAS_API_URL:
          (this.node.tryGetContext("handshakeSaasApiUrl") as string | undefined)?.trim() ||
          process.env.HANDSHAKE_SAAS_API_URL?.trim() ||
          "",
        HANDSHAKE_ADMIN_SECRET:
          (this.node.tryGetContext("handshakeAdminSecret") as string | undefined)?.trim() ||
          process.env.HANDSHAKE_ADMIN_SECRET?.trim() ||
          `handshake-admin-${stage}`,
        SES_FROM_EMAIL: sesFromEmail,
        SES_FROM_NAME: "Accounti",
      },
      bundling: {
        minify: true,
        sourceMap: true,
        externalModules: ["@aws-sdk/client-dynamodb", "@aws-sdk/lib-dynamodb"],
      },
    });
    companies.grantReadWriteData(apiFn);
    accounts.grantReadWriteData(apiFn);
    books.grantReadWriteData(apiFn);
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: [
          `arn:aws:ses:${this.region}:${this.account}:identity/${sesFromEmail}`,
          `arn:aws:ses:${this.region}:${this.account}:identity/*`,
        ],
      }),
    );

    const httpApi = new apigwv2.HttpApi(this, "AccountiHttpApi", {
      apiName: `accounti-${stage}`,
      corsPreflight: {
        allowHeaders: ["content-type", "authorization", "x-handshake-admin-key"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
      },
    });
    const integration = new SharedHttpLambdaIntegration("ApiIntegration", apiFn);
    apiFn.addPermission("InvokeFromHttpApi", {
      principal: new iam.ServicePrincipal("apigateway.amazonaws.com"),
      sourceArn: Stack.of(this).formatArn({
        service: "execute-api",
        resource: httpApi.apiId,
        resourceName: "*/*/*",
      }),
    });
    for (const pathName of [
      "/health",
      "/config",
      "/auth/login",
      "/auth/activate",
      "/auth/trial",
      "/{slug}/workspace",
      "/{slug}/contacts",
      "/{slug}/contacts/{id}",
      "/{slug}/accounts",
      "/{slug}/documents",
      "/{slug}/documents/{id}",
      "/{slug}/documents/{id}/{action}",
      "/{slug}/reports",
      "/{slug}/reconcile",
      "/{slug}/members",
    ]) {
      httpApi.addRoutes({
        path: pathName,
        methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST, apigwv2.HttpMethod.PUT, apigwv2.HttpMethod.PATCH, apigwv2.HttpMethod.DELETE],
        integration,
      });
    }

    const hosting = resolveSpaHosting(this);
    if (hosting === "cloudfront") new SpaHostingConstruct(this, "Spa", { stage, mode: hosting, upload: resolveSpaUpload(this) });

    new CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new CfnOutput(this, "SesFromEmail", { value: sesFromEmail });
  }
}
