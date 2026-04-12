import { describe, it, expect, beforeAll } from "vitest";
import { Story } from "inkjs";
import {
  createStory,
  continueMaximally,
  choose,
  saveState,
  loadState,
  currentKnot,
  getVariable,
  setVariable,
  compileInkSource,
} from "@/lib/orchestration/director/ink";

// ---------------------------------------------------------------------------
// Tiny fixture .ink sources — hand-authored, no dependency on render-ink
// ---------------------------------------------------------------------------

const SIMPLE_INK = `
VAR visited = false
-> intro

=== intro ===
~ visited = true
You stand at a crossroads.
* [Go north] -> north
* [Go south] -> south

=== north ===
You head north.
-> END

=== south ===
You head south.
-> END
`;

const CONTINUE_INK = `
-> scene_a

=== scene_a ===
Scene A narration.
-> scene_b

=== scene_b ===
Scene B narration.
-> END
`;

async function compileInk(source: string): Promise<Story> {
  const { compiledJson } = await compileInkSource(source);
  return createStory(compiledJson);
}

// Pre-compile fixtures once to keep tests fast
let simpleStoryJson: string;
let continueStoryJson: string;

beforeAll(async () => {
  const { compiledJson: sj } = await compileInkSource(SIMPLE_INK);
  simpleStoryJson = sj;
  const { compiledJson: cj } = await compileInkSource(CONTINUE_INK);
  continueStoryJson = cj;
});

function freshSimple(): Story {
  return createStory(simpleStoryJson);
}

function freshContinue(): Story {
  return createStory(continueStoryJson);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createStory", () => {
  it("creates a Story instance from compiled JSON", () => {
    const story = freshSimple();
    expect(story).toBeInstanceOf(Story);
    expect(story.canContinue).toBe(true);
  });
});

describe("continueMaximally", () => {
  it("runs story to first choice and returns choices", () => {
    const story = freshSimple();
    const result = continueMaximally(story);
    expect(result.narration).toContain("You stand at a crossroads");
    expect(result.choices).toHaveLength(2);
    expect(result.choices[0].label).toBe("Go north");
    expect(result.choices[1].label).toBe("Go south");
    expect(result.ended).toBe(false);
  });

  it("returns ended=true after story reaches END", () => {
    const story = freshContinue();
    const result = continueMaximally(story);
    expect(result.narration).toContain("Scene A narration");
    expect(result.narration).toContain("Scene B narration");
    expect(result.choices).toHaveLength(0);
    expect(result.ended).toBe(true);
  });
});

describe("choose", () => {
  it("chooses option 0 and continues to north knot", () => {
    const story = freshSimple();
    continueMaximally(story); // advance to choice
    choose(story, 0);
    const result = continueMaximally(story);
    expect(result.narration).toContain("You head north");
    expect(result.ended).toBe(true);
  });

  it("chooses option 1 and continues to south knot", () => {
    const story = freshSimple();
    continueMaximally(story);
    choose(story, 1);
    const result = continueMaximally(story);
    expect(result.narration).toContain("You head south");
    expect(result.ended).toBe(true);
  });
});

describe("saveState / loadState", () => {
  it("round-trips story state and resumes from saved point", () => {
    const story = freshSimple();
    continueMaximally(story); // advance to choice point

    const saved = saveState(story);
    expect(typeof saved).toBe("string");
    expect(saved.length).toBeGreaterThan(0);

    // Make a choice on the original story
    choose(story, 0);

    // Create a fresh story and load the saved state
    const story2 = createStory(simpleStoryJson);
    loadState(story2, saved);

    // Should be back at the choice point
    const choices = story2.currentChoices;
    expect(choices).toHaveLength(2);
    expect(choices[0].text).toBe("Go north");
  });
});

describe("currentKnot", () => {
  it("returns string or undefined (null path maps to undefined)", () => {
    const story = freshSimple();
    continueMaximally(story);
    const knot = currentKnot(story);
    // inkjs returns null when at a choice boundary — currentKnot maps to undefined
    expect(knot === undefined || typeof knot === "string").toBe(true);
  });
});

describe("getVariable / setVariable", () => {
  it("reads a VAR after it has been set by story logic", () => {
    const story = freshSimple();
    continueMaximally(story); // triggers ~ visited = true
    const val = getVariable(story, "visited");
    expect(val).toBe(true);
  });

  it("sets a VAR and reads it back", () => {
    const story = freshSimple();
    continueMaximally(story);
    setVariable(story, "visited", false);
    expect(getVariable(story, "visited")).toBe(false);
  });
});

describe("createStory — error handling for corrupt / invalid JSON", () => {
  it("throws descriptive error when compiledJson is not valid JSON", () => {
    expect(() => createStory("NOT JSON AT ALL")).toThrow(
      /createStory: compiledJson is not valid JSON/
    );
  });

  it("throws descriptive error when compiledJson is missing inkVersion key", () => {
    const noVersion = JSON.stringify({ root: [[]], listDefs: {} });
    expect(() => createStory(noVersion)).toThrow(
      /missing required inkVersion or root keys/
    );
  });

  it("throws descriptive error when compiledJson is missing root key", () => {
    const noRoot = JSON.stringify({ inkVersion: 21, listDefs: {} });
    expect(() => createStory(noRoot)).toThrow(
      /missing required inkVersion or root keys/
    );
  });
});
