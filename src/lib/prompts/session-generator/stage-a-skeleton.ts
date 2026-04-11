import { z } from "zod";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import { POLISH_OUTPUT_CLAUSE } from "@/lib/prompts/system/gm-core";

export const STAGE_A_TEMPERATURE = 0.9;

export const StageASkeletonSchema = z.object({
  acts: z
    .array(
      z.object({
        title: z.string().max(120),
        stakes: z.string().max(400),
      })
    )
    .min(1)
    .max(3),
  fronts: z
    .array(
      z.object({
        name: z.string().max(120),
        dangers: z
          .array(
            z.object({
              name: z.string(),
              impulse: z.string(),
            })
          )
          .min(1)
          .max(5),
        grimPortents: z.array(z.string()).min(3).max(5),
        impendingDoom: z.string().max(400),
        stakes: z.array(z.string()).min(1).max(5),
      })
    )
    .min(1)
    .max(4),
  primaryConflict: z.string().max(400),
});

export type StageASkeleton = z.infer<typeof StageASkeletonSchema>;

export function buildStageAPrompt(input: SessionBrief): { system: string; user: string } {
  // TODO Phase 2B: real Polish prompt for skeleton generation
  const system = `${POLISH_OUTPUT_CLAUSE}\n\n// TODO Phase 2B: real system prompt for Stage A`;
  const user = `INPUT:\n${JSON.stringify(input, null, 2)}\n\nEmit JSON matching the Stage A output schema.`;
  return { system, user };
}
