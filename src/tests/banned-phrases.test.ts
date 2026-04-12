import { describe, it, expect } from "vitest";
import {
  scanBannedPhrases,
  DEFAULT_BANNED_PHRASES,
} from "@/lib/prompts/banned-phrases";

describe("scanBannedPhrases", () => {
  it("detects all four banned phrases in a single string", () => {
    const text = "Moreover, it's crucial to delve into the tapestry";
    const hits = scanBannedPhrases(text);
    expect(hits).toContain("moreover");
    expect(hits).toContain("it's crucial to");
    expect(hits).toContain("delve");
    expect(hits).toContain("tapestry");
    expect(hits).toHaveLength(4);
  });

  it("returns empty array for clean text", () => {
    const text =
      "The fighter charges through the doorway and attacks the goblin.";
    expect(scanBannedPhrases(text)).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(scanBannedPhrases("MOREOVER the skies darkened")).toContain(
      "moreover"
    );
    expect(scanBannedPhrases("It's Crucial To succeed")).toContain(
      "it's crucial to"
    );
    expect(scanBannedPhrases("DELVE into the dungeon")).toContain("delve");
    expect(scanBannedPhrases("A Tapestry of stars")).toContain("tapestry");
  });

  it("detects 'navigate the complexities'", () => {
    const text = "We must navigate the complexities of the dungeon.";
    expect(scanBannedPhrases(text)).toContain("navigate the complexities");
  });

  it("detects 'in the realm of'", () => {
    const text = "In the realm of magic, anything is possible.";
    expect(scanBannedPhrases(text)).toContain("in the realm of");
  });

  it("detects 'testament to'", () => {
    const text = "This fortress is a testament to dwarven engineering.";
    expect(scanBannedPhrases(text)).toContain("testament to");
  });

  it("respects extra phrases passed as second argument", () => {
    const text = "The dungeon reeks of sulfur and despair.";
    const hits = scanBannedPhrases(text, ["sulfur", "despair"]);
    expect(hits).toContain("sulfur");
    expect(hits).toContain("despair");
  });

  it("does not include extra phrases that are absent", () => {
    const text = "Clean text with no issues.";
    const hits = scanBannedPhrases(text, ["special-banned-term"]);
    expect(hits).toEqual([]);
  });

  it("does not double-report default phrases when extras are empty", () => {
    const text = "delve delve delve";
    const hits = scanBannedPhrases(text, []);
    expect(hits).toHaveLength(1);
  });

  it("DEFAULT_BANNED_PHRASES contains expected number of entries", () => {
    expect(DEFAULT_BANNED_PHRASES).toHaveLength(11);
  });
});
