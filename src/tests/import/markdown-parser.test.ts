import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  parseMarkdownToSections,
  isLazyDmExact,
} from "@/lib/orchestration/import/markdown-parser";

const FIXTURE_DIR = resolve(__dirname, "..", "fixtures", "import");

function loadFixture(name: string): string {
  return readFileSync(resolve(FIXTURE_DIR, name), "utf-8");
}

describe("parseMarkdownToSections — Sly Flourish exact fixture", () => {
  const raw = loadFixture("sly-flourish-exact.md");
  const sections = parseMarkdownToSections(raw);

  it("extracts YAML frontmatter into typed brief hints", () => {
    expect(sections.frontmatter.system).toBe("pf2e");
    expect(sections.frontmatter.party_level).toBe(3);
    expect(sections.frontmatter.party_size).toBe(4);
    expect(sections.frontmatter.duration_hours).toBe(4);
    expect(sections.frontmatter.title).toBe("The Shattered Sanctum");
  });

  it("captures the H1 title and lede", () => {
    expect(sections.title).toBe("The Shattered Sanctum");
    expect(sections.lede).toMatch(/crumbling monastery/);
  });

  it("extracts a non-empty strong-start section", () => {
    expect(sections.strongStart).toMatch(/Rain hammers/);
  });

  it("extracts scenes as list items", () => {
    expect(sections.scenes).toHaveLength(4);
    expect(sections.scenes[0].name).toBe("The Rain-Slick Nave");
    expect(sections.scenes[0].body).toMatch(/spectral monks/);
  });

  it("extracts at least 6 secrets", () => {
    expect(sections.secrets.length).toBeGreaterThanOrEqual(6);
  });

  it("extracts NPCs with names", () => {
    const names = sections.npcs.map((n) => n.name);
    expect(names).toContain("Sister Meren");
    expect(names).toContain("Abbot Corvin");
  });

  it("extracts locations with aspects", () => {
    expect(sections.locations.length).toBeGreaterThanOrEqual(2);
    const nave = sections.locations.find((l) => l.name.includes("Nave"));
    expect(nave).toBeDefined();
  });

  it("recognises the fixture as the Lazy-DM exact shape", () => {
    expect(isLazyDmExact(sections)).toBe(true);
  });

  it("reports zero unclassified sections for the exact template", () => {
    expect(sections.unclassified).toHaveLength(0);
  });
});

describe("parseMarkdownToSections — edge cases", () => {
  it("tolerates documents without frontmatter", () => {
    const raw = "# Just a title\n\nSome prose.\n\n## Scenes\n- One\n- Two\n";
    const sections = parseMarkdownToSections(raw);
    expect(sections.frontmatter).toEqual({});
    expect(sections.title).toBe("Just a title");
    expect(sections.scenes).toHaveLength(2);
  });

  it("recognises Polish heading aliases", () => {
    const raw = [
      "# Kryształowa Wieża",
      "",
      "## Otwarcie",
      "Deszcz pada, wiatr zawodzi.",
      "",
      "## Sceny",
      "- Pierwsza scena — wejście do wieży.",
      "- Druga scena — konfrontacja z magiem.",
      "",
      "## BNi",
      "- Mag Aldric — władca wieży.",
      "",
      "## Sekrety",
      "- Wieża jest zaklęta.",
      "- Mag jest umarły.",
      "- Wejście otwiera tylko krew.",
      "",
      "## Lokacje",
      "- Dziedziniec — kamienne płyty, fontanna.",
      "- Biblioteka — księgi, kurz, świece.",
    ].join("\n");
    const sections = parseMarkdownToSections(raw);
    expect(sections.strongStart).toMatch(/Deszcz/);
    expect(sections.scenes).toHaveLength(2);
    expect(sections.npcs).toHaveLength(1);
    expect(sections.npcs[0].name).toBe("Mag Aldric");
    expect(sections.secrets).toHaveLength(3);
    expect(sections.locations).toHaveLength(2);
  });

  it("tolerates H3-instead-of-H2 heading drift", () => {
    const raw = [
      "# Title",
      "",
      "### Scenes",
      "- Scene 1",
      "- Scene 2",
      "",
      "### NPCs",
      "- Alice",
    ].join("\n");
    const sections = parseMarkdownToSections(raw);
    expect(sections.scenes).toHaveLength(2);
    expect(sections.npcs).toHaveLength(1);
  });

  it("tolerates colon-terminated pseudo-headings", () => {
    const raw = [
      "# Title",
      "",
      "Scenes:",
      "- Scene 1",
      "- Scene 2",
      "",
      "NPCs:",
      "- Alice",
    ].join("\n");
    const sections = parseMarkdownToSections(raw);
    expect(sections.scenes).toHaveLength(2);
    expect(sections.npcs).toHaveLength(1);
  });

  it("buckets unknown sections into unclassified", () => {
    const raw = [
      "# Title",
      "",
      "## Scenes",
      "- Scene 1",
      "",
      "## Random Rambling",
      "This is not a session section at all.",
    ].join("\n");
    const sections = parseMarkdownToSections(raw);
    expect(sections.unclassified.length).toBeGreaterThan(0);
    expect(sections.unclassified[0].heading).toBe("Random Rambling");
  });
});

describe("parseMarkdownToSections — low-yield detection seed", () => {
  it("extracts very few scenes/secrets from a recap-style doc (warning to be applied upstream)", () => {
    const raw = [
      "# Session 4 Recap",
      "",
      "We played last night. Alice got poisoned.",
      "Bob met the baker. Carla fell in a well.",
      "",
      "## NPCs",
      "- The Baker — flour-dusted, suspicious.",
    ].join("\n");
    const sections = parseMarkdownToSections(raw);
    expect(sections.scenes.length).toBeLessThan(3);
    expect(sections.secrets.length).toBe(0);
  });
});
