import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { NodeKindSchema } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";
import type { StageASkeleton } from "./stage-a-skeleton";

export const STAGE_B_TEMPERATURE = 0.7;

export const StageBScenesSchema = z.object({
  scenes: z
    .array(
      z.object({
        id: z.string(),
        title: z.string().max(120),
        synopsis: z.string().max(400),
        kind: NodeKindSchema,
        act: z.number().int().min(1).max(3),
        tensionLevel: z.number().min(0).max(10),
        estimatedMinutes: z.number().int().min(1).max(90),
        npcsPresent: z.array(z.string()).default([]),
        locationRef: z.string().optional(),
      })
    )
    .min(8)
    .max(40),
});

export type StageBScenes = z.infer<typeof StageBScenesSchema>;

export interface StageBInput {
  brief: SessionBrief;
  skeleton: StageASkeleton;
}

export function buildStageBPrompt(input: StageBInput): { system: string; user: string } {
  // TODO Phase 2B: real Polish prompt for scene list generation
  const system = `${POLISH_OUTPUT_CLAUSE}\n\n// TODO Phase 2B: real system prompt for Stage B`;
  const user = `INPUT:\n${JSON.stringify(input, null, 2)}\n\nEmit JSON matching the Stage B output schema.`;
  return { system, user };
}
