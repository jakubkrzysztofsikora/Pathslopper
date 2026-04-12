/**
 * Unit tests for src/lib/orchestration/director/graph/nodes.ts
 *
 * Uses real inkjs Story objects (compiled via compileInkSource) for nodes that
 * touch ink state. Mocks the session store and callLLM for pure isolation.
 *
 * Critical bug-fix verifications:
 *  - Bug 1: pickMoveNode with anyClockFull → returns hard move
 *  - Bug 3: evaluateTriggersNode with full clock → diverts story path
 *  - Gap 5: maybeGrantSecretNode with crit result → reveals secret
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import type { DirectorDeps } from "@/lib/orchestration/director/director";
import type { DirectorState } from "@/lib/orchestration/director/graph/state";
import type { WorldState } from "@/lib/schemas/session";
import type { SessionState } from "@/lib/schemas/session";
import {
  loadSessionNode,
  applyInputNode,
  tickClocksNode,
  evaluateTriggersNode,
  continueNode,
  pickMoveNode,
  maybeGrantSecretNode,
  persistNode,
} from "@/lib/orchestration/director/graph/nodes";
import {
  createStory,
  compileInkSource,
  saveState,
} from "@/lib/orchestration/director/ink";
import { makeGraph } from "@/tests/factories/graph-factory";
import { makeSession } from "@/tests/factories/session-factory";
import type { Story } from "inkjs";

// ---------------------------------------------------------------------------
// Ink sources for tests
// ---------------------------------------------------------------------------

// NOTE: nodes.ts evaluateTriggersNode calls story.ChoosePathString(`knot_${edge.to}`)
// without sanitizing edge.to. For the test to verify the divert works, the
// node IDs in the test graph must already be valid Ink identifiers (no hyphens).
// We use "node_defeat" (underscore) as the target node ID here.
const CLOCK_TRIGGER_INK = `
-> start

=== start ===
Hello world.
* [Go to defeat] -> knot_node_defeat

=== knot_node_defeat ===
The alarm clock fired and disaster struck.
-> END
`;

const SIMPLE_INK = `
-> start

=== start ===
Beginning of the story.
* [Choice A] -> ending
* [Choice B] -> ending

=== ending ===
The end.
-> END
`;

// ---------------------------------------------------------------------------
// Pre-compiled story JSON (populated in beforeAll)
// ---------------------------------------------------------------------------

let clockStoryJson: string;
let simpleStoryJson: string;

beforeAll(async () => {
  const { compiledJson: cj } = await compileInkSource(CLOCK_TRIGGER_INK);
  clockStoryJson = cj;
  const { compiledJson: sj } = await compileInkSource(SIMPLE_INK);
  simpleStoryJson = sj;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorldState(overrides: Partial<WorldState> = {}): WorldState {
  return {
    clocks: {},
    flags: [],
    vars: {},
    spotlightDebt: {},
    turnCount: 0,
    lastDirectorMove: "none",
    stallTicks: 0,
    elapsedMinutes: 0,
    ephemeralNpcs: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<DirectorState> = {}): DirectorState {
  return {
    sessionId: "sess-test-1",
    input: { type: "start" },
    story: null,
    worldState: makeWorldState(),
    output: null,
    ...overrides,
  } as DirectorState;
}

function makeStoreMock(session: SessionState) {
  return {
    get: vi.fn().mockResolvedValue(session),
    create: vi.fn(),
    addCharacter: vi.fn(),
    setBrief: vi.fn(),
    setGraph: vi.fn(),
    updateGraph: vi.fn(),
    approve: vi.fn(),
    tick: vi.fn().mockResolvedValue(session),
    size: vi.fn().mockResolvedValue(1),
    _reset: vi.fn(),
  };
}

function makeDeps(session: SessionState): DirectorDeps {
  return {
    callLLM: vi.fn(),
    store: makeStoreMock(session),
    sessionId: session.id,
  };
}

// ---------------------------------------------------------------------------
// Node 1: loadSessionNode
// ---------------------------------------------------------------------------

describe("loadSessionNode", () => {
  it("loads story and worldState from session", async () => {
    const inkSource = SIMPLE_INK;
    const { compiledJson } = await compileInkSource(inkSource);
    const session = makeSession("approved", { inkCompiled: compiledJson });
    const deps = makeDeps(session);
    const node = loadSessionNode(deps);

    const state = makeState({ sessionId: session.id });
    const delta = await node(state);

    expect(delta.story).toBeDefined();
    expect(delta.worldState).toBeDefined();
  });

  it("throws when session has no inkCompiled", async () => {
    const session = makeSession("authoring");
    delete (session as Partial<typeof session>).inkCompiled;
    const deps = makeDeps(session);
    const node = loadSessionNode(deps);

    const state = makeState({ sessionId: session.id });
    await expect(node(state)).rejects.toThrow("no compiled ink");
  });

  it("loads inkState when present", async () => {
    const { compiledJson } = await compileInkSource(SIMPLE_INK);
    const story = createStory(compiledJson);
    // Advance to get a non-default state, then save it
    story.ContinueMaximally();
    const inkState = saveState(story);

    const session = makeSession("playing", {
      inkCompiled: compiledJson,
      inkState,
    });
    const deps = makeDeps(session);
    const node = loadSessionNode(deps);

    const state = makeState({ sessionId: session.id });
    const delta = await node(state);
    expect(delta.story).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Node 2: applyInputNode
// ---------------------------------------------------------------------------

describe("applyInputNode", () => {
  it("returns empty delta when story is null", () => {
    const state = makeState({ story: null, input: { type: "choice", choiceIndex: 0 } });
    const delta = applyInputNode(state);
    expect(delta).toEqual({});
  });

  it("calls ChooseChoiceIndex on type=choice", () => {
    const story = createStory(simpleStoryJson) as Story & {
      ChooseChoiceIndex: ReturnType<typeof vi.fn>;
    };
    story.ContinueMaximally(); // advance to choices

    const spy = vi.spyOn(story, "ChooseChoiceIndex");
    const state = makeState({
      story,
      input: { type: "choice", choiceIndex: 1 },
    });
    applyInputNode(state);
    expect(spy).toHaveBeenCalledWith(1);
  });

  it("does NOT call ChooseChoiceIndex on type=continue", () => {
    const story = createStory(simpleStoryJson);
    story.ContinueMaximally();

    const spy = vi.spyOn(story, "ChooseChoiceIndex");
    const state = makeState({
      story,
      input: { type: "continue" },
    });
    applyInputNode(state);
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Node 3: tickClocksNode
// ---------------------------------------------------------------------------

describe("tickClocksNode", () => {
  it("increments elapsedMinutes by 20 each tick", () => {
    const story = createStory(simpleStoryJson);
    const state = makeState({
      story,
      worldState: makeWorldState({ elapsedMinutes: 40 }),
      input: { type: "start" },
    });
    const delta = tickClocksNode(state);
    expect(delta.worldState?.elapsedMinutes).toBe(60);
  });

  it("increments a specific clock when input is skip with characterName", () => {
    const story = createStory(simpleStoryJson);
    const state = makeState({
      story,
      worldState: makeWorldState({ clocks: { "clock-alarm": 2 } }),
      input: { type: "skip", characterName: "clock-alarm" },
    });
    const delta = tickClocksNode(state);
    expect(delta.worldState?.clocks["clock-alarm"]).toBe(3);
  });

  it("initializes clock to 1 when it does not exist yet", () => {
    const story = createStory(simpleStoryJson);
    const state = makeState({
      story,
      worldState: makeWorldState({ clocks: {} }),
      input: { type: "skip", characterName: "clock-new" },
    });
    const delta = tickClocksNode(state);
    expect(delta.worldState?.clocks["clock-new"]).toBe(1);
  });

  it("returns empty delta when story is null", () => {
    const state = makeState({ story: null, input: { type: "start" } });
    const delta = tickClocksNode(state);
    expect(delta).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Node 4: evaluateTriggersNode — Bug 3 fix verification
// ---------------------------------------------------------------------------

// Graph with underscore-based node IDs so that nodes.ts can divert via
// story.ChoosePathString(`knot_${edge.to}`) — the knot name in CLOCK_TRIGGER_INK
// is `knot_node_defeat` so edge.to must be "node_defeat".
function makeClockTriggerGraph() {
  return makeGraph({
    edges: [
      { id: "e1", from: "node-start", to: "node_s2", kind: "auto", onTraverseEffects: [], priority: 0 },
      {
        id: "e-clock",
        from: "node-start",
        to: "node_defeat",
        kind: "clock-trigger",
        clockId: "clock-1",
        onTraverseEffects: [],
        priority: 0,
      },
    ],
  });
}

describe("evaluateTriggersNode", () => {
  it("diverts story to knot_node_defeat when clock-1 is full (Bug 3 fix)", async () => {
    const graph = makeClockTriggerGraph();
    const { compiledJson } = await compileInkSource(CLOCK_TRIGGER_INK);
    const session = makeSession("playing", {
      inkCompiled: compiledJson,
      graph,
    });
    const deps = makeDeps(session);
    const node = evaluateTriggersNode(deps);

    const story = createStory(compiledJson);
    // clock-1 has 4 segments — fill it to exactly 4 (full)
    const worldState = makeWorldState({ clocks: { "clock-1": 4 } });

    const state = makeState({ story, worldState, sessionId: session.id });
    const delta = await node(state);

    // cursorNodeId should be updated to node_defeat (the edge.to value)
    expect(delta.worldState?.cursorNodeId).toBe("node_defeat");
  });

  it("does NOT divert when clock is not full", async () => {
    const graph = makeClockTriggerGraph();
    const { compiledJson } = await compileInkSource(CLOCK_TRIGGER_INK);
    const session = makeSession("playing", {
      inkCompiled: compiledJson,
      graph,
    });
    const deps = makeDeps(session);
    const node = evaluateTriggersNode(deps);

    const story = createStory(compiledJson);
    // clock-1 has segments=4, fill to 3 (not full)
    const worldState = makeWorldState({ clocks: { "clock-1": 3 } });

    const state = makeState({ story, worldState, sessionId: session.id });
    const delta = await node(state);

    // cursorNodeId should NOT be set
    expect(delta.worldState?.cursorNodeId).toBeUndefined();
  });

  it("returns early when session has no graph", async () => {
    const session = makeSession("approved");
    delete (session as Partial<typeof session>).graph;
    const deps = makeDeps(session);
    const node = evaluateTriggersNode(deps);

    const { compiledJson } = await compileInkSource(SIMPLE_INK);
    const story = createStory(compiledJson);
    const state = makeState({ story, sessionId: session.id });
    const delta = await node(state);

    // Should return empty story ref — no crash
    expect(delta).toEqual({});
  });

  it("skips edge when clockId not found in graph.clocks", async () => {
    const graph = makeGraph({
      edges: [
        {
          id: "e-missing",
          from: "node-start",
          to: "node-s2",
          kind: "clock-trigger",
          clockId: "clock-nonexistent",
          onTraverseEffects: [],
          priority: 0,
        },
      ],
    });
    const { compiledJson } = await compileInkSource(SIMPLE_INK);
    const session = makeSession("playing", { graph, inkCompiled: compiledJson });
    const deps = makeDeps(session);
    const node = evaluateTriggersNode(deps);

    const story = createStory(compiledJson);
    const worldState = makeWorldState({ clocks: {} });
    const state = makeState({ story, worldState, sessionId: session.id });

    // Should not throw
    const delta = await node(state);
    expect(delta.worldState?.cursorNodeId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Node 5: continueNode
// ---------------------------------------------------------------------------

describe("continueNode", () => {
  it("returns narration and choices from a compiled story", () => {
    const story = createStory(simpleStoryJson);
    const state = makeState({ story, worldState: makeWorldState() });
    const delta = continueNode(state);

    expect(delta.output?.narration).toContain("Beginning of the story");
    expect(delta.output?.choices).toHaveLength(2);
    expect(delta.output?.phase).toBe("awaiting-choice");
  });

  it("increments turnCount", () => {
    const story = createStory(simpleStoryJson);
    const state = makeState({
      story,
      worldState: makeWorldState({ turnCount: 5 }),
    });
    const delta = continueNode(state);
    expect(delta.worldState?.turnCount).toBe(6);
  });

  it("increments stallTicks when story has no narration and no end", () => {
    // A story that can't continue and has no choices increments stall
    const story = createStory(simpleStoryJson);
    story.ContinueMaximally(); // advance past narration to choices — stall not yet
    // After choices, create a state where story cannot continue further
    const state = makeState({
      story: null, // null story → stallTick increment path
      worldState: makeWorldState({ stallTicks: 1 }),
    });
    const delta = continueNode(state);
    expect(delta.worldState?.stallTicks).toBe(2);
  });

  it("resets stallTicks to 0 when narration is produced", () => {
    const story = createStory(simpleStoryJson);
    const state = makeState({
      story,
      worldState: makeWorldState({ stallTicks: 3 }),
    });
    const delta = continueNode(state);
    // narration produced → stallTicks reset
    expect(delta.worldState?.stallTicks).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Node 6: pickMoveNode — Bug 1 fix verification
// ---------------------------------------------------------------------------

describe("pickMoveNode", () => {
  it("returns hard move when anyClockFull is true (Bug 1 fix)", async () => {
    const graph = makeGraph();
    // clock-1 has 4 segments; fill to 4
    const session = makeSession("playing", { graph });
    const deps = makeDeps(session);
    const node = pickMoveNode(deps);

    const worldState = makeWorldState({ clocks: { "clock-1": 4 } });
    const state = makeState({
      worldState,
      sessionId: session.id,
      output: {
        narration: "Some narration",
        choices: [],
        phase: "narrating",
        lastMove: "cutscene",
        worldState,
        ended: false,
      },
    });

    const delta = await node(state);
    expect(delta.output?.lastMove).toBe("hard");
  });

  it("returns cutscene as default when no signals active", async () => {
    const session = makeSession("playing");
    const deps = makeDeps(session);
    const node = pickMoveNode(deps);

    const worldState = makeWorldState({ clocks: {} });
    const state = makeState({
      worldState,
      sessionId: session.id,
      output: {
        narration: "Quiet narration",
        choices: [],
        phase: "narrating",
        lastMove: "none",
        worldState,
        ended: false,
      },
    });

    const delta = await node(state);
    expect(delta.output?.lastMove).toBe("cutscene");
  });

  it("returns empty delta when output is null", async () => {
    const session = makeSession("playing");
    const deps = makeDeps(session);
    const node = pickMoveNode(deps);

    const state = makeState({ output: null, sessionId: session.id });
    const delta = await node(state);
    expect(delta).toEqual({});
  });

  it("returns question move when choices are pending", async () => {
    const session = makeSession("playing");
    const deps = makeDeps(session);
    const node = pickMoveNode(deps);

    const worldState = makeWorldState({ clocks: {} });
    const state = makeState({
      worldState,
      sessionId: session.id,
      output: {
        narration: "Choose wisely.",
        choices: [
          { index: 0, label: "Fight" },
          { index: 1, label: "Flee" },
        ],
        phase: "awaiting-choice",
        lastMove: "none",
        worldState,
        ended: false,
      },
    });

    const delta = await node(state);
    expect(delta.output?.lastMove).toBe("question");
  });
});

// ---------------------------------------------------------------------------
// Node 6b: maybeGrantSecretNode — Gap 5 fix verification
// ---------------------------------------------------------------------------

describe("maybeGrantSecretNode", () => {
  it("reveals a secret when lastAdjudicationCritSuccess is true (Gap 5 fix)", async () => {
    // maybeGrantSecretNode filters secrets whose conclusionTag matches an active front ID.
    // We build a graph where front.id === secret.conclusionTag so a match is guaranteed.
    const graph = makeGraph({
      fronts: [
        {
          id: "front-1",
          name: "Tyran",
          stakes: ["Czy drużyna pokona tyrana?"],
          dangers: [{ name: "Straż", impulse: "Aresztować wszystkich." }],
          grimPortents: ["Podatki rosną.", "Mury się wzmacniają.", "Opór milknie."],
          impendingDoom: "Całkowite zniewolenie regionu.",
          firedPortents: 0, // active — not all portents fired
        },
      ],
      secrets: [
        {
          id: "s1",
          text: "Sekretne przejście w wieży.",
          conclusionTag: "front-1", // matches front.id
          discovered: false,
          delivery: "npc-dialog",
          requires: [],
        },
      ],
    });
    const session = makeSession("playing", { graph });
    const deps = makeDeps(session);
    const node = maybeGrantSecretNode(deps);

    const worldState = makeWorldState({
      vars: { lastAdjudicationCritSuccess: true },
    });
    const output = {
      narration: "A great success!",
      choices: [],
      phase: "narrating" as const,
      lastMove: "hard" as const,
      worldState,
      ended: false,
    };
    const state = makeState({ worldState, output, sessionId: session.id });
    const delta = await maybeGrantSecretNode(deps)(state);

    // Should append whisper to narration
    expect(delta.output?.narration).toContain("[Szept MG — krytyczny sukces]");
    // Should mark flag as revealed
    const updatedVars = delta.worldState?.vars;
    const hasRevealedKey = Object.keys(updatedVars ?? {}).some((k) =>
      k.startsWith("secret_revealed_")
    );
    expect(hasRevealedKey).toBe(true);
    // Should clear the crit flag
    expect(updatedVars?.lastAdjudicationCritSuccess).toBe(false);
  });

  it("does nothing when lastAdjudicationCritSuccess is false", async () => {
    const session = makeSession("playing");
    const deps = makeDeps(session);

    const worldState = makeWorldState({
      vars: { lastAdjudicationCritSuccess: false },
    });
    const output = {
      narration: "Normal success.",
      choices: [],
      phase: "narrating" as const,
      lastMove: "soft" as const,
      worldState,
      ended: false,
    };
    const state = makeState({ worldState, output, sessionId: session.id });
    const delta = await maybeGrantSecretNode(deps)(state);

    expect(delta).toEqual({});
  });

  it("does nothing when no undiscovered secrets match active fronts", async () => {
    // All secrets discovered — candidates array empty → returns {}
    const graph = makeGraph({
      fronts: [
        {
          id: "front-1",
          name: "Tyran",
          stakes: ["Czy drużyna pokona tyrana?"],
          dangers: [{ name: "Straż", impulse: "Aresztować wszystkich." }],
          grimPortents: ["Podatki rosną.", "Mury się wzmacniają.", "Opór milknie."],
          impendingDoom: "Całkowite zniewolenie.",
          firedPortents: 0,
        },
      ],
      secrets: [
        {
          id: "s1",
          text: "Already known secret.",
          conclusionTag: "front-1",
          discovered: true, // already discovered — excluded
          delivery: "npc-dialog",
          requires: [],
        },
      ],
    });
    const session = makeSession("playing", { graph });
    const deps = makeDeps(session);

    const worldState = makeWorldState({
      vars: { lastAdjudicationCritSuccess: true },
    });
    const output = {
      narration: "Crit success but no secrets left!",
      choices: [],
      phase: "narrating" as const,
      lastMove: "hard" as const,
      worldState,
      ended: false,
    };
    const state = makeState({ worldState, output, sessionId: session.id });
    const delta = await maybeGrantSecretNode(deps)(state);

    // No whisper appended — returns empty delta since candidates is empty
    expect(delta).toEqual({});
  });

  it("returns empty delta when output is null", async () => {
    const session = makeSession("playing");
    const deps = makeDeps(session);

    const state = makeState({ output: null, sessionId: session.id });
    const delta = await maybeGrantSecretNode(deps)(state);
    expect(delta).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Node 7: persistNode
// ---------------------------------------------------------------------------

describe("persistNode", () => {
  it("calls store.tick with serialized ink state and worldState", async () => {
    const { compiledJson } = await compileInkSource(SIMPLE_INK);
    const session = makeSession("playing", { inkCompiled: compiledJson });
    const storeMock = makeStoreMock(session);
    const deps: DirectorDeps = {
      callLLM: vi.fn(),
      store: storeMock,
      sessionId: session.id,
    };

    const story = createStory(compiledJson);
    story.ContinueMaximally(); // advance to get a meaningful state
    const worldState = makeWorldState({ turnCount: 7 });
    const output = {
      narration: "Some text",
      choices: [],
      phase: "narrating" as const,
      lastMove: "cutscene" as const,
      worldState,
      ended: false,
    };

    const state = makeState({ story, worldState, output, sessionId: session.id });
    const node = persistNode(deps);
    const delta = await node(state);

    expect(storeMock.tick).toHaveBeenCalledOnce();
    const [calledId, calledInkState, calledWorldState] =
      storeMock.tick.mock.calls[0];
    expect(calledId).toBe(session.id);
    expect(typeof calledInkState).toBe("string");
    expect(calledWorldState.turnCount).toBe(7);
    // delta should carry the output through
    expect(delta.output).toBeDefined();
  });

  it("returns empty delta when story or output is null", async () => {
    const session = makeSession("playing");
    const deps = makeDeps(session);
    const node = persistNode(deps);

    const state = makeState({ story: null, output: null, sessionId: session.id });
    const delta = await node(state);
    expect(delta).toEqual({});
  });
});
