import { randomUUID } from "node:crypto";
import type { CallLLM, ChatMessage, ResponseFormat } from "@/lib/llm/client";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type { SessionGraph } from "@/lib/schemas/session-graph";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";
import {
  buildGeneratorChain,
  type StageASkeleton,
  type StageBScenes,
  type StageCWorldKit,
  type StageDWiring,
  type StageEProse,
  type StageFStatBlocks,
} from "@/lib/prompts/session-generator";
import { STAGE_C_JSON_SCHEMA } from "@/lib/prompts/session-generator/stage-c-worldkit";
import { STAGE_D_JSON_SCHEMA } from "@/lib/prompts/session-generator/stage-d-wiring";
import { STAGE_F_JSON_SCHEMA } from "@/lib/prompts/session-generator/stage-f-statblocks";
import type { SessionNode, SessionGraph as SG } from "@/lib/schemas/session-graph";
import { extractJsonBlock } from "@/lib/llm/json-extract";
import { compileGraph } from "@/lib/orchestration/director/ink";

type PartialSessionGraph = Omit<SG, "createdAt" | "updatedAt" | "validatedAt">;

export interface GenerateSessionDeps {
  callLLM: CallLLM;
  logger?: (stage: string, info: unknown) => void;
}

export type GenerateSessionFailureStage = "A" | "B" | "C" | "D" | "E" | "F" | "validate";

export type GenerateSessionResult =
  | { ok: true; graph: SessionGraph; warnings: string[] }
  | { ok: false; stage: GenerateSessionFailureStage; error: string; partial?: unknown };

const UPSTREAM_ERROR = "Upstream model call failed.";
const PARSE_ERROR = "Stage output could not be parsed against schema.";

/**
 * Run one LLM stage with a single retry on parse failure. Returns the parsed
 * value or throws with context so the caller can return a typed failure result.
 *
 * When `responseFormat` is provided it is forwarded to `callLLM` so Scaleway
 * applies server-side constrained decoding — making parse failures much rarer.
 * The retry path still exists as a safety net (e.g., network hiccup, schema
 * too complex for the model to satisfy fully).
 */
async function runStageWithRetry<T>(
  stageLabel: GenerateSessionFailureStage,
  prompts: { system: string; user: string },
  temperature: number,
  parse: (raw: string) => T | null,
  callLLM: CallLLM,
  logger: ((stage: string, info: unknown) => void) | undefined,
  responseFormat?: ResponseFormat
): Promise<{ ok: true; value: T } | { ok: false; error: string; raw?: string }> {
  const messages: ChatMessage[] = [{ role: "user", content: prompts.user }];

  let raw: string;
  try {
    raw = await callLLM({ system: prompts.system, messages, temperature, responseFormat });
  } catch (err) {
    logger?.(stageLabel, err);
    return { ok: false, error: UPSTREAM_ERROR };
  }

  const parsed = parse(raw);
  if (parsed !== null) return { ok: true, value: parsed };

  // Retry once: feed the bad output + a targeted correction
  const retryMessages: ChatMessage[] = [
    { role: "user", content: prompts.user },
    { role: "assistant", content: raw },
    {
      role: "user",
      content:
        "Your previous response could not be parsed as valid JSON matching the required schema. " +
        "Rewrite ONLY the JSON object — no markdown, no code fences, no explanation. " +
        "Fix all structural issues so it validates against the schema.",
    },
  ];

  let retryRaw: string;
  try {
    retryRaw = await callLLM({ system: prompts.system, messages: retryMessages, temperature, responseFormat });
  } catch (err) {
    logger?.(`${stageLabel}-retry`, err);
    return { ok: false, error: UPSTREAM_ERROR, raw };
  }

  const retryParsed = parse(retryRaw);
  if (retryParsed !== null) return { ok: true, value: retryParsed };

  return { ok: false, error: PARSE_ERROR, raw: retryRaw };
}

