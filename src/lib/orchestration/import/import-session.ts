import type { CallLLM, ChatMessage, ResponseFormat } from "@/lib/llm/client";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type {
  SessionGraph,
  Provenance,
} from "@/lib/schemas/session-graph";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";
import { extractJsonBlock } from "@/lib/llm/json-extract";
import { compileGraph } from "@/lib/orchestration/director/ink";
import { STAGE_C_JSON_SCHEMA } from "@/lib/prompts/session-generator/stage-c-worldkit";
import { STAGE_D_JSON_SCHEMA } from "@/lib/prompts/session-generator/stage-d-wiring";
import { STAGE_F_JSON_SCHEMA } from "@/lib/prompts/session-generator/stage-f-statblocks";
import { assembleGraph } from "@/lib/orchestration/generate-session-assembler";
import { parseMarkdownToSections, type ImportedSections } from "./markdown-parser";
import { buildImportChain } from "./import-stages";

const MAX_MARKDOWN_CHARS = 50_000;
const PAIZO_IP_PATTERNS = [
  /pathfinder\s+society/i,
  /golarion/i,
  /absalom/i,
  /organized\s+play/i,
  /\bpaizo\b/i,
];

export interface ImportSessionDeps {
  callLLM: CallLLM;
  logger?: (stage: string, info: unknown) => void;
}

export interface ImportSessionInput {
  raw: string;
  /** Optional brief override — falls back to frontmatter + sensible defaults. */
  brief?: Partial<SessionBrief>;
}
// Consent-gated synthesis (skip clocks/fronts/endings stages unless the GM
// consents) is planned for v2. Today the orchestrator always synthesises
// missing sections and flags them in `provenance.synthesized` so the UI can
// surface them for review. `pendingConsent` in the return value stays — it
// tells the UI which absent sections were synthesised — but the input
// channel is removed until a real gating implementation lands.

export interface PendingConsent {
  clocks: boolean;
  fronts: boolean;
  endings: boolean;
}

export type ImportSessionResult =
  | {
      ok: true;
      graph: SessionGraph;
      warnings: string[];
      pendingConsent: PendingConsent;
      repairs: string[];
    }
  | {
      ok: false;
      error: string;
      stage?: "A" | "B" | "C" | "D" | "E" | "F" | "validate" | "input";
      partial?: unknown;
    };

const UPSTREAM_ERROR = "Upstream model call failed.";
const PARSE_ERROR = "Stage output could not be parsed against schema.";

async function runStage<T>(
  label: "A" | "B" | "C" | "D" | "E" | "F",
  prompts: { system: string; user: string },
  temperature: number,
  parse: (raw: string) => T | null,
  callLLM: CallLLM,
  logger: ImportSessionDeps["logger"],
  responseFormat?: ResponseFormat
): Promise<{ ok: true; value: T } | { ok: false; error: string; raw?: string }> {
  const messages: ChatMessage[] = [{ role: "user", content: prompts.user }];
  let raw: string;
  try {
    raw = await callLLM({ system: prompts.system, messages, temperature, responseFormat });
  } catch (err) {
    logger?.(label, err);
    return { ok: false, error: UPSTREAM_ERROR };
  }
  const parsed = parse(raw);
  if (parsed !== null) return { ok: true, value: parsed };

  const retryMessages: ChatMessage[] = [
    { role: "user", content: prompts.user },
    { role: "assistant", content: raw },
    {
      role: "user",
      content:
        "Twoja poprzednia odpowiedź nie przeszła walidacji schematu. Napisz wyłącznie sam obiekt JSON — bez Markdown, bez wyjaśnień — zgodny ze schematem, w tym z wymaganym polem 'synthesizedPaths'.",
    },
  ];
  let retryRaw: string;
  try {
    retryRaw = await callLLM({ system: prompts.system, messages: retryMessages, temperature, responseFormat });
  } catch (err) {
    logger?.(`${label}-retry`, err);
    return { ok: false, error: UPSTREAM_ERROR, raw };
  }
  const retryParsed = parse(retryRaw);
  if (retryParsed !== null) return { ok: true, value: retryParsed };
  return { ok: false, error: PARSE_ERROR, raw: retryRaw };
}

