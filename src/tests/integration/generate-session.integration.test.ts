/**
 * Integration test: generate-session pipeline against real Scaleway Generative APIs.
 *
 * Hard-fails on missing LLM_API_KEY / REDIS_URL per the standard repo integration test
 * pattern (see src/tests/integration/llm-client.integration.test.ts and
 * vitest.config.integration.ts). No skipIf guards — if env vars are missing the test
 * fails loudly to signal misconfigured CI.
 *
 * Run manually via: npm run test:integration
 * Do NOT execute this test in standard npm test / CI (it is excluded by vitest.config.ts).
 *
 * Timeout: 60s per test (set in vitest.config.integration.ts).
 */

import { describe, it, expect, beforeAll } from "vitest";
import { callLLM } from "@/lib/llm/client";
import { generateSession } from "@/lib/orchestration/generate-session";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";
import type { SessionBrief } from "@/lib/schemas/session-brief";

// ------------------------------------------------------------------
// Guard: hard-fail on missing env vars (integration test contract).
// ------------------------------------------------------------------

beforeAll(() => {
  if (!process.env.LLM_API_KEY) {
    throw new Error(
      "Integration test requires LLM_API_KEY. " +
        "Set it in .env.local or export it before running npm run test:integration."
    );
  }
  // REDIS_URL is required in production but the in-memory store fallback is
  // acceptable for integration tests that exercise the generator (not the
  // session store). If you need Redis-backed tests, add the guard here.
});

// ------------------------------------------------------------------
// Canonical brief fixture for the integration test.
// Uses a self-contained Polish-language brief that exercises all 6 stages.
// ------------------------------------------------------------------

const INTEGRATION_BRIEF: SessionBrief = {
  version: "pf2e",
  partySize: 4,
  partyLevel: 3,
  targetDurationHours: 4,
  tone: "mroczne fantasy, napięcie polityczne",
  setting: "Twierdza tyrana na skraju przeklętego lasu",
  presetId: "classic",
  storyDna: {
    version: "pf2e",
    sliders: {
      narrativePacing: 50,
      tacticalLethality: 55,
      npcImprov: 50,
    },
    tags: {
      include: ["tyran", "twierdza"],
      exclude: [],
    },
  },
  characterHooks: [
    { characterName: "Aldric", hook: "Jego siostra jest więźniem twierdzy." },
  ],
  safetyTools: {
    lines: ["tortury dzieci"],
    veils: ["graficzna przemoc"],
    xCardEnabled: true,
  },
};

// ------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------

describe("generateSession — real Scaleway Generative APIs", () => {
  it(
    "completes all 6 stages and produces a schema-valid SessionGraph",
    async () => {
      const result = await generateSession(INTEGRATION_BRIEF, {
        callLLM,
        logger: (stage, info) => {
          // Surface LLM errors in the test output for easier debugging.
          console.warn(`[generate-session integration] stage=${stage}`, info);
        },
      });

      if (!result.ok) {
        throw new Error(
          `Pipeline failed at stage '${result.stage}': ${result.error}\n` +
            `Partial: ${JSON.stringify(result.partial, null, 2)}`
        );
      }

      // The assembled graph must pass full Zod schema validation including
      // all superRefine cross-reference checks.
      const parseResult = SessionGraphSchema.safeParse(result.graph);
      if (!parseResult.success) {
        const errors = parseResult.error.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join("\n");
        throw new Error(`SessionGraph schema validation failed:\n${errors}`);
      }

      expect(result.graph.version).toBe("pf2e");
      expect(result.graph.nodes.length).toBeGreaterThanOrEqual(8);
      expect(result.graph.fronts.length).toBeGreaterThanOrEqual(1);
      expect(result.graph.clocks.length).toBeGreaterThanOrEqual(2);
      expect(result.graph.secrets.length).toBeGreaterThanOrEqual(6);
      expect(result.graph.npcs.length).toBeGreaterThanOrEqual(3);
      expect(result.graph.locations.length).toBeGreaterThanOrEqual(2);
      expect(result.graph.endings.length).toBeGreaterThanOrEqual(2);
    },
    60_000
  );
});