/**
 * Assemble a partial SessionGraph from all six stage outputs, then fill in
 * the node prompt fields from Stage E.
 */
function assembleGraph(
  brief: SessionBrief,
  stageA: StageASkeleton,
  stageB: StageBScenes,
  stageC: StageCWorldKit,
  stageD: StageDWiring,
  stageE: StageEProse,
  stageF: StageFStatBlocks
): Partial<SessionGraph> {
  const now = new Date().toISOString();

  // Build SessionNodes from Stage B scenes + Stage E prompts
  const nodes: SessionNode[] = stageB.scenes.map((scene) => ({
    id: scene.id,
    kind: scene.kind,
    act: scene.act,
    title: scene.title,
    synopsis: scene.synopsis,
    // Stage E fills in the per-node narration seed
    prompt: stageE.nodePrompts[scene.id] ?? "",
    estimatedMinutes: scene.estimatedMinutes,
    tensionLevel: scene.tensionLevel,
    npcsPresent: scene.npcsPresent ?? [],
    locationId: scene.locationRef,
    // Defaults for optional session-node fields
    obstacles: [],
    contentWarnings: [],
    tags: [],
    onEnterEffects: [],
    repeatable: false,
  }));

  // Merge Stage F stat blocks into Stage C NPCs
  const npcs = stageC.npcs.map((npc) => {
    const statBlock = stageF.statBlocks[npc.id];
    if (statBlock) return { ...npc, statBlock };
    return npc;
  });

  // Build Fronts from Stage A (add firedPortents=0 and required id)
  const fronts = stageA.fronts.map((f, idx) => ({
    id: `front-${idx + 1}`,
    name: f.name,
    stakes: f.stakes,
    dangers: f.dangers,
    grimPortents: f.grimPortents,
    impendingDoom: f.impendingDoom,
    firedPortents: 0,
  }));

  return {
    id: randomUUID(),
    version: brief.version,
    brief,
    startNodeId: stageD.startNodeId,
    nodes,
    edges: stageD.edges,
    clocks: stageC.clocks,
    fronts,
    secrets: stageC.secrets,
    npcs,
    locations: stageC.locations,
    endings: stageD.endings,
    createdAt: now,
    updatedAt: now,
  };
}

