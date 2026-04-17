import matter from "gray-matter";
import { marked, type Tokens } from "marked";

// Heading-alias map. Headings are normalised (lowercase, stripped of punctuation,
// trailing colons removed) before lookup. Polish + English seeds; the LLM parse
// stage handles anything exotic that slips through.
const HEADING_ALIASES: Record<string, SectionKey> = {
  // Strong start
  "strong start": "strongStart",
  "otwarcie": "strongStart",
  "opening": "strongStart",
  "hook": "strongStart",

  // Scenes
  "scenes": "scenes",
  "potential scenes": "scenes",
  "sceny": "scenes",
  "potencjalne sceny": "scenes",

  // Secrets
  "secrets": "secrets",
  "secrets and clues": "secrets",
  "clues": "secrets",
  "sekrety": "secrets",
  "sekrety i tropy": "secrets",
  "tropy": "secrets",

  // Locations
  "locations": "locations",
  "fantastic locations": "locations",
  "places": "locations",
  "lokacje": "locations",
  "miejsca": "locations",

  // NPCs
  "npcs": "npcs",
  "important npcs": "npcs",
  "characters": "npcs",
  "cast": "npcs",
  "bni": "npcs",
  "ważne bni": "npcs",
  "ważne postacie": "npcs",

  // Monsters (adversary NPCs; kept under a separate key so the importer can
  // flag them for stat-block regeneration).
  "monsters": "monsters",
  "potential monsters": "monsters",
  "encounters": "monsters",
  "potwory": "monsters",

  // Treasure
  "treasure": "treasure",
  "rewards": "treasure",
  "potential treasure": "treasure",
  "skarb": "treasure",
  "nagrody": "treasure",

  // Clocks / Fronts / Endings — rarely pre-authored in Lazy DM prep; the
  // importer asks the GM for consent to synthesise these when absent.
  "clocks": "clocks",
  "zegary": "clocks",
  "fronts": "fronts",
  "dangers": "fronts",
  "fronty": "fronts",
  "zagrożenia": "fronts",
  "endings": "endings",
  "outcomes": "endings",
  "zakończenia": "endings",
};

export type SectionKey =
  | "strongStart"
  | "scenes"
  | "secrets"
  | "locations"
  | "npcs"
  | "monsters"
  | "treasure"
  | "clocks"
  | "fronts"
  | "endings";

export interface ListItemSection {
  name: string;
  body: string;
}

export interface UnclassifiedSection {
  heading: string;
  body: string;
}

export interface ImportedFrontmatter {
  system?: string;
  party_level?: number;
  party_size?: number;
  duration_hours?: number;
  title?: string;
  tags?: string[];
}

export interface ImportedSections {
  frontmatter: ImportedFrontmatter;
  title?: string;
  lede?: string;
  strongStart?: string;
  scenes: ListItemSection[];
  secrets: string[];
  locations: ListItemSection[];
  npcs: ListItemSection[];
  monsters: ListItemSection[];
  treasure: string[];
  clocks: ListItemSection[];
  fronts: ListItemSection[];
  endings: ListItemSection[];
  unclassified: UnclassifiedSection[];
}

