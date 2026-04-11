import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import {
  NpcSchema,
  LocationSchema,
  SecretSchema,
  ClockSchema,
} from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";
import type { StageASkeleton } from "./stage-a-skeleton";
import type { StageBScenes } from "./stage-b-scenes";

export const STAGE_C_TEMPERATURE = 0.5;

export const StageCWorldKitSchema = z.object({
  npcs: z.array(NpcSchema).min(3).max(12),
  locations: z.array(LocationSchema).min(2).max(10),
  secrets: z.array(SecretSchema).min(6).max(20),
  clocks: z.array(ClockSchema).min(2).max(8),
});

export type StageCWorldKit = z.infer<typeof StageCWorldKitSchema>;

export interface StageCInput {
  brief: SessionBrief;
  skeleton: StageASkeleton;
  scenes: StageBScenes;
}

export function buildStageCPrompt(input: StageCInput): { system: string; user: string } {
  // TODO Phase 2B: real Polish prompt for world-kit assembly
  const system = `${POLISH_OUTPUT_CLAUSE}\n\n// TODO Phase 2B: real system prompt for Stage C`;
  const user = `INPUT:\n${JSON.stringify(input, null, 2)}\n\nEmit JSON matching the Stage C output schema.`;
  return { system, user };
}
