import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CallLLM } from "@/lib/llm/client";
import { importSession } from "@/lib/orchestration/import/import-session";
import { SessionGraphSchema } from "@/lib/schemas/session-graph";

import stageAFixture from "../fixtures/generate-session/stage-a.json";
import stageBFixture from "../fixtures/generate-session/stage-b.json";
import stageCFixture from "../fixtures/generate-session/stage-c.json";
import stageDFixture from "../fixtures/generate-session/stage-d.json";
import stageEFixture from "../fixtures/generate-session/stage-e.json";
import stageFFixture from "../fixtures/generate-session/stage-f.json";

vi.mock("@/lib/orchestration/director/ink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/orchestration/director/ink")>();
  return {
    ...actual,
    compileGraph: vi.fn().mockResolvedValue({ compiledJson: "MOCK_COMPILED", warnings: [] }),
  };
});

const FIXTURE_DIR = resolve(__dirname, "..", "fixtures", "import");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf-8");
}

function buildImportMock(synthesized: Record<string, string[]> = {}): CallLLM {
  const responses = [
    JSON.stringify({ ...stageAFixture, synthesizedPaths: synthesized }),
    JSON.stringify({ ...stageBFixture, synthesizedPaths: synthesized }),
    JSON.stringify({ ...stageCFixture, synthesizedPaths: synthesized }),
    JSON.stringify({ ...stageDFixture, synthesizedPaths: synthesized }),
    JSON.stringify({ ...stageEFixture, synthesizedPaths: synthesized }),
    JSON.stringify({ ...stageFFixture, synthesizedPaths: synthesized }),
  ];
  let i = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[i] ?? "{}";
    i++;
    return Promise.resolve(r);
  });
}

describe("importSession — happy path with Sly-Flourish exact fixture", () => {
  it("parses the markdown, runs all six import stages, produces a valid graph", async () => {
    const raw = loadFixture("sly-flourish-exact.md");
    const mockLLM = buildImportMock({
      "front-1": ["grimPortents.2"],
    });

    const result = await importSession({ raw }, { callLLM: mockLLM });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`importSession failed: ${JSON.stringify(result)}`);

    expect(mockLLM).toHaveBeenCalledTimes(6);

    const parse = SessionGraphSchema.safeParse(result.graph);
    if (!parse.success) {
      const errors = parse.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`);
      throw new Error(`schema failed:\n${errors.join("\n")}`);
    }

    expect(result.graph.brief.version).toBe("pf2e");
    expect(result.graph.brief.partyLevel).toBe(3); // sourced from frontmatter
    expect(result.graph.brief.partySize).toBe(4);
    expect(result.graph.brief.targetDurationHours).toBe(4);
  });

  it("attaches provenance.synthesized from stage synthesizedPaths", async () => {
    const raw = loadFixture("sly-flourish-exact.md");
    const mockLLM = buildImportMock({ "s1": ["text"] });

    const result = await importSession({ raw }, { callLLM: mockLLM });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.graph.provenance).toBeDefined();
    expect(result.graph.provenance?.synthesized["s1"]).toContain("text");
  });
});

describe("importSession — warnings", () => {
  it("flags low-yield input (recap-style)", async () => {
    const raw = [
      "# Session Recap",
      "",
      "We played. Alice was there.",
      "",
      "## NPCs",
      "- The Baker",
    ].join("\n");
    const mockLLM = buildImportMock();

    const result = await importSession({ raw }, { callLLM: mockLLM });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContain("looks-like-recap");
  });

  it("flags Paizo-IP disclosure when trademark terms detected", async () => {
    const raw = [
      "# Pathfinder Society Quest: The Shattered Sanctum",
      "",
      "## Strong Start",
      "Rain hammers the broken doors.",
      "",
      "## Scenes",
      "- The Nave",
      "- The Crypt",
      "",
      "## NPCs",
      "- Someone",
      "",
      "## Secrets",
      "- One",
      "- Two",
      "- Three",
      "- Four",
      "- Five",
      "- Six",
      "",
      "## Locations",
      "- A",
      "- B",
    ].join("\n");
    const mockLLM = buildImportMock();

    const result = await importSession({ raw }, { callLLM: mockLLM });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.warnings).toContain("paizo-ip");
  });

  it("reports pendingConsent when clocks/fronts/endings are absent from source", async () => {
    // The fixture doesn't contain ## Clocks, ## Fronts, ## Endings
    const raw = loadFixture("sly-flourish-exact.md");
    const mockLLM = buildImportMock();

    const result = await importSession({ raw }, { callLLM: mockLLM });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pendingConsent.clocks).toBe(true);
    expect(result.pendingConsent.fronts).toBe(true);
    expect(result.pendingConsent.endings).toBe(true);
  });
});

describe("importSession — bounds", () => {
  it("rejects oversized input (>50k chars) with a size error", async () => {
    const raw = "x".repeat(50_001);
    const mockLLM = buildImportMock();

    const result = await importSession({ raw }, { callLLM: mockLLM });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/too large|50/i);
  });

  it("rejects empty input", async () => {
    const mockLLM = buildImportMock();
    const result = await importSession({ raw: "   \n\n  " }, { callLLM: mockLLM });
    expect(result.ok).toBe(false);
  });
});
