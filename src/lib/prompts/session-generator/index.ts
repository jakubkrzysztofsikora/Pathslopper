import type {
  SessionBrief,
} from "@/lib/schemas/session-brief";
import {
  StageASkeletonSchema,
  buildStageAPrompt,
  STAGE_A_TEMPERATURE,
  type StageASkeleton,
} from "./stage-a-skeleton";
import {
  StageBScenesSchema,
  buildStageBPrompt,
  STAGE_B_TEMPERATURE,
  type StageBScenes,
  type StageBInput,
} from "./stage-b-scenes";
import {
  StageCWorldKitSchema,
  buildStageCPrompt,
  STAGE_C_TEMPERATURE,
  type StageCWorldKit,
  type StageCInput,
} from "./stage-c-worldkit";
import {
  StageDWiringSchema,
  buildStageDPrompt,
  STAGE_D_TEMPERATURE,
  type StageDWiring,
  type StageDInput,
} from "./stage-d-wiring";
import {
  StageEProseSchema,
  buildStageEPrompt,
  STAGE_E_TEMPERATURE,
  type StageEProse,
  type StageEInput,
} from "./stage-e-prose";
import {
  StageFStatBlocksSchema,
  buildStageFPrompt,
  STAGE_F_TEMPERATURE,
  type StageFStatBlocks,
  type StageFInput,
} from "./stage-f-statblocks";

export type {
  StageASkeleton,
  StageBScenes,
  StageBInput,
  StageCWorldKit,
  StageCInput,
  StageDWiring,
  StageDInput,
  StageEProse,
  StageEInput,
  StageFStatBlocks,
  StageFInput,
};

export {
  StageASkeletonSchema,
  StageBScenesSchema,
  StageCWorldKitSchema,
  StageDWiringSchema,
  StageEProseSchema,
  StageFStatBlocksSchema,
};

export interface GeneratorChain {
  stageA: {
    schema: typeof StageASkeletonSchema;
    temperature: typeof STAGE_A_TEMPERATURE;
    buildPrompt: (input: SessionBrief) => { system: string; user: string };
  };
  stageB: {
    schema: typeof StageBScenesSchema;
    temperature: typeof STAGE_B_TEMPERATURE;
    buildPrompt: (input: StageBInput) => { system: string; user: string };
  };
  stageC: {
    schema: typeof StageCWorldKitSchema;
    temperature: typeof STAGE_C_TEMPERATURE;
    buildPrompt: (input: StageCInput) => { system: string; user: string };
  };
  stageD: {
    schema: typeof StageDWiringSchema;
    temperature: typeof STAGE_D_TEMPERATURE;
    buildPrompt: (input: StageDInput) => { system: string; user: string };
  };
  stageE: {
    schema: typeof StageEProseSchema;
    temperature: typeof STAGE_E_TEMPERATURE;
    buildPrompt: (input: StageEInput) => { system: string; user: string };
  };
  stageF: {
    schema: typeof StageFStatBlocksSchema;
    temperature: typeof STAGE_F_TEMPERATURE;
    buildPrompt: (input: StageFInput) => { system: string; user: string };
  };
}

// Chain construction is brief-independent: every stage's buildPrompt
// already receives its own typed input (the brief is passed through
// Stage A's input directly). Removed the dead `_brief` parameter per
// the architect review of Phase 2A. When Phase 2B introduces real
// prompts with preset/tone-aware sub-prompts, this function may need
// to accept a selector (not the brief itself).
export function buildGeneratorChain(): GeneratorChain {
  return {
    stageA: {
      schema: StageASkeletonSchema,
      temperature: STAGE_A_TEMPERATURE,
      buildPrompt: buildStageAPrompt,
    },
    stageB: {
      schema: StageBScenesSchema,
      temperature: STAGE_B_TEMPERATURE,
      buildPrompt: buildStageBPrompt,
    },
    stageC: {
      schema: StageCWorldKitSchema,
      temperature: STAGE_C_TEMPERATURE,
      buildPrompt: buildStageCPrompt,
    },
    stageD: {
      schema: StageDWiringSchema,
      temperature: STAGE_D_TEMPERATURE,
      buildPrompt: buildStageDPrompt,
    },
    stageE: {
      schema: StageEProseSchema,
      temperature: STAGE_E_TEMPERATURE,
      buildPrompt: buildStageEPrompt,
    },
    stageF: {
      schema: StageFStatBlocksSchema,
      temperature: STAGE_F_TEMPERATURE,
      buildPrompt: buildStageFPrompt,
    },
  };
}
