import { describe, it, expect, vi } from "vitest";
import { generateZone } from "@/lib/orchestration/generate-zone";
import { VERSION_SLIDER_DEFAULTS, type StoryDNA } from "@/lib/schemas/story-dna";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

const pf2eDna: StoryDNA = {
  version: "pf2e",
  sliders: { ...VERSION_SLIDER_DEFAULTS.pf2e },
  tags: {
    include: ["Dark Fantasy"],
    exclude: [...DEFAULT_BANNED_PHRASES],
  },
};

const seed = { biome: "flooded dungeon", encounterIntent: "ambush" };

const validZoneJson = JSON.stringify({
  id: "zone-1",
  name: "Flooded Corridor",
  terrain: "underground",
  cover: [
    {
      id: "pillar-1",
      name: "Stone Pillar",
      coverBonus: 2,
      description: "A cracked pillar of wet stone.",
    },
  ],
  elevation: 0,
  hazards: ["slippery floor"],
  lighting: "dim",
  pf2eActionCost: 1,
});

const cleanMarkdown = `The corridor smells of wet stone and cold iron.\n\n\`\`\`json\n${validZoneJson}\n\`\`\``;
const dirtyMarkdown = `Moreover, the corridor smells of wet stone.\n\n\`\`\`json\n${validZoneJson}\n\`\`\``;
const noJsonMarkdown = `The corridor is dim and damp. There is no zone JSON here.`;

describe("generateZone orchestrator", () => {
  it("success: passes Stage A → Stage B → verify and returns a zone", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockResolvedValueOnce(cleanMarkdown);

    const result = await generateZone(pf2eDna, seed, { callClaude });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.zone.name).toBe("Flooded Corridor");
      expect(result.warnings).toEqual([]);
    }
    expect(callClaude).toHaveBeenCalledTimes(2);
  });

  it("retries Stage B exactly once when a banned phrase is detected", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockResolvedValueOnce(dirtyMarkdown)
      .mockResolvedValueOnce(cleanMarkdown);

    const result = await generateZone(pf2eDna, seed, { callClaude });

    expect(result.ok).toBe(true);
    expect(callClaude).toHaveBeenCalledTimes(3);

    if (result.ok) {
      expect(result.warnings.some((w) => w.includes("moreover"))).toBe(true);
      // After a clean retry, no "persisted" warning.
      expect(result.warnings.some((w) => w.includes("persisted"))).toBe(false);
    }
  });

  it("retry turn contains assistant + corrective user message", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockResolvedValueOnce(dirtyMarkdown)
      .mockResolvedValueOnce(cleanMarkdown);

    await generateZone(pf2eDna, seed, { callClaude });

    const retryCall = callClaude.mock.calls[2][0];
    expect(retryCall.messages).toHaveLength(3);
    expect(retryCall.messages[1].role).toBe("assistant");
    expect(retryCall.messages[1].content).toBe(dirtyMarkdown);
    expect(retryCall.messages[2].role).toBe("user");
    expect(retryCall.messages[2].content).toMatch(/forbidden phrases/i);
    expect(retryCall.messages[2].content).toContain("moreover");
  });

  it("reports persisted warning when retry still contains banned phrase", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockResolvedValueOnce(dirtyMarkdown)
      .mockResolvedValueOnce(dirtyMarkdown);

    const result = await generateZone(pf2eDna, seed, { callClaude });

    // Still returns ok=true because the JSON is valid; warnings record the slop persistence.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.some((w) => w.includes("persisted"))).toBe(true);
    }
  });

  it("fails with stage='stageA' and logs when the first upstream call throws", async () => {
    const callClaude = vi.fn().mockRejectedValueOnce(new Error("upstream 429"));
    const logger = vi.fn();

    const result = await generateZone(pf2eDna, seed, { callClaude, logger });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("stageA");
      expect(result.error).toBe("Upstream model call failed.");
    }
    expect(logger).toHaveBeenCalledWith("stageA", expect.any(Error));
    expect(callClaude).toHaveBeenCalledTimes(1);
  });

  it("fails with stage='stageB' when the second upstream call throws", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockRejectedValueOnce(new Error("upstream 500"));
    const logger = vi.fn();

    const result = await generateZone(pf2eDna, seed, { callClaude, logger });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("stageB");
    }
    expect(logger).toHaveBeenCalledWith("stageB", expect.any(Error));
  });

  it("fails with stage='verify' when Stage B response has no JSON block", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockResolvedValueOnce(noJsonMarkdown);

    const result = await generateZone(pf2eDna, seed, { callClaude });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.stage).toBe("verify");
      expect(result.markdown).toBe(noJsonMarkdown);
    }
  });

  it("continues after a retry upstream failure with a best-effort warning", async () => {
    const callClaude = vi
      .fn()
      .mockResolvedValueOnce("Polish skeleton")
      .mockResolvedValueOnce(dirtyMarkdown)
      .mockRejectedValueOnce(new Error("retry upstream down"));
    const logger = vi.fn();

    const result = await generateZone(pf2eDna, seed, { callClaude, logger });

    // The original dirty markdown still had valid JSON, so the orchestrator
    // returns ok=true with a warning about the retry failure.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        result.warnings.some((w) => w.includes("best-effort"))
      ).toBe(true);
    }
    expect(logger).toHaveBeenCalledWith("stageB-retry", expect.any(Error));
  });
});
