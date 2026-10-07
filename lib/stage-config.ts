import type { Environment } from "aws-cdk-lib";

export const VALID_STAGES = ["sandbox", "dev", "prod"] as const;
export type StageId = (typeof VALID_STAGES)[number];

export function parseStage(raw: string | undefined): StageId {
  const stage = (raw ?? "dev") as string;
  if (!VALID_STAGES.includes(stage as StageId)) {
    throw new Error(`Invalid stage "${stage}". Use one of: ${VALID_STAGES.join(", ")}`);
  }
  return stage as StageId;
}

export function resolveDeployRegion(contextDefaultRegion?: string): string {
  return (
    process.env.CDK_DEFAULT_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    contextDefaultRegion?.trim() ||
    "ap-southeast-2"
  );
}

export function stackEnvForStage(_stage: StageId, contextDefaultRegion?: string): Environment {
  return {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: resolveDeployRegion(contextDefaultRegion),
  };
}
