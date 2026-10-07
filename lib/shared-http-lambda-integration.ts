import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import type * as lambda from "aws-cdk-lib/aws-lambda";

/** One Lambda permission for the whole HTTP API. */
export class SharedHttpLambdaIntegration extends apigwv2.HttpRouteIntegration {
  constructor(
    id: string,
    private readonly handler: lambda.IFunction,
  ) {
    super(id);
  }

  bind(_options: apigwv2.HttpRouteIntegrationBindOptions): apigwv2.HttpRouteIntegrationConfig {
    return {
      type: apigwv2.HttpIntegrationType.AWS_PROXY,
      uri: this.handler.functionArn,
      payloadFormatVersion: apigwv2.PayloadFormatVersion.VERSION_2_0,
    };
  }
}
