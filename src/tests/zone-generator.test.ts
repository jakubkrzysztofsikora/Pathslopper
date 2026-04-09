import { describe, it, expect } from "vitest";
import {
  buildZonePromptChain,
  verifyZoneOutput,
  type ZoneSeed,
} from "@/lib/prompts/zone-generator";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";
import type { StoryDNA } from "@/lib/schemas/story-dna";

const pf2eDna: StoryDNA = {
  version: "pf2e",
  sliders: { narrativePacing: 50, tacticalLethality: 55, npcImprov: 50 },
  tags: {
    include: ["Dark Fantasy"],
    exclude: [...DEFAULT_BANNED_PHRASES],
  },
};

const pf1eDna: StoryDNA = {
  version: "pf1e",
  sliders: { narrativePacing: 60, tacticalLethality: 40, npcImprov: 70 },
  tags: {
    include: ["Political Intrigue"],
    exclude: [...DEFAULT_BANNED_PHRASES],
  },
};

const seed: ZoneSeed = {
  biome: "flooded dungeon",
  encounterIntent: "ambush by bandits",
};

describe("buildZonePromptChain", () => {
  it("Stage A system prompt is in Polish with diacritics (contains 'Myślisz po polsku')", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const { system } = chain.stageA("pf2e");
    expect(system).toContain("Myślisz po polsku");
    expect(system).toContain("regułach");
  });

  it("Stage A PF2e prompt mentions three-action economy", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const { system } = chain.stageA("pf2e");
    expect(system.toLowerCase()).toMatch(/three-action|trzech akcji/);
  });

  it("Stage A PF1e prompt mentions variable movement cost or 5ft squares", () => {
    const chain = buildZonePromptChain(pf1eDna, seed);
    const { system } = chain.stageA("pf1e");
    expect(system.toLowerCase()).toMatch(/5ft|movement cost|ruch/i);
  });

  it("Stage A user prompt includes seed biome and encounter intent", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const { user } = chain.stageA("pf2e");
    expect(user).toContain("flooded dungeon");
    expect(user).toContain("ambush by bandits");
  });

  it("Stage B system prompt contains the banned phrase list", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const { system } = chain.stageB("some polish skeleton", pf2eDna);
    DEFAULT_BANNED_PHRASES.forEach((phrase) => {
      expect(system).toContain(phrase);
    });
  });

  it("Stage B system prompt contains anti-sycophancy clause", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const { system } = chain.stageB("skeleton", pf2eDna);
    expect(system).toContain("Do not concede to incorrect rules arguments");
  });

  it("Stage B PF2e prompt references three-action economy", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const { system } = chain.stageB("skeleton", pf2eDna);
    expect(system.toLowerCase()).toContain("three-action economy");
  });

  it("Stage B PF1e prompt references 5ft zone-adjacency movement", () => {
    const chain = buildZonePromptChain(pf1eDna, seed);
    const { system } = chain.stageB("skeleton", pf1eDna);
    expect(system.toLowerCase()).toContain("5ft");
  });

  it("Stage B user prompt embeds the Polish skeleton", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    const skeleton = "Teren: mokradlo. Oslony: beczki. Zagrozenia: bagno.";
    const { user } = chain.stageB(skeleton, pf2eDna);
    expect(user).toContain(skeleton);
  });

  it("Stage C is verifyZoneOutput", () => {
    const chain = buildZonePromptChain(pf2eDna, seed);
    // stageC should be callable and return a VerifyZoneResult shape
    const result = chain.stageC("no json here", pf2eDna);
    expect(result).toHaveProperty("ok");
    expect(result).toHaveProperty("bannedHits");
  });
});

describe("verifyZoneOutput", () => {
  const validZoneJson = JSON.stringify({
    id: "zone-test",
    name: "Flooded Corridor",
    terrain: "underground",
    cover: [
      {
        id: "pillar-01",
        name: "Stone Pillar",
        coverBonus: 2,
        description: "A crumbling pillar of rough-cut stone.",
      },
    ],
    elevation: 0,
    hazards: ["ankle-deep water", "slippery stone"],
    lighting: "dim",
    pf2eActionCost: 1,
  });

  const validMarkdown = `
The corridor reeks of stale water and rust. Stone pillars rise from the flood.

\`\`\`json
${validZoneJson}
\`\`\`
`;

  it("returns ok=true and zone when markdown is clean and JSON is valid", () => {
    const result = verifyZoneOutput(validMarkdown, pf2eDna);
    expect(result.ok).toBe(true);
    expect(result.zone).toBeDefined();
    expect(result.bannedHits).toHaveLength(0);
  });

  it("detects banned phrase hit and returns ok=false", () => {
    const dirtyMarkdown = `Moreover, the corridor reeks of stale water.

\`\`\`json
${validZoneJson}
\`\`\`
`;
    const result = verifyZoneOutput(dirtyMarkdown, pf2eDna);
    expect(result.ok).toBe(false);
    expect(result.bannedHits).toContain("moreover");
    // Zone is still returned when JSON is valid
    expect(result.zone).toBeDefined();
  });

  it("returns ok=false and no zone when JSON block is absent", () => {
    const noJsonMarkdown = "The corridor floods. There is no JSON here.";
    const result = verifyZoneOutput(noJsonMarkdown, pf2eDna);
    expect(result.ok).toBe(false);
    expect(result.zone).toBeUndefined();
  });

  it("returns ok=false when JSON fails schema validation", () => {
    const badJsonMarkdown = `
Description text here.

\`\`\`json
{"id": "bad-zone", "name": "Missing Fields"}
\`\`\`
`;
    const result = verifyZoneOutput(badJsonMarkdown, pf2eDna);
    expect(result.ok).toBe(false);
    expect(result.zone).toBeUndefined();
  });

  it("detects extra exclude tags as banned phrases", () => {
    const customDna: StoryDNA = {
      ...pf2eDna,
      tags: {
        include: [],
        exclude: [...DEFAULT_BANNED_PHRASES, "forbidden-word"],
      },
    };
    const markdown = `The forbidden-word appears here.

\`\`\`json
${validZoneJson}
\`\`\`
`;
    const result = verifyZoneOutput(markdown, customDna);
    expect(result.bannedHits).toContain("forbidden-word");
    expect(result.ok).toBe(false);
  });
});
