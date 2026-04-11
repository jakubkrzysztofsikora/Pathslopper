/**
 * Per-stage LLM-graded quality evaluations for the session generator prompt chain.
 *
 * DEVIATION from the integration test "hard-fail" rule:
 *   These evals are SKIPPED (not failed) when LLM_API_KEY is unset.
 *   Rationale: LLM-graded evals are expensive (6 real model calls per stage)
 *   and should not block local `npm test` runs where no API key is configured.
 *   The `describe.skipIf(!LLM_API_KEY)` handles this automatically.
 *   Integration tests (src/tests/integration/) hard-fail on missing env vars
 *   per the standard repo pattern — evals are a deliberate exception.
 *
 * Runs via: npm run test:evals
 *
 * Implementation note: we use plain vitest + autoevals directly, not
 * vitest-evals. vitest-evals declares a peer dep on vitest >=3 and the
 * repo is on vitest 2.x; removing vitest-evals avoids a brittle
 * --legacy-peer-deps lock on every future npm install. The Factuality
 * scorer from autoevals does the judge-LLM scoring; we assert the
 * resulting score is above a threshold.
 */

import { describe, it, expect } from "vitest";
import { Factuality, init } from "autoevals";
import OpenAI from "openai";

import briefFixture from "../fixtures/promptfoo/brief.json";
import stageAFixture from "../fixtures/generate-session/stage-a.json";
import stageBFixture from "../fixtures/generate-session/stage-b.json";
import stageCFixture from "../fixtures/generate-session/stage-c.json";
import stageDFixture from "../fixtures/generate-session/stage-d.json";
import stageEFixture from "../fixtures/generate-session/stage-e.json";

const hasApiKey = !!process.env.LLM_API_KEY;
const EVAL_TIMEOUT_MS = 60_000;
const QUALITY_THRESHOLD = 0.5;

function getLlmClient(): OpenAI {
  return new OpenAI({
    apiKey: process.env.LLM_API_KEY ?? "no-key",
    baseURL: process.env.LLM_BASE_URL ?? "https://api.scaleway.ai/v1",
  });
}

async function callStageViaLLM(
  system: string,
  user: string,
  temperature = 0.7
): Promise<string> {
  init({
    client: getLlmClient(),
    defaultModel: process.env.LLM_TEXT_MODEL ?? "llama-3.1-70b-instruct",
  });

  const client = getLlmClient();
  const response = await client.chat.completions.create({
    model: process.env.LLM_TEXT_MODEL ?? "llama-3.1-70b-instruct",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature,
  });
  return response.choices[0]?.message?.content ?? "";
}

async function scoreWithFactuality(
  output: string,
  expected: string,
  input: string
): Promise<number> {
  const result = await Factuality({ output, expected, input });
  return typeof result.score === "number" ? result.score : 0;
}

// ------------------------------------------------------------------
// Stage A — Szkielet sesji
// ------------------------------------------------------------------

describe.skipIf(!hasApiKey)("Stage A: session skeleton generation", () => {
  it(
    "produces a valid Polish session skeleton with acts + fronts + primaryConflict",
    async () => {
      const input = JSON.stringify(briefFixture);
      const output = await callStageViaLLM(
        "Jesteś generatorem scenariuszy do Pathfinder 2e. Tworzysz strukturę sesji w języku polskim. Odpowiadaj WYŁĄCZNIE poprawnym JSON.",
        `Wygeneruj szkielet sesji dla następującego briefu:\n${input}`,
        0.9
      );
      const score = await scoreWithFactuality(
        output,
        "Poprawny JSON z polami 'acts', 'fronts', 'primaryConflict'. Teksty w języku polskim. Co najmniej 2 akty i 1 front.",
        input
      );
      expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
    },
    EVAL_TIMEOUT_MS
  );
});

// ------------------------------------------------------------------
// Stage B — Sceny
// ------------------------------------------------------------------

describe.skipIf(!hasApiKey)("Stage B: scene list generation", () => {
  it(
    "produces ≥8 Polish scenes with the required fields",
    async () => {
      const input = JSON.stringify({
        brief: briefFixture,
        skeleton: stageAFixture,
      });
      const output = await callStageViaLLM(
        "Jesteś generatorem scen sesji do Pathfinder 2e. Tworzysz listę scen w języku polskim. Odpowiadaj WYŁĄCZNIE poprawnym JSON.",
        `Wygeneruj sceny dla sesji.\nBrief: ${JSON.stringify(briefFixture)}\nSzkielet: ${JSON.stringify(stageAFixture)}`,
        0.7
      );
      const score = await scoreWithFactuality(
        output,
        "Poprawny JSON z polem 'scenes' — lista co najmniej 8 scen. Każda scena ma: id, title, synopsis, kind, act, tensionLevel, estimatedMinutes. Wszystkie teksty w języku polskim.",
        input
      );
      expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
    },
    EVAL_TIMEOUT_MS
  );
});

// ------------------------------------------------------------------
// Stage C — World Kit (NPC, lokacje, zegary, sekrety)
// ------------------------------------------------------------------