function defaultBrief(sections: ImportedSections, override?: Partial<SessionBrief>): SessionBrief {
  const fm = sections.frontmatter;
  return {
    version: (fm.system as SessionBrief["version"]) ?? "pf2e",
    partySize: fm.party_size ?? 4,
    partyLevel: fm.party_level ?? 3,
    targetDurationHours: fm.duration_hours ?? 4,
    tone: override?.tone ?? "imported",
    setting: override?.setting ?? sections.title ?? sections.lede ?? "imported",
    presetId: override?.presetId ?? "custom",
    storyDna: override?.storyDna ?? {
      version: (fm.system as SessionBrief["version"]) ?? "pf2e",
      sliders: { narrativePacing: 5, tacticalLethality: 5, npcImprov: 5 },
      tags: { include: [], exclude: [] },
    } as SessionBrief["storyDna"],
    characterHooks: override?.characterHooks ?? [],
    safetyTools: override?.safetyTools ?? { lines: [], veils: [], xCardEnabled: true },
    ...override,
  };
}

function mergeSynthesizedPaths(
  accumulator: Record<string, string[]>,
  incoming: Record<string, string[]>
): void {
  for (const [id, paths] of Object.entries(incoming)) {
    const existing = accumulator[id] ?? [];
    const set = new Set([...existing, ...paths]);
    accumulator[id] = Array.from(set);
  }
}

function detectLowYield(sections: ImportedSections): boolean {
  return sections.scenes.length < 3 || sections.secrets.length === 0;
}

function detectPaizoIp(raw: string): boolean {
  return PAIZO_IP_PATTERNS.some((re) => re.test(raw));
}

function computePendingConsent(sections: ImportedSections): PendingConsent {
  return {
    clocks: sections.clocks.length === 0,
    fronts: sections.fronts.length === 0,
    endings: sections.endings.length === 0,
  };
}

