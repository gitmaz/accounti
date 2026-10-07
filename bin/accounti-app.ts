#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { AccountiStack } from "../lib/accounti-stack";
import { parseStage, stackEnvForStage } from "../lib/stage-config";

const app = new cdk.App();
const stage = parseStage(app.node.tryGetContext("stage") as string | undefined);
const env = stackEnvForStage(stage, app.node.tryGetContext("defaultRegion") as string | undefined);

new AccountiStack(app, `Accounti-${stage}`, {
  stage,
  env,
  description: `Accounti API + SPA — ${stage}`,
});