describe.skipIf(!hasApiKey)(
  "Stage C: world kit generation (Three-Clue Rule)",
  () => {
    it(
      "produces NPCs, locations, clocks, and Three-Clue-compliant secrets in Polish",
      async () => {
        const input = JSON.stringify({
          brief: briefFixture,
          skeleton: stageAFixture,
          scenes: stageBFixture,
        });
        const output = await callStageViaLLM(
          "Jesteś generatorem świata do Pathfinder 2e. Tworzysz NPC, lokacje, zegary i sekrety w języku polskim. Odpowiadaj WYŁĄCZNIE poprawnym JSON.",
          `Wygeneruj world kit.\nBrief: ${JSON.stringify(briefFixture)}\nSzkielet: ${JSON.stringify(stageAFixture)}\nSceny: ${JSON.stringify(stageBFixture)}`,
          0.5
        );
        const score = await scoreWithFactuality(
          output,
          "Poprawny JSON z polami 'npcs' (min. 3), 'locations' (min. 2), 'clocks' (min. 2, styl Blades in the Dark), 'secrets' (min. 6). Sekrety powinny mieć wskazówki zgodne z zasadą trzech wskazówek (Three-Clue Rule). Wszystkie teksty po polsku.",
          input
        );
        expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
      },
      EVAL_TIMEOUT_MS
    );
  }
);

// ------------------------------------------------------------------
// Stage D — Okablowanie grafu
// ------------------------------------------------------------------

describe.skipIf(!hasApiKey)("Stage D: graph wiring generation", () => {
  it(
    "produces valid startNodeId, edges, and ≥2 endings (incl. defeat)",
    async () => {
      const input = JSON.stringify({
        brief: briefFixture,
        skeleton: stageAFixture,
        scenes: stageBFixture,
        worldKit: stageCFixture,
      });
      const output = await callStageViaLLM(
        "Jesteś generatorem struktury grafu sesji do Pathfinder 2e. Tworzysz krawędzie grafu i zakończenia. Odpowiadaj WYŁĄCZNIE poprawnym JSON.",
        `Wygeneruj okablowanie grafu.\nBrief: ${JSON.stringify(briefFixture)}\nSzkielet: ${JSON.stringify(stageAFixture)}\nSceny: ${JSON.stringify(stageBFixture)}\nWorld Kit: ${JSON.stringify(stageCFixture)}`,
        0.3
      );
      const score = await scoreWithFactuality(
        output,
        "Poprawny JSON z polami 'startNodeId', 'edges' (lista krawędzi), 'endings' (min. 2 zakończenia, w tym jedno z kategorią 'defeat' lub 'tpk'). Graf logicznie spójny z listą scen. Zakończenia napisane po polsku.",
        input
      );
      expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
    },
    EVAL_TIMEOUT_MS
  );
});

// ------------------------------------------------------------------
// Stage E — Narracyjne seedsy
// ------------------------------------------------------------------

describe.skipIf(!hasApiKey)("Stage E: node prompt narration generation", () => {
  it(
    "produces one Polish narration seed per scene, 2-5 sentences each",
    async () => {
      const input = JSON.stringify({
        brief: briefFixture,
        scenes: stageBFixture,
      });
      const output = await callStageViaLLM(
        "Jesteś mistrzem narracji do Pathfinder 2e. Tworzysz krótkie klimatyczne narracje dla każdej sceny. Odpowiadaj WYŁĄCZNIE poprawnym JSON.",
        `Wygeneruj narracyjne seedsy.\nBrief: ${JSON.stringify(briefFixture)}\nSceny: ${JSON.stringify(stageBFixture)}`,
        0.8
      );
      const score = await scoreWithFactuality(
        output,
        "Poprawny JSON z polem 'nodePrompts' — słownik id_sceny → tekst narracyjny (2-5 zdań po polsku). Narracje w czasie teraźniejszym lub 2. osobie. Angażują wiele zmysłów.",
        input
      );
      expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
    },
    EVAL_TIMEOUT_MS
  );
});

// ------------------------------------------------------------------
// Stage F — Bloki statystyk PF2e (English mechanical)
// ------------------------------------------------------------------

describe.skipIf(!hasApiKey)("Stage F: PF2e stat block generation", () => {
  it(
    "produces GMG Table 2-5 compliant stat blocks for combat NPCs",
    async () => {
      const input = JSON.stringify({
        brief: briefFixture,
        worldKit: stageCFixture,
      });
      const output = await callStageViaLLM(
        "You are a Pathfinder 2e mechanics expert. Produce stat blocks for the given NPCs following GMG Table 2-5 Building Creatures. Reply with JSON only.",
        `Generate PF2e stat blocks.\nBrief: ${JSON.stringify(briefFixture)}\nNPCs from world kit: ${JSON.stringify(stageCFixture)}`,
        0.2
      );
      const score = await scoreWithFactuality(
        output,
        "Valid JSON with a 'statBlocks' field — record of npcId → PF2e stat block. Each block has tier='pf2e', level, ac, hp, perception, saves (fort/ref/will), strikes. Values consistent with GMG Table 2-5 for the NPC's level.",
        input
      );
      expect(score).toBeGreaterThanOrEqual(QUALITY_THRESHOLD);
    },
    EVAL_TIMEOUT_MS
  );
});
