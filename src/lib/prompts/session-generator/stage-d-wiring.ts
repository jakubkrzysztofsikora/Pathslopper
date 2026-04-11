import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { SessionEdgeSchema, EndingSchema } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";
import type { StageASkeleton } from "./stage-a-skeleton";
import type { StageBScenes } from "./stage-b-scenes";
import type { StageCWorldKit } from "./stage-c-worldkit";

export const STAGE_D_TEMPERATURE = 0.3;

export const StageDWiringSchema = z.object({
  edges: z.array(SessionEdgeSchema),
  endings: z.array(EndingSchema).min(2).max(5),
  startNodeId: z.string(),
});

export type StageDWiring = z.infer<typeof StageDWiringSchema>;

export interface StageDInput {
  brief: SessionBrief;
  skeleton: StageASkeleton;
  scenes: StageBScenes;
  worldKit: StageCWorldKit;
}

export function buildStageDPrompt(input: StageDInput): { system: string; user: string } {
  // TODO Phase 2B: real prompt for edge + ending wiring
  const system = `${POLISH_OUTPUT_CLAUSE}\n\n// TODO Phase 2B: real system prompt for Stage D`;
  const user = `INPUT:\n${JSON.stringify(input, null, 2)}\n\nEmit JSON matching the Stage D output schema.`;
  return { system, user };
}