export async function generateSession(
  brief: SessionBrief,
  deps: GenerateSessionDeps
): Promise<GenerateSessionResult> {
  const { callLLM, logger } = deps;
  const chain = buildGeneratorChain();

  // Stage A — skeleton (json_object: simpler structure, no complex unions)
  const stageAResult = await runStageWithRetry(
    "A",
    chain.stageA.buildPrompt(brief),
    chain.stageA.temperature,
    (raw) => {
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) return null;
      const result = chain.stageA.schema.safeParse(JSON.parse(jsonStr));
      return result.success ? result.data : null;
    },
    callLLM,
    logger,
    { type: "json_object" }
  );
  if (!stageAResult.ok) return { ok: false, stage: "A", error: stageAResult.error, partial: stageAResult.raw };
  const stageA = stageAResult.value;

  // Stage B — scenes (json_object: straightforward array structure)
  const stageBResult = await runStageWithRetry(
    "B",
    chain.stageB.buildPrompt({ brief, skeleton: stageA }),
    chain.stageB.temperature,
    (raw) => {
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) return null;
      const result = chain.stageB.schema.safeParse(JSON.parse(jsonStr));
      return result.success ? result.data : null;
    },
    callLLM,
    logger,
    { type: "json_object" }
  );
  if (!stageBResult.ok) return { ok: false, stage: "B", error: stageBResult.error, partial: stageBResult.raw };
  const stageB = stageBResult.value;

  // Stage C — world kit (json_schema: complex NPC/clock/secret unions, highest failure rate)
  const stageCResult = await runStageWithRetry(
    "C",
    chain.stageC.buildPrompt({ brief, skeleton: stageA, scenes: stageB }),
    chain.stageC.temperature,
    (raw) => {
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) return null;
      const result = chain.stageC.schema.safeParse(JSON.parse(jsonStr));
      return result.success ? result.data : null;
    },
    callLLM,
    logger,
    {
      type: "json_schema",
      json_schema: {
        name: "StageCWorldKit",
        schema: STAGE_C_JSON_SCHEMA,
        strict: true,
      },
    }
  );
  if (!stageCResult.ok) return { ok: false, stage: "C", error: stageCResult.error, partial: stageCResult.raw };
  const stageC = stageCResult.value;

  // Stage D — wiring (json_schema, strict:false: the Predicate condition type is
  // recursive — an/or/not trees — which prevents the server from building a finite
  // constrained-decoding grammar. strict:false lets the endpoint validate the
  // top-level shape while tolerating the recursive subtree.)
  const stageDResult = await runStageWithRetry(
    "D",
    chain.stageD.buildPrompt({ brief, skeleton: stageA, scenes: stageB, worldKit: stageC }),
    chain.stageD.temperature,
    (raw) => {
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) return null;
      const result = chain.stageD.schema.safeParse(JSON.parse(jsonStr));
      return result.success ? result.data : null;
    },
    callLLM,
    logger,
    {
      type: "json_schema",
      json_schema: {
        name: "StageDWiring",
        schema: STAGE_D_JSON_SCHEMA,
        strict: false,
      },
    }
  );
  if (!stageDResult.ok) return { ok: false, stage: "D", error: stageDResult.error, partial: stageDResult.raw };
  const stageD = stageDResult.value;

  // Partial assembly for Stage E (needs assembled structure minus node prompts)
  const partialGraph = assembleGraph(
    brief,
    stageA,
    stageB,
    stageC,
    stageD,
    { nodePrompts: {} },
    { statBlocks: {} }
  );

  // Stage E — prose (json_object: simple record of nodeId → string prompts)
  const stageEResult = await runStageWithRetry(
    "E",
    chain.stageE.buildPrompt({
      assembledGraph: partialGraph as PartialSessionGraph,
    }),
    chain.stageE.temperature,
    (raw) => {
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) return null;
      const result = chain.stageE.schema.safeParse(JSON.parse(jsonStr));
      return result.success ? result.data : null;
    },
    callLLM,
    logger,
    { type: "json_object" }
  );
  if (!stageEResult.ok) return { ok: false, stage: "E", error: stageEResult.error, partial: stageEResult.raw };
  const stageE = stageEResult.value;

  // Stage F — stat blocks (json_schema: Pf2eStatBlock union is particularly strict)
  const stageFResult = await runStageWithRetry(
    "F",
    chain.stageF.buildPrompt({
      graph: partialGraph as PartialSessionGraph,
      partyLevel: brief.partyLevel,
    }),
    chain.stageF.temperature,
    (raw) => {
      const jsonStr = extractJsonBlock(raw);
      if (!jsonStr) return null;
      const result = chain.stageF.schema.safeParse(JSON.parse(jsonStr));
      return result.success ? result.data : null;
    },
    callLLM,
    logger,
    {
      type: "json_schema",
      json_schema: {
        name: "StageFStatBlocks",
        schema: STAGE_F_JSON_SCHEMA,
        strict: true,
      },
    }
  );
  if (!stageFResult.ok) return { ok: false, stage: "F", error: stageFResult.error, partial: stageFResult.raw };
  const stageF = stageFResult.value;

  // Assemble final graph
  const assembled = assembleGraph(brief, stageA, stageB, stageC, stageD, stageE, stageF);

  // Validation pass
  const parseResult = SessionGraphSchema.safeParse(assembled);
  if (parseResult.success) {
    // Compile-check: verify the graph produces valid Ink before returning.
    // Real LLM output can contain reserved Ink syntax (e.g. ->, ===, *) that
    // passes schema validation but crashes inkjs at runtime. Catching it here
    // lets us run the repair path rather than serving a broken graph.
    const { compiledJson: checkJson, warnings: compileWarnings } = await compileGraph(parseResult.data);
    if (!checkJson) {
      // Treat compile failure like a schema validation failure — run repair.
      const compileError = compileWarnings.join("; ");
      logger?.("compile-check", { error: compileError });

      const repairSystem =
        "You are a JSON repair assistant. The SessionGraph JSON below produces invalid Ink syntax when rendered. " +
        "Fix the node prompt and edge label fields so they contain plain prose text with no Ink reserved syntax " +
        "(no ->, ===, *, +, ~, {, }, #, //). " +
        "Return ONLY the corrected JSON object — no markdown, no explanation.";
      const repairUser =
        `COMPILE ERRORS:\n${compileError}\n\nPARTIAL GRAPH:\n${JSON.stringify(parseResult.data, null, 2)}\n\n` +
        "Return the minimally corrected SessionGraph JSON.";

      let compileRepairRaw: string;
      try {
        compileRepairRaw = await callLLM({
          system: repairSystem,
          messages: [{ role: "user", content: repairUser }],
          temperature: 0.1,
        });
      } catch (err) {
        logger?.("compile-repair", err);
        return { ok: false, stage: "validate", error: "Upstream model call failed.", partial: assembled };
      }

      const compileRepairJsonStr = extractJsonBlock(compileRepairRaw);
      if (!compileRepairJsonStr) {
        return { ok: false, stage: "validate", error: "Stage output could not be parsed against schema.", partial: assembled };
      }

      const compileRepairedParsed: unknown = JSON.parse(compileRepairJsonStr);
      const compileRepairedResult = SessionGraphSchema.safeParse(compileRepairedParsed);
      if (!compileRepairedResult.success) {
        return {
          ok: false,
          stage: "validate",
          error: `Compile-repair failed: ${compileRepairedResult.error.errors.map((e) => e.message).join("; ")}`,
          partial: compileRepairedParsed,
        };
      }

      return {
        ok: true,
        graph: compileRepairedResult.data,
        warnings: ["Graph required Ink compile repair.", ...compileWarnings],
      };
    }

    return { ok: true, graph: parseResult.data, warnings: compileWarnings };
  }

  // Validator repair — one shot
  const repairErrors = parseResult.error.errors
    .map((e) => `${e.path.join(".")}: ${e.message}`)
    .join("\n");

  const repairSystem =
    "You are a JSON repair assistant. Fix the SessionGraph JSON to satisfy all validation errors listed below. " +
    "Return ONLY the corrected JSON object — no markdown, no explanation.";
  const repairUser =
    `VALIDATION ERRORS:\n${repairErrors}\n\nPARTIAL GRAPH:\n${JSON.stringify(assembled, null, 2)}\n\n` +
    "Return the minimally corrected SessionGraph JSON.";

  let repairedRaw: string;
  try {
    repairedRaw = await callLLM({
      system: repairSystem,
      messages: [{ role: "user", content: repairUser }],
      temperature: 0.1,
    });
  } catch (err) {
    logger?.("validate-repair", err);
    return { ok: false, stage: "validate", error: UPSTREAM_ERROR, partial: assembled };
  }

  const repairedJsonStr = extractJsonBlock(repairedRaw);
  if (!repairedJsonStr) {
    return { ok: false, stage: "validate", error: PARSE_ERROR, partial: assembled };
  }

  const repairedParsed: unknown = JSON.parse(repairedJsonStr);
  const repairedResult = SessionGraphSchema.safeParse(repairedParsed);
  if (!repairedResult.success) {
    return {
      ok: false,
      stage: "validate",
      error: `Repair failed: ${repairedResult.error.errors.map((e) => e.message).join("; ")}`,
      partial: repairedParsed,
    };
  }

  return { ok: true, graph: repairedResult.data, warnings: ["Graph required repair during validation."] };
}
