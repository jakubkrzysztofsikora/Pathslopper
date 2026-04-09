import { describe, it, expect, beforeEach } from "vitest";
import { VERSION_SLIDER_DEFAULTS } from "@/lib/schemas/story-dna";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

// Import store factory separately to allow re-initialization per test
// Zustand stores are singletons; we use the store directly and reset state between tests.
import { useStoryDNAStore } from "@/lib/state/story-dna-store";

function resetStore() {
  useStoryDNAStore.setState({
    version: "pf2e",
    sliders: { ...VERSION_SLIDER_DEFAULTS.pf2e },
    tags: {
      include: ["Dark Fantasy", "Political Intrigue"],
      exclude: [...DEFAULT_BANNED_PHRASES],
    },
  });
}

describe("useStoryDNAStore", () => {
  beforeEach(() => {
    resetStore();
  });

  it("initial state matches PF2e defaults", () => {
    const { version, sliders } = useStoryDNAStore.getState();
    expect(version).toBe("pf2e");
    expect(sliders.narrativePacing).toBe(VERSION_SLIDER_DEFAULTS.pf2e.narrativePacing);
    expect(sliders.tacticalLethality).toBe(VERSION_SLIDER_DEFAULTS.pf2e.tacticalLethality);
    expect(sliders.npcImprov).toBe(VERSION_SLIDER_DEFAULTS.pf2e.npcImprov);
  });

  it("setVersion resets sliders to PF1e defaults", () => {
    const { setVersion } = useStoryDNAStore.getState();
    setVersion("pf1e");
    const { version, sliders } = useStoryDNAStore.getState();
    expect(version).toBe("pf1e");
    expect(sliders.narrativePacing).toBe(VERSION_SLIDER_DEFAULTS.pf1e.narrativePacing);
    expect(sliders.tacticalLethality).toBe(VERSION_SLIDER_DEFAULTS.pf1e.tacticalLethality);
    expect(sliders.npcImprov).toBe(VERSION_SLIDER_DEFAULTS.pf1e.npcImprov);
  });

  it("tags persist through version switch", () => {
    const { addIncludeTag, setVersion } = useStoryDNAStore.getState();
    addIncludeTag("Undead Rising");
    const tagsBefore = useStoryDNAStore.getState().tags.include;
    expect(tagsBefore).toContain("Undead Rising");

    setVersion("pf1e");
    const tagsAfter = useStoryDNAStore.getState().tags.include;
    expect(tagsAfter).toContain("Undead Rising");
    expect(tagsAfter).toContain("Dark Fantasy");
  });

  it("setSlider updates a single slider without touching others", () => {
    const { setSlider } = useStoryDNAStore.getState();
    setSlider("tacticalLethality", 80);
    const { sliders } = useStoryDNAStore.getState();
    expect(sliders.tacticalLethality).toBe(80);
    expect(sliders.narrativePacing).toBe(VERSION_SLIDER_DEFAULTS.pf2e.narrativePacing);
  });

  it("addIncludeTag and removeIncludeTag work correctly", () => {
    const { addIncludeTag, removeIncludeTag } = useStoryDNAStore.getState();
    addIncludeTag("Horror");
    expect(useStoryDNAStore.getState().tags.include).toContain("Horror");
    removeIncludeTag("Horror");
    expect(useStoryDNAStore.getState().tags.include).not.toContain("Horror");
  });

  it("addIncludeTag is idempotent — no duplicate tags", () => {
    const { addIncludeTag } = useStoryDNAStore.getState();
    addIncludeTag("Horror");
    addIncludeTag("Horror");
    const includes = useStoryDNAStore.getState().tags.include;
    expect(includes.filter((t) => t === "Horror")).toHaveLength(1);
  });

  it("addExcludeTag and removeExcludeTag work correctly", () => {
    const { addExcludeTag, removeExcludeTag } = useStoryDNAStore.getState();
    addExcludeTag("narrative gold");
    expect(useStoryDNAStore.getState().tags.exclude).toContain("narrative gold");
    removeExcludeTag("narrative gold");
    expect(useStoryDNAStore.getState().tags.exclude).not.toContain("narrative gold");
  });

  it("getSnapshot returns valid StoryDNA", () => {
    const { getSnapshot } = useStoryDNAStore.getState();
    const snapshot = getSnapshot();
    expect(snapshot.version).toBe("pf2e");
    expect(typeof snapshot.sliders.narrativePacing).toBe("number");
    expect(Array.isArray(snapshot.tags.include)).toBe(true);
    expect(Array.isArray(snapshot.tags.exclude)).toBe(true);
  });

  it("getSnapshot throws if state is invalid", () => {
    useStoryDNAStore.setState({
      sliders: { narrativePacing: 999, tacticalLethality: 55, npcImprov: 50 },
    } as never);
    const { getSnapshot } = useStoryDNAStore.getState();
    expect(() => getSnapshot()).toThrow();
  });

  it("exclude tags are pre-seeded with banned phrases", () => {
    const { tags } = useStoryDNAStore.getState();
    expect(tags.exclude).toEqual(expect.arrayContaining(DEFAULT_BANNED_PHRASES));
  });
});
