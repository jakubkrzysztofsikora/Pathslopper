import type { PathfinderVersion } from "@/lib/schemas/version";

export function buildCharacterSheetVLMPrompt(version: PathfinderVersion): string {
  if (version === "pf1e") {
    return `You are an expert Pathfinder 1st Edition rules assistant. Parse the character sheet image provided and extract all relevant information.

Return a JSON object with the following structure:
{
  "version": "pf1e",
  "name": "character name",
  "race": "race name",
  "classes": ["class1", "class2"],
  "level": 1,
  "feats": ["feat1", "feat2"],
  "bab": 0,
  "saves": {
    "fortitude": 0,
    "reflex": 0,
    "will": 0
  },
  "abilityScores": {
    "str": 10,
    "dex": 10,
    "con": 10,
    "int": 10,
    "wis": 10,
    "cha": 10
  }
}

Extract the total save values (including all bonuses). BAB is the base attack bonus. Return only the JSON, no commentary.`;
  }

  return `You are an expert Pathfinder 2nd Edition rules assistant. Parse the character sheet image provided and extract all relevant information.

Return a JSON object with the following structure:
{
  "version": "pf2e",
  "name": "character name",
  "ancestry": "ancestry name",
  "background": "background name",
  "class": "class name",
  "level": 1,
  "actionTags": ["action1", "action2"],
  "proficiencies": {
    "perception": "trained",
    "fortitude": "expert"
  },
  "abilityScores": {
    "str": 10,
    "dex": 10,
    "con": 10,
    "int": 10,
    "wis": 10,
    "cha": 10
  }
}

Proficiency values must be one of: untrained, trained, expert, master, legendary. Action tags are free actions, reactions, or special activities listed on the sheet. Return only the JSON, no commentary.`;
}