export async function importSession(
  input: ImportSessionInput,
  deps: ImportSessionDeps
): Promise<ImportSessionResult> {
  const { callLLM, logger } = deps;

  const trimmed = input.raw.trim();
  if (!trimmed) {
    return { ok: false, stage: "input", error: "Import content is empty." };
  }
  if (input.raw.length > MAX_MARKDOWN_CHARS) {
    return {
      ok: false,
      stage: "input",
      error: `Import content is too large (${input.raw.length} chars; max ${MAX_MARKDOWN_CHARS}).`,
    };
  }

  const sections = parseMarkdownToSections(input.raw);
  const brief = defaultBrief(sections, input.brief);

  const chain = buildImportChain();
  const synthesized: Record<string, string[]> = {};

  // Stage A
  const stageA = await runStage(
    "A",
    chain.stageA.buildPrompt({ brief, sections }),
    chain.stageA.temperature,
    (raw) => {
      const json = extractJsonBlock(raw);
      if (!json) return null;
      const parsed = chain.stageA.schema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    },
    callLLM,
    logger,
    { type: "json_object" }
  );
  if (!stageA.ok) return { ok: false, stage: "A", error: stageA.error, partial: stageA.raw };
  mergeSynthesizedPaths(synthesized, stageA.value.synthesizedPaths);

  // Stage B
  const stageB = await runStage(
    "B",
    chain.stageB.buildPrompt({
      brief,
      sections,
      skeleton: stripSynthesized(stageA.value),
    }),
    chain.stageB.temperature,
    (raw) => {
      const json = extractJsonBlock(raw);
      if (!json) return null;
      const parsed = chain.stageB.schema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    },
    callLLM,
    logger,
    { type: "json_object" }
  );
  if (!stageB.ok) return { ok: false, stage: "B", error: stageB.error, partial: stageB.raw };
  mergeSynthesizedPaths(synthesized, stageB.value.synthesizedPaths);

  // Stage C
  const stageC = await runStage(
    "C",
    chain.stageC.buildPrompt({
      brief,
      sections,
      skeleton: stripSynthesized(stageA.value),
      scenes: stripSynthesized(stageB.value),
    }),
    chain.stageC.temperature,
    (raw) => {
      const json = extractJsonBlock(raw);
      if (!json) return null;
      const parsed = chain.stageC.schema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    },
    callLLM,
    logger,
    {
      type: "json_schema",
      json_schema: { name: "StageCWorldKit", schema: STAGE_C_JSON_SCHEMA, strict: true },
    }
  );
  if (!stageC.ok) return { ok: false, stage: "C", error: stageC.error, partial: stageC.raw };
  mergeSynthesizedPaths(synthesized, stageC.value.synthesizedPaths);

  // Stage D
  const stageD = await runStage(
    "D",
    chain.stageD.buildPrompt({
      brief,
      sections,
      skeleton: stripSynthesized(stageA.value),
      scenes: stripSynthesized(stageB.value),
      worldKit: stripSynthesized(stageC.value),
    }),
    chain.stageD.temperature,
    (raw) => {
      const json = extractJsonBlock(raw);
      if (!json) return null;
      const parsed = chain.stageD.schema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    },
    callLLM,
    logger,
    {
      type: "json_schema",
      json_schema: { name: "StageDWiring", schema: STAGE_D_JSON_SCHEMA, strict: false },
    }
  );
  if (!stageD.ok) return { ok: false, stage: "D", error: stageD.error, partial: stageD.raw };
  mergeSynthesizedPaths(synthesized, stageD.value.synthesizedPaths);

  // Stage E needs a partial graph.
  const partialGraph = assembleGraph(
    brief,
    stripSynthesized(stageA.value),
    stripSynthesized(stageB.value),
    stripSynthesized(stageC.value),
    stripSynthesized(stageD.value),
    { nodePrompts: {} },
    { statBlocks: {} }
  );

  const stageE = await runStage(
    "E",
    chain.stageE.buildPrompt({
      sections,
      assembledGraph: partialGraph as Parameters<typeof chain.stageE.buildPrompt>[0]["assembledGraph"],
    }),
    chain.stageE.temperature,
    (raw) => {
      const json = extractJsonBlock(raw);
      if (!json) return null;
      const parsed = chain.stageE.schema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    },
    callLLM,
    logger,
    { type: "json_object" }
  );
  if (!stageE.ok) return { ok: false, stage: "E", error: stageE.error, partial: stageE.raw };
  mergeSynthesizedPaths(synthesized, stageE.value.synthesizedPaths);

  // Stage F — cast is safe: assembleGraph always populates the non-meta fields.
  type StageFGraph = Parameters<typeof chain.stageF.buildPrompt>[0]["graph"];
  const stageF = await runStage(
    "F",
    chain.stageF.buildPrompt({
      brief,
      sections,
      graph: partialGraph as StageFGraph,
      partyLevel: brief.partyLevel,
    }),
    chain.stageF.temperature,
    (raw) => {
      const json = extractJsonBlock(raw);
      if (!json) return null;
      const parsed = chain.stageF.schema.safeParse(JSON.parse(json));
      return parsed.success ? parsed.data : null;
    },
    callLLM,
    logger,
    {
      type: "json_schema",
      json_schema: { name: "StageFStatBlocks", schema: STAGE_F_JSON_SCHEMA, strict: true },
    }
  );
  if (!stageF.ok) return { ok: false, stage: "F", error: stageF.error, partial: stageF.raw };
  mergeSynthesizedPaths(synthesized, stageF.value.synthesizedPaths);

  // Final assembly + validation
  const assembled = assembleGraph(
    brief,
    stripSynthesized(stageA.value),
    stripSynthesized(stageB.value),
    stripSynthesized(stageC.value),
    stripSynthesized(stageD.value),
    stripSynthesized(stageE.value),
    stripSynthesized(stageF.value)
  );

  const repairs: string[] = [];
  const provenance: Provenance = { synthesized };

  // assembleGraph already mints a fresh graph id; don't overwrite it.
  const withProvenance = { ...assembled, provenance };
  const parse = SessionGraphSchema.safeParse(withProvenance);

  if (!parse.success) {
    // One-shot repair via LLM — reuse the same pattern as generate.
    const errText = parse.error.errors
      .map((e) => `${e.path.join(".")}: ${e.message}`)
      .join("\n");
    logger?.("validate", { errors: errText });

    const repairResult = await attemptRepair(
      withProvenance,
      errText,
      callLLM,
      logger
    );
    if (!repairResult.ok) {
      return { ok: false, stage: "validate", error: repairResult.error, partial: withProvenance };
    }
    repairs.push("Graph required repair during validation.");
    return finishOk(repairResult.graph, sections, input.raw, repairs);
  }

  // Ink compile check
  const { compiledJson, warnings: compileWarnings } = await compileGraph(parse.data);
  if (!compiledJson) {
    repairs.push(...compileWarnings);
    const errText = compileWarnings.join("; ");
    const repairResult = await attemptRepair(parse.data, errText, callLLM, logger);
    if (!repairResult.ok) {
      return { ok: false, stage: "validate", error: repairResult.error, partial: parse.data };
    }
    repairs.push("Graph required Ink compile repair.");
    return finishOk(repairResult.graph, sections, input.raw, repairs);
  }

  return finishOk(parse.data, sections, input.raw, [...repairs, ...compileWarnings]);
}

