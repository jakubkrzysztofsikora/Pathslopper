import { z } from "zod";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";

export const STAGE_E_TEMPERATURE = 0.8;

export const StageEProseSchema = z.object({
  nodePrompts: z.record(z.string(), z.string().max(4000)),
});

export type StageEProse = z.infer<typeof StageEProseSchema>;

export interface StageEInput {
  assembledGraph: Omit<SessionGraph, "createdAt" | "updatedAt" | "validatedAt">;
}

export function buildStageEPrompt(input: StageEInput): { system: string; user: string } {
  // TODO Phase 2B: real Polish prompt for node prose generation
  const system = `${POLISH_OUTPUT_CLAUSE}\n\n// TODO Phase 2B: real system prompt for Stage E`;
  const user = `INPUT:\n${JSON.stringify(input, null, 2)}\n\nEmit JSON matching the Stage E output schema.`;
  return { system, user };
}