function normaliseHeading(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[*_`]/g, "")
    .replace(/[:：]+\s*$/, "")
    .replace(/\(([^)]*)\)/g, "$1")
    .replace(/[-—–]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headingKey(raw: string): SectionKey | undefined {
  return HEADING_ALIASES[normaliseHeading(raw)];
}

// A paragraph that looks like a section header: short, bold, or colon-terminated.
const PSEUDO_HEADING_RE = /^(?:\*\*(.+?)\*\*|([^\n]{1,60}):)\s*$/;

interface RawBlock {
  heading?: string;
  level?: number;
  content: string;
}

function splitIntoBlocks(raw: string): { h1?: string; lede?: string; blocks: RawBlock[] } {
  const tokens = marked.lexer(raw);
  let h1: string | undefined;
  let lede: string | undefined;
  const blocks: RawBlock[] = [];
  let current: RawBlock | undefined;

  const flush = () => {
    if (current) {
      current.content = current.content.trim();
      blocks.push(current);
      current = undefined;
    }
  };

  for (const token of tokens) {
    if (token.type === "heading") {
      const heading = token as Tokens.Heading;
      if (heading.depth === 1 && !h1) {
        h1 = heading.text.trim();
        continue;
      }
      flush();
      current = { heading: heading.text.trim(), level: heading.depth, content: "" };
      continue;
    }

    // Pseudo-heading: short paragraph ending in a colon, treated as a
    // section break for forgiving real-world Markdown.
    if (token.type === "paragraph") {
      const para = token as Tokens.Paragraph;
      const match = para.text.match(PSEUDO_HEADING_RE);
      if (match && (match[1] || match[2])) {
        const text = (match[1] ?? match[2]).trim();
        if (headingKey(text)) {
          flush();
          current = { heading: text, level: 2, content: "" };
          continue;
        }
      }
      if (!current && h1 && !lede) {
        lede = para.text.trim();
        continue;
      }
    }

    if (!current) {
      // Content before the first recognised heading, after lede capture.
      if (token.type === "paragraph" && h1 && !lede) {
        lede = (token as Tokens.Paragraph).text.trim();
        continue;
      }
      continue;
    }

    if ("raw" in token && typeof token.raw === "string") {
      current.content += token.raw;
    }
  }

  flush();
  return { h1, lede, blocks };
}

// List-item splitter — returns `{name, body}` where name is the leading
// phrase before the first em-dash/colon/period and body is the rest.
function parseListItems(content: string): ListItemSection[] {
  const tokens = marked.lexer(content);
  const items: ListItemSection[] = [];
  for (const token of tokens) {
    if (token.type !== "list") continue;
    const list = token as Tokens.List;
    for (const item of list.items) {
      const text = item.text.trim();
      if (!text) continue;
      const m = text.match(/^([^\n]+?)\s*[-—–:]\s+([\s\S]+)$/);
      if (m) {
        items.push({ name: m[1].trim(), body: m[2].trim() });
      } else {
        items.push({ name: text.split(/[\n.]/)[0].trim(), body: text });
      }
    }
  }
  return items;
}

function parseBulletStrings(content: string): string[] {
  const tokens = marked.lexer(content);
  const out: string[] = [];
  for (const token of tokens) {
    if (token.type !== "list") continue;
    const list = token as Tokens.List;
    for (const item of list.items) {
      const text = item.text.trim();
      if (text) out.push(text);
    }
  }
  return out;
}

export function parseMarkdownToSections(raw: string): ImportedSections {
  const parsed = matter(raw);
  const frontmatter = (parsed.data ?? {}) as ImportedFrontmatter;
  const body = parsed.content;

  const { h1, lede, blocks } = splitIntoBlocks(body);

  const sections: ImportedSections = {
    frontmatter,
    title: frontmatter.title ?? h1,
    lede,
    strongStart: undefined,
    scenes: [],
    secrets: [],
    locations: [],
    npcs: [],
    monsters: [],
    treasure: [],
    clocks: [],
    fronts: [],
    endings: [],
    unclassified: [],
  };

  for (const block of blocks) {
    if (!block.heading) continue;
    const key = headingKey(block.heading);
    if (!key) {
      sections.unclassified.push({
        heading: block.heading,
        body: block.content,
      });
      continue;
    }

    switch (key) {
      case "strongStart":
        sections.strongStart = block.content;
        break;
      case "scenes":
        sections.scenes.push(...parseListItems(block.content));
        break;
      case "secrets":
        sections.secrets.push(...parseBulletStrings(block.content));
        break;
      case "locations":
        sections.locations.push(...parseListItems(block.content));
        break;
      case "npcs":
        sections.npcs.push(...parseListItems(block.content));
        break;
      case "monsters":
        sections.monsters.push(...parseListItems(block.content));
        break;
      case "treasure":
        sections.treasure.push(...parseBulletStrings(block.content));
        break;
      case "clocks":
        sections.clocks.push(...parseListItems(block.content));
        break;
      case "fronts":
        sections.fronts.push(...parseListItems(block.content));
        break;
      case "endings":
        sections.endings.push(...parseListItems(block.content));
        break;
    }
  }

  return sections;
}

// Lazy-DM exact match: all 8 of Sly Flourish's canonical sections are present.
// Used by the orchestrator to skip the LLM extract stages and go straight to
// assembly when the template is followed faithfully.
const LAZY_DM_REQUIRED: SectionKey[] = [
  "strongStart",
  "scenes",
  "secrets",
  "locations",
  "npcs",
];

export function isLazyDmExact(sections: ImportedSections): boolean {
  if (!sections.strongStart) return false;
  for (const key of LAZY_DM_REQUIRED) {
    const value = (sections as unknown as Record<string, unknown>)[key];
    if (Array.isArray(value) && value.length === 0) return false;
    if (key === "strongStart" && !sections.strongStart) return false;
  }
  return sections.unclassified.length === 0;
}