function finishOk(
  graph: SessionGraph,
  sections: ImportedSections,
  raw: string,
  repairs: string[]
): ImportSessionResult {
  const warnings: string[] = [];
  if (detectLowYield(sections)) warnings.push("looks-like-recap");
  if (detectPaizoIp(raw)) warnings.push("paizo-ip");

  return {
    ok: true,
    graph,
    warnings,
    pendingConsent: computePendingConsent(sections),
    repairs,
  };
}

async function attemptRepair(
  graph: unknown,
  errText: string,
  callLLM: CallLLM,
  logger: ImportSessionDeps["logger"]
): Promise<{ ok: true; graph: SessionGraph } | { ok: false; error: string }> {
  const repairSystem =
    "You are a JSON repair assistant. Fix the SessionGraph JSON so it satisfies the validation errors below. " +
    "Return ONLY the corrected JSON object — no markdown, no explanation.";
  const repairUser = `VALIDATION ERRORS:\n${errText}\n\nGRAPH:\n${JSON.stringify(graph, null, 2)}`;
  let rawOut: string;
  try {
    rawOut = await callLLM({
      system: repairSystem,
      messages: [{ role: "user", content: repairUser }],
      temperature: 0.1,
    });
  } catch (err) {
    logger?.("repair", err);
    return { ok: false, error: UPSTREAM_ERROR };
  }
  const json = extractJsonBlock(rawOut);
  if (!json) return { ok: false, error: PARSE_ERROR };
  const parsed = SessionGraphSchema.safeParse(JSON.parse(json));
  if (!parsed.success) {
    return {
      ok: false,
      error: `Repair failed: ${parsed.error.errors.map((e) => e.message).join("; ")}`,
    };
  }
  return { ok: true, graph: parsed.data };
}

function stripSynthesized<T extends { synthesizedPaths: Record<string, string[]> }>(
  stage: T
): Omit<T, "synthesizedPaths"> {
  const { synthesizedPaths: _synth, ...rest } = stage;
  return rest;
}
