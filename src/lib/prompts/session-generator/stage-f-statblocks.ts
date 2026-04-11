import { z } from "zod";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { Pf2eStatBlockSchema } from "@/lib/schemas/session-graph";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";

export const STAGE_F_TEMPERATURE = 0.2;

export const StageFStatBlocksSchema = z.object({
  statBlocks: z.record(z.string(), Pf2eStatBlockSchema),
});

export type StageFStatBlocks = z.infer<typeof StageFStatBlocksSchema>;

export interface StageFInput {
  graph: Omit<SessionGraph, "createdAt" | "updatedAt" | "validatedAt">;
}

export function buildStageFPrompt(input: StageFInput): { system: string; user: string } {
  // Stage F is mechanical (stat blocks) — POLISH_OUTPUT_CLAUSE is included
  // but stat block fields remain English numbers + dice expressions.
  const system = `${POLISH_OUTPUT_CLAUSE}\n\n// TODO Phase 2B: real system prompt for Stage F`;
  const user = `INPUT:\n${JSON.stringify(input, null, 2)}\n\nEmit JSON matching the Stage F output schema.`;
  return { system, user };
}
