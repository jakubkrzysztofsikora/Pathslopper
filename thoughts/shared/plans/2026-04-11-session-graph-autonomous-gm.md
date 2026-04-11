---
date: 2026-04-11
commit: 511660c9d21fbc6b037e6ad7b3325a4ef31afb95
branch: main
status: draft (v3 — post architecture + testing + TTRPG practitioner reviews)
supersedes: thoughts/shared/plans/2026-04-10-remaining-features.md (Phases 2-4 of that plan remain valid; Phase 1 is re-used)
---

# Plan: Pre-generated Session Graph + Autonomous GM Director

## Revision history

- **v1 (2026-04-11 initial)** — first draft after GM methodology + narrative
  graph research.
- **v2 (2026-04-11 post-review)** — applied architecture-review amendments
  A-H: (A) split session-store into interface + impl; (B) move director
  under `src/lib/orchestration/director/` instead of its own top-level
  directory; (C) drop `InkRuntime` wrapper abstraction in favor of flat
  helpers; (D) consolidate six tiny director files into three; (E) drop
  Victory Points from MVP scope; (F) ship Phase 0 + Phase 1 as one atomic
  commit; (G) note LangGraph pin reuse; (H) replace test-count target
  with coverage baseline. Added explicit Iron Law trade-off section.
- **v3.1 (2026-04-11 post-toolchain-research)** — Amendment V folds
  in the "adopt immediately" recommendations from a web-research pass
  on 2026-04 TTRPG/LLM/React Flow tooling. Changes: (a) ELKjs replaces
  dagre in Phase 4 authoring layout; (b) React Flow
  `onlyRenderVisibleElements` made an explicit requirement;
  (c) Arize Phoenix added as the local LangGraph observability layer
  (replaces the vague "OTel to Cockpit" note); (d) promptfoo +
  vitest-evals added to Phase 2/7 for prompt regression testing;
  (e) `@asteasolutions/zod-to-openapi` added as the OpenAPI
  generator for the API route contracts; (f) `.vscode/extensions.json`
  committed with `ephread.ink` for Ink syntax highlighting. Also
  noted: Claude Code Agent Teams feature flag + ttrpg-gm-expert
  agent (both committed in the same atomic commit as this plan).
- **v3 (2026-04-11 post-practitioner-review)** — added Local Testing
  Strategy section, then applied two follow-up reviews:
  - Architecture review #2 (5 nits fixed): removed 4 speculative debug
    scripts, corrected coverage baseline to survivor-subset only,
    scrubbed fabricated skill citations, disambiguated MSW vs callLLM DI
    boundary, enumerated all 6 MSW routes, fixed E2E file-name drift.
  - Test-automator review: added mid-play/combat/clock-full fixtures,
    fixed MSW import alias, added jsdom `/_next/*` passthrough,
    added Director narration assertion pattern, clarified integration
    tick budget.
  - TTRPG practitioner review (YELLOW verdict): substantial schema +
    Director + edge-case additions — see amendments I through R below.
    The practitioner's headline finding was that the v2 schema captured
    "stage directions, not scenes" and the Director classifier was
    "a traffic light, not a GM". v3 addresses both.

## Summary

Pivot Pathfinder Nexus from a reactive "AI Dungeon" console to a real Game
Master: **(1)** a generator produces a full session as a node-and-edge
graph (Telltale-style) from a brief, **(2)** a human GM assistant reviews
and edits the graph in a React-Flow authoring UI, **(3)** an inkjs-backed
Director runs the approved graph autonomously — deciding when a player
acts, when an NPC acts, and when to narrate — using Blades-in-the-Dark
clocks and Dungeon-World Fronts as the "world heartbeat". No feature
flags, no migration path; current in-flight sessions are wiped on deploy.

## Research References

- GM prep methodology research (in-conversation web research, 2026-04-11):
  Sly Flourish's Lazy DM, Alexandrian node-based design, Three-Clue Rule,
  Dungeon World Fronts, Blades in the Dark Progress Clocks, PbtA hard/soft
  moves, Five-Room Dungeon, PF2e Victory Points, AI GM failure modes
  (narrative drift, forgetfulness, sycophantic yes-and).
- Narrative graph systems research (in-conversation, 2026-04-11):
  Ink JSON runtime format, Yarn Spinner storylets/saliency, articy:draft
  pin model, Telltale "drift and return", Façade drama manager, Versu
  reactive NPCs, Samuel Ashwell's Branch-and-Bottleneck topology.
- Existing codebase map (direct read of `src/lib/state/server/session-store.ts:28-74`,
  `src/lib/schemas/session.ts:51-77`, `src/lib/orchestration/resolve-interaction.ts`,
  `src/app/sesja/[id]/page.tsx`, `src/components/interaction/player-input-console.tsx`).
- Prior plan: `thoughts/shared/plans/2026-04-10-remaining-features.md`
  (Phase 1 integration-test harness carries over; Phase 2 SRD RAG stays as-is
  because RAG is useful for rules lookup during play; Phases 3-4 of that plan
  are subsumed by this rewrite).

## Domain authority: `ttrpg-gm-expert` agent

**Rule:** every non-trivial domain decision in this plan — SessionGraph
schema fields, generator prompts, Director behavior, combat resolution,
NPC stat blocks, ending conditions, edge-case handling, safety tools —
**must be consulted with the `ttrpg-gm-expert` subagent before it lands
in code.** The agent definition lives at `.claude/agents/ttrpg-gm-expert.md`
and is a senior Pathfinder 2e GM with 15+ years of experience. It has
final say on whether a design would actually be runnable at a real
table.

**Consult it proactively when:**
- Writing or modifying any file under
  `src/lib/schemas/session-graph.ts`,
  `src/lib/schemas/session-brief.ts`,
  `src/lib/orchestration/generate-session.ts`,
  `src/lib/prompts/session-generator/*`,
  `src/lib/orchestration/director/*`,
  `src/lib/orchestration/director/pf2e-statblock-validator.ts`.
- Choosing a prompt, a field cardinality, or a numeric default that
  would affect how a generated graph feels at the table.
- Validating a real generated graph before approving it for authoring.
- Reviewing product marketing copy that mentions combat or PF2e
  accuracy (Amendment R: "PF2e-flavored narrative combat", never "full
  PF2e combat").

Its verdict format is `GREEN / YELLOW / RED` with concrete amendments.
Treat a `RED` verdict as a blocker on implementation; treat `YELLOW`
as a required follow-up task.

The v3 plan amendments I–U were produced by an adversarial run of
exactly this agent against v2. Future amendments to the schema or
Director behavior follow the same loop.

## Implementation workflow: Claude Code Agent Teams (experimental)

This repo commits `.claude/settings.json` with
`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`. The implementation of every
phase below is coordinated using Claude Code's Agent Teams feature
(team lead + teammates with a shared task list), not sequential
single-agent invocations. Why:

- **Phases 2–5 have parallelizable sub-phases.** Phase 2's stages A–F
  can each be iterated on by a different prompt-engineer teammate
  while a shared validator watches the final assembled graph. Phase
  4's authoring UI can be built by a frontend-developer in parallel
  with Phase 5's play UI by a second frontend-developer, both
  coordinating with a shared design-systems teammate for visual
  consistency.
- **Domain decisions gate the critical path.** The team lead spawns
  `ttrpg-gm-expert` on every domain-adjacent PR and blocks until
  verdict returns GREEN or YELLOW-with-accepted-caveats. No teammate
  commits domain-adjacent code on their own.
- **Review rounds become first-class team members.** The `architect-
  reviewer`, `test-automator`, and `ttrpg-gm-expert` sit in the team
  rotation and are tagged automatically when work touches their
  concern area.

### Team composition per phase

| Phase | Team lead | Teammates | Domain consultant |
|---|---|---|---|
| 0+1 | `context-manager` | `backend-developer`, `architect-reviewer` | `ttrpg-gm-expert` for schema field selection |
| 2 | `llm-architect` | `prompt-engineer` (×6, one per stage), `ai-engineer`, `backend-developer`, `test-automator` | `ttrpg-gm-expert` (validates every stage's output against real GM prep) |
| 3 | `backend-developer` | `ai-engineer`, `prompt-engineer`, `test-automator`, `tdd-orchestrator` | `ttrpg-gm-expert` for Director move classifier tuning |
| 4 | `frontend-developer` | `ui-designer`, `frontend-design` skill, `accessibility-tester`, perf-focused subagent | `ttrpg-gm-expert` for regen-at-level workflow fit |
| 5 | `frontend-developer` | `ui-designer`, `ai-engineer` (for npc.ts), `test-automator`, Playwright E2E writer | `ttrpg-gm-expert` for combat resolution UX |
| 6 | `backend-developer` | `test-automator` | `ttrpg-gm-expert` for ending category balance |
| 7 | `test-automator` | `tdd-orchestrator`, `qa-expert` | `ttrpg-gm-expert` for fixture realism |

### Team lead duties (per phase)

1. **Kickoff:** spawn the team with a shared task list that mirrors
   the phase's "Changes" list. Each task gets an owner from the
   teammate pool.
2. **Domain gate:** before dispatching ANY task that touches
   SessionGraph semantics, generator prompts, Director behavior, or
   PF2e math, spawn `ttrpg-gm-expert` with the specific proposal and
   block the task on its verdict.
3. **Cross-consultant calls:** when a task spans two specialists
   (e.g., a prompt change that affects the Director classifier),
   both consultants are added to the task's watchers and must return
   verdicts.
4. **Integration gate:** before closing the phase, run
   `architect-reviewer` + `test-automator` + `ttrpg-gm-expert` in
   parallel against the cumulative diff. All three must return
   GREEN or YELLOW-with-documented-mitigations.
5. **Commit on main:** only the team lead has commit authority. The
   lead writes the commit message after receiving all-green from
   integration review. Commits go directly to `main` per user
   direction — no feature branches for this plan.

### Fallback when Agent Teams is disabled

If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is unset (e.g., a contributor
has not adopted the repo's `.claude/settings.json`), the plan still
works via sequential subagent invocations. The phase team-lead/teammate
structure above degrades to a single agent calling the consultants
one at a time via the Agent tool. Slower, but correctness is
preserved.

## Design primitives (non-negotiable baselines from research)

These are baked into every phase below — do not drift from them during
implementation without a written note in this plan.

1. **Nodes are situations, not events.** (Alexandrian)
2. **Single cursor, Branch-and-Bottleneck.** (Ashwell, Telltale) — true forks
   only at act boundaries. Everywhere else, flags shade the same node.
3. **Three-Clue Rule.** Every conclusion the party must reach has ≥3 in-edges
   from distinct parent nodes carrying a clue. Validated at authoring time.
4. **Clocks are the world's heartbeat.** Blades-style 4/6/8-segment progress
   clocks tick on hard moves, failed rolls, or time-skip. When they fill,
   the Director fires a `clock-trigger` edge regardless of player focus.
5. **Fronts own the "if unopposed" spine.** Every front has 3-5 ordered
   Grim Portents and exactly one Impending Doom. When the last portent
   fires, the session ends in that doom. Player progress is tracked
   through flags and clock state; earlier endings in `graph.endings[]`
   may beat the doom to the punch via `flag-set` / `clock-filled`
   predicates. (MVP does not use Victory Points — Amendment E.)
6. **Secrets are location-independent.** Prep produces a flat list of
   12-16 secrets, each tagged with a conclusion. The Director assigns
   them to whichever node is live.
7. **Director picks from three moves.** Per tick: hard move (consequence),
   soft move (telegraph danger), ask-a-question (player turn). Trigger:
   clock fill / failed roll → hard; clock 1-step-from-fill → soft;
   spotlight debt > N → question.
8. **Strong Start is the only scripted moment.** One fully authored
   opening node per session. Everything else is situational.
9. **Fail-forward only.** Every node resolution produces a state transition.
   The graph has no "dead" edges. Only terminal nodes are endings.
10. **Authoring ≠ runtime.** The AI-generated / human-edited `SessionGraph`
    is the authoring format. inkjs compiled JSON is the runtime format.
    The runtime never mutates the authored graph — emergent additions
    live in `WorldState.flags` and `clocks`.

## Trade-offs accepted by this rewrite (Iron Law)

Per the architecture-review discipline (anti-rationalization.md): *no
architectural change without documenting the trade-off*. This plan is a
**rewrite** (a Stop-list item), so the trade-off must be named
explicitly.

The rewrite is justified because the current architecture implements a
different product (reactive AI Dungeon) than the target product
(autonomous GM). Incremental refactor would keep the reactive turn
loop's assumptions embedded in `SessionState`, `appendResolved`, and
`PlayerInputConsole` — those assumptions ARE the bug.

**What we gain:**
- A session model that a real GM would recognize (fronts, clocks,
  secrets, node graph)
- Autonomous cutscene advancement via inkjs (Q6 Model A)
- Pre-authored + human-reviewed graphs (Q4 level 3.5)
- One architectural home for LLM orchestration (see Engine Choice
  and Phase 3 — director lives under `src/lib/orchestration/director/`,
  not in a sibling directory)

**What we lose:**
- ~65 tests (sunk investment in the reactive model — see Phase 0
  deletion list)
- ~8 months of prompt tuning in `narrator.ts`, `optimize-input.ts`,
  `summarize-deadlock.ts`
- The manager-override bypass at `resolve-interaction.ts:122-156`
  (explicit GM override of specific turns). The graph model subsumes
  this via human edits in the authoring UI + admin-override controls
  on clocks at play time, but the "force outcome" verb goes away.
- Intent extraction via `optimize-input.ts` — **partially restored**
  as `player-input-bridge` for the free-text escape hatch in play mode
  (Phase 3)

**What we keep (untouched by this plan):**
- `src/lib/dice/*` — PF2e math, reused by the play-time adjudicator
- `src/lib/rag/*` — SRD retrieval, reused for rules lookup at play time
- `src/lib/llm/*` — Scaleway client + structured output parsers
- `src/lib/schemas/character-sheet.ts` + VLM route — character import
- `src/lib/schemas/story-dna.ts` + the wizard's mood presets (per Q3)
- All infrastructure (Terraform, Redis, Object Storage, Scaleway keys)

**Alternatives rejected:**
1. *Strangler-fig + feature flag.* Rejected at user direction
   (Q1: "greenfield, feel free to remove stuff"). The manager-override
   path would need to be re-specified inside the graph model anyway,
   so keeping it alive during a transition has no payoff.
2. *Custom Director runtime.* Rejected at user direction
   (Q12: "use ready, battle tested tool"). inkjs picked as the only
   engine with commercial-scale production use (80 Days, Heaven's
   Vault, Disco Elysium).
3. *articy-js runtime.* Rejected because articy-js's Redux-style
   reducer does not expose `ContinueMaximally()`-style cutscene
   autoplay — which is the exact primitive we need for Q6 Model A.
4. *Top-level `src/lib/orchestration/director/` directory.* Rejected on architecture
   review: it would create a parallel pattern alongside
   `src/lib/orchestration/`. Director IS orchestration, just at play
   time instead of prep time. One orchestration home.
5. *`InkRuntime` TypeScript wrapper interface.* Rejected on architecture
   review as a single-implementation abstraction. Use flat named
   helpers in `src/lib/orchestration/director/ink.ts` and extract the
   interface only if a second runtime ever appears.
6. *PF2e Victory Points as MVP scope.* Deferred. User did not ask for
   it; research mentioned it among several ending-selection mechanics.
   Clock-filled + flag-set predicates cover MVP ending conditions.
   VP can ship later if real playtests demand it.

## Engine choice: inkjs (battle-tested)

Per user call: use a ready, battle-tested tool rather than a hand-rolled
runtime. The chosen runtime is [**inkjs**](https://github.com/y-lohse/inkjs)
— the official JavaScript port of inkle's Ink language, used by 80 Days,
Heaven's Vault, Sorcery!, and Disco Elysium. Rationale:

- `Story.ContinueMaximally()` is exactly the cutscene autoplay we need
  (Q6 Model A).
- Ink variables + `TurnIndexForKnot()` give us per-node flags without
  reinventing them.
- External function bindings (`Story.BindExternalFunction`) bridge to
  the PF2e adjudicator — the Director calls `~ roll_skill("stealth", 15)`
  from within the narrative and receives a deterministic outcome.
- State is a single serializable JSON blob via `Story.state.ToJson()`,
  fits Redis naturally.
- Active commercial deployment = the only "battle-tested" narrative
  engine that matches.

**Trade-off accepted:** Ink requires a compile step from `.ink` source
text to runtime JSON. The LLM does NOT emit Ink directly; it emits our
typed `SessionGraph` JSON (easier for structured output). A deterministic
TypeScript renderer (`src/lib/orchestration/director/render-ink.ts`) templates
`SessionGraph` → `.ink` source, then `inkjs.Compiler` produces the
runtime object. This keeps the LLM on structured output (which it's
good at) while still using Ink's runtime (which is the battle-tested
part).

---

## Phase 0 + Phase 1 ship as one commit (Amendment F)

Phase 0 (demolition) and Phase 1 (new schemas + store interface) must
land as a **single atomic commit** titled
`chore(session): replace reactive turn model with session-graph model`.
Splitting them would leave main in a broken intermediate state after
Phase 0 (the app would typecheck but no orchestrator could produce a
session). The plan describes them as two phases for review clarity;
git history shows one atomic restructure.

## Phase 0: Demolition

**Rationale:** Greenfield per user direction. The current "turns-as-log"
session model and its orchestrators are not load-bearing for the new
design — they are actively in the way. Delete them alongside the Phase
1 schema introduction in a single commit so main never sees a broken
intermediate state.

**Subagent:** `code-reviewer` to audit the deletion diff before commit.

### Changes

#### Delete files (git rm)
- `src/lib/orchestration/resolve-interaction.ts`
- `src/lib/orchestration/narrate-scene.ts`
- `src/lib/orchestration/optimize-input.ts`
- `src/lib/orchestration/summarize-deadlock.ts`
- `src/lib/orchestration/graph/*` (the existing LangGraph scaffold)
- `src/lib/prompts/narrator.ts`
- `src/lib/prompts/input-optimizer.ts`
- `src/app/api/interaction/resolve/route.ts`
- `src/app/api/interaction/narrate/route.ts`
- `src/app/api/sessions/[id]/override/route.ts`
- `src/components/interaction/player-input-console.tsx`
- `src/tests/resolve-interaction.test.ts`
- `src/tests/narrate-scene.test.ts`
- `src/tests/narrate-route.test.ts`
- `src/tests/optimize-input.test.ts`
- `src/tests/summarize-deadlock.test.ts`
- `src/tests/override-resolve.test.ts`
- `src/tests/interaction-resolve-route.test.ts`
- `src/tests/interaction-graph.test.ts`
- `src/tests/player-input-console.test.tsx`
- `src/tests/session-store-override.test.ts`

#### Modify
- `src/lib/schemas/session.ts` — remove `ResolvedTurnSchema`, `NarrationTurnSchema`,
  `ManagerOverrideTurnSchema`, `TurnSchema`, `activeOverride`, `turns[]`.
  Keep: `SessionIdSchema`, `SessionStateSchema` skeleton with only
  `id / version / createdAt / updatedAt / characters`. Phase 1 extends it.
- `src/lib/state/server/session-store.ts` — remove `appendResolved`,
  `appendNarration`, `consumeOverride`, `setActiveOverride`,
  `clearActiveOverride`, `worldStateHash`, `buildResolvedTurn`,
  `buildNarrationTurn`, `buildManagerOverrideTurn`. Keep `create`, `get`,
  `size`, `_reset`, `newSessionId`. Phase 1 extends it with graph methods.
- `src/lib/state/server/redis-session-store.ts` — same shape as above.
- `src/app/sesja/[id]/page.tsx` — replace PlayerInputConsole import with
  a stub `<section>Session {id} — prep/play UI lands in Phase 4/5</section>`
  so the app still boots.

#### Redis wipe
- Add one-shot script `scripts/wipe-prod-sessions.ts` that `KEYS pfnexus:session:*`
  + `DEL`s them. Run manually via `npx tsx` once against prod Redis at
  the start of deploy. Delete the script after it's used (one-off, not
  checked into long-term tooling).

### Success Criteria

#### Automated
- [ ] `npm run typecheck` passes with 0 errors after the deletion
- [ ] `npm run test` passes (with the deleted test files removed from
      the harness). The expected test count drops from 247 to ~180.
- [ ] `npm run build` succeeds — Next.js routes under `src/app/api/interaction/`
      no longer resolve, route file tree is consistent.

#### Manual
- [ ] `git diff HEAD~1` shows only deletions + one stub modification, no
      sneaky rewrites of unrelated files.
- [ ] Dev server boots; `/sesja/nowa` still renders the wizard; `/sesja/[id]`
      renders the stub message; no import errors in the browser console.

### Dependencies
- Requires: nothing (this is the foundation)
- Blocks: Phases 1 through 7

---

## Phase 1: Data model — `SessionBrief`, `SessionGraph`, `WorldState`

**Rationale:** Every subsequent phase reads or writes these types. Getting
them right up front prevents cascading refactors. All types are Zod schemas
so they double as runtime validators for generator output and Redis I/O.

**Subagent:** `architect-reviewer` on the schema diff, `backend-developer`
for the schema code.

### Changes

#### File: `src/lib/schemas/session-brief.ts` (create)
- **What:** the input to the generator. This is what the human GM fills in
  at session-creation time (replacing the current wizard's output).
- **Schema (Zod):**
  ```ts
  export const SessionBriefSchema = z.object({
    version: VersionSchema,                    // pf1e | pf2e
    partySize: z.number().int().min(1).max(8),
    partyLevel: z.number().int().min(1).max(20),
    targetDurationHours: z.number().int().min(3).max(10), // 5-10h hardcap (user answer Q9)
    tone: z.string().trim().max(200),          // "dark heist", "epic fantasy", "cosmic horror"
    setting: z.string().trim().max(500),       // 1-paragraph world prompt
    presetId: z.enum(["classic","intrigue","horror","custom"]),
    storyDna: StoryDNASchema,                  // inherited unchanged — sliders + tags
    characterHooks: z.array(z.object({
      characterName: z.string().max(80),
      hook: z.string().max(400),
    })).max(8).default([]),                    // optional; filled at wizard step 3
    // Amendment N — Lines & Veils honor. Every generator stage's
    // system prompt prepends these to forbid certain content. Without
    // this field, the product is legally exposed for content its LLM
    // invents, and ethically exposed for ignoring table safety tools.
    safetyTools: z.object({
      lines: z.array(z.string().max(100)).max(20).default([]),    // hard "do not include" topics
      veils: z.array(z.string().max(100)).max(20).default([]),    // "fade to black" topics
      xCardEnabled: z.boolean().default(true),                     // UI X-card hotkey at play time
    }).default({ lines: [], veils: [], xCardEnabled: true }),
    seed: z.number().int().optional(),         // deterministic gen
  });
  ```
- **Location rationale:** Keeps Story DNA intact (user answer Q3) as the
  *mood* layer; SessionBrief is the *scope* layer on top.

#### File: `src/lib/schemas/session-graph.ts` (create)
- **What:** the authoring format. This is what the LLM emits, the human
  edits, and the Ink renderer consumes.
- **Non-negotiables** (from design primitives 1–10):
  - Every node is a situation; `kind` narrows it.
  - Edges are typed (`choice|auto|fallback|clock-trigger`).
  - Clocks, fronts, and secrets are first-class top-level fields.
- **Schema (Zod, abridged):**
  ```ts
  const NodeKind = z.enum([
    "strong-start",     // the one scripted opening (design primitive 8)
    "scene",            // most nodes; narrative situation with optional player action
    "hub",              // pure choice menu, no content of its own
    "cutscene",         // auto-advances, no player input
    "combat-narrative", // combat resolved via LLM narration + single roll
    "combat-rolled",    // combat via rolled strikes + initiative (NOT full 3-action PF2e — see Amendment R)
    "exploration",      // free-roam; Director pauses cursor until trigger
    "ending",           // terminal node
  ]);

  const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
    z.discriminatedUnion("op", [
      z.object({ op: z.literal("flag-set"), flag: z.string() }),
      z.object({ op: z.literal("flag-unset"), flag: z.string() }),
      z.object({ op: z.literal("clock-filled"), clockId: z.string() }),
      z.object({ op: z.literal("clock-gte"), clockId: z.string(), value: z.number() }),
      z.object({ op: z.literal("var-gte"), path: z.string(), value: z.number() }),
      z.object({ op: z.literal("and"), children: z.array(PredicateSchema) }),
      z.object({ op: z.literal("or"),  children: z.array(PredicateSchema) }),
      z.object({ op: z.literal("not"), child: PredicateSchema }),
    ])
  );

  const EffectSchema = z.discriminatedUnion("op", [
    z.object({ op: z.literal("set-flag"), flag: z.string() }),
    z.object({ op: z.literal("tick-clock"), clockId: z.string(), segments: z.number().int().min(1).max(8) }),
    z.object({ op: z.literal("set-var"), path: z.string(), value: z.union([z.number(),z.string(),z.boolean()]) }),
    z.object({ op: z.literal("reveal-secret"), secretId: z.string() }),
    z.object({ op: z.literal("fire-portent"), frontId: z.string(), portentIndex: z.number().int() }),
    z.object({ op: z.literal("advance-spotlight"), characterName: z.string() }),
  ]);

  const SceneOutcomesSchema = z.object({
    // Per practitioner review (Amendment I): every scene has exit
    // consequences by degree of success, not just by choice-button.
    // Fields are optional because not every node is a roll scene.
    critSuccess: z.string().max(300).optional(),
    success: z.string().max(300).optional(),
    failure: z.string().max(300).optional(),
    critFailure: z.string().max(300).optional(),
  });

  const SessionNodeSchema = z.object({
    id: z.string(),                            // e.g. "act1_dockside_warehouse"
    kind: NodeKind,
    act: z.number().int().min(1).max(3),
    title: z.string().max(120),
    synopsis: z.string().max(400),             // 1-sentence GM brief
    prompt: z.string().max(4000),              // full LLM narration seed
    // Amendment I — capture what the Director can reason about:
    objective: z.string().max(200).optional(), // what the party is after
    obstacles: z.array(z.string().max(200)).max(5).default([]), // what's in the way
    outcomes: SceneOutcomesSchema.optional(),  // exit consequences by degree
    estimatedMinutes: z.number().int().min(1).max(90).default(20), // pacing budget
    contentWarnings: z.array(z.string()).default([]), // lines/veils honor
    // --
    npcsPresent: z.array(z.string()).default([]),
    locationId: z.string().optional(),
    tensionLevel: z.number().min(0).max(10),   // Façade-style drama manager hint
    tags: z.array(z.string()).default([]),
    when: PredicateSchema.optional(),          // entry gate
    onEnterEffects: z.array(EffectSchema).default([]),
    repeatable: z.boolean().default(false),
  });

  const SessionEdgeSchema = z.object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    kind: z.enum(["choice","auto","fallback","clock-trigger"]),
    label: z.string().max(120).optional(),    // displayed on choice edges
    condition: PredicateSchema.optional(),
    onTraverseEffects: z.array(EffectSchema).default([]),
    clockId: z.string().optional(),           // required when kind==clock-trigger
    priority: z.number().int().default(0),
  });

  const ClockSchema = z.object({
    id: z.string(),
    label: z.string().max(120),
    segments: z.union([z.literal(4), z.literal(6), z.literal(8)]),
    filled: z.number().int().min(0).default(0),
    onFillNodeId: z.string().optional(),      // auto-divert when full
    frontId: z.string().optional(),           // cross-link to a Front
    // Amendment J — Director needs polarity to narrate the fill
    // correctly: a "guards arriving" clock fill is a hard move, but an
    // "ally reinforcements" clock fill is an opportunity. Practitioner
    // review caught that every clock-fill was being narrated as
    // threatening in v2.
    polarity: z.enum(["danger", "opportunity", "neutral"]).default("danger"),
    // Distinguishes stall-fills from fail-fills. Director uses the
    // most recent tick source to color narration: "stall" → inevitability,
    // "fail" → consequence, "hard-move" → direct hit, "time-skip" →
    // pacing accelerator.
    tickSources: z.array(
      z.enum(["hard-move", "fail", "time-skip", "scene-enter", "manual"])
    ).default(["hard-move", "fail"]),
    lastTickSource: z.enum(["hard-move","fail","time-skip","scene-enter","manual"]).optional(),
  });

  const FrontSchema = z.object({
    id: z.string(),
    name: z.string().max(120),
    stakes: z.array(z.string()).max(5),       // stakes questions (Dungeon World)
    dangers: z.array(z.object({
      name: z.string().max(120),
      impulse: z.string().max(200),           // "what this danger wants if unopposed"
    })).max(5),
    grimPortents: z.array(z.string()).min(3).max(5), // ordered bad → catastrophic
    impendingDoom: z.string().max(400),
    firedPortents: z.number().int().default(0),
  });

  const SecretSchema = z.object({
    id: z.string(),
    text: z.string().max(400),
    conclusionTag: z.string(),                // which conclusion it points at
    discovered: z.boolean().default(false),
    // Amendment K — delivery vector. Without it, the Director defaults
    // to "NPC blurts it out" every time. Lazy DM classifies secrets by
    // how they surface.
    delivery: z.enum([
      "npc-dialog",         // an NPC says it
      "environmental",      // written on a wall, carved in a door
      "document",           // letter, ledger, scroll
      "overheard",          // party overhears between NPCs
      "pc-backstory",       // triggered by a PC's character sheet tag
      "skill-check",        // revealed on a successful Recall Knowledge
    ]).default("npc-dialog"),
    // Secrets that only make sense after another has been revealed.
    // Validator enforces: the `requires` list only references other
    // secret ids from the same graph.
    requires: z.array(z.string()).default([]),
  });

  // Amendment L — NPC stat blocks had to be rebuilt for PF2e. v2's
  // `{ac, hp, toHit, damageExpr, saves}` was a D&D 3.5 skeleton that
  // would have made combat-tactical read as "not Pathfinder" on round
  // one. The practitioner review called this "a knife to the throat of
  // the PF2e claim". Fixed here.
  //
  // Two tiers: `SimpleStatBlock` for combat-narrative NPCs (flavor +
  // trivial exchanges) and `Pf2eStatBlock` for combat-tactical NPCs
  // (rolled rounds via the adjudicator). The full 3-action economy is
  // still deferred to post-MVP (see Amendment R) — the tactical block
  // carries enough data to roll ONE strike per turn correctly, not
  // three.

  const SimpleStatBlockSchema = z.object({
    tier: z.literal("simple"),
    hp: z.number().int(),                     // hit points only
    threat: z.enum(["trivial","low","moderate","severe"]),
  });

  const Pf2eStrikeSchema = z.object({
    name: z.string().max(60),                 // "longsword", "claw"
    toHit: z.number().int(),                  // vs AC
    damage: z.string(),                        // "1d8+4 slashing"
    traits: z.array(z.string()).default([]),  // "agile", "finesse", "reach 10 ft", "versatile P"
  });

  const Pf2eStatBlockSchema = z.object({
    tier: z.literal("pf2e"),
    level: z.number().int().min(-1).max(25),  // MUST be present — adjudicator cross-checks DCs
    ac: z.number().int(),
    hp: z.number().int(),
    perception: z.number().int(),             // used for initiative
    saves: z.object({
      fort: z.number().int(),
      ref: z.number().int(),
      will: z.number().int(),
    }),
    strikes: z.array(Pf2eStrikeSchema).min(1).max(4),
    resistances: z.array(z.object({
      type: z.string(),                        // "fire", "physical"
      value: z.number().int(),
    })).default([]),
    weaknesses: z.array(z.object({
      type: z.string(),
      value: z.number().int(),
    })).default([]),
    immunities: z.array(z.string()).default([]),
    specialAbilities: z.array(z.string()).max(6).default([]), // "Attack of Opportunity", "Swallow Whole"
    reactions: z.array(z.string()).max(3).default([]),
    spellSlots: z.record(
      z.string(),                              // rank as string: "1","2","3",...
      z.object({
        slots: z.number().int().min(0),
        dc: z.number().int(),
        attack: z.number().int().optional(),
        list: z.array(z.string()).default([]), // spell names
      })
    ).optional(),
  });

  const NpcStatBlockSchema = z.discriminatedUnion("tier", [
    SimpleStatBlockSchema,
    Pf2eStatBlockSchema,
  ]);

  const NpcSchema = z.object({
    id: z.string(),
    name: z.string().max(120),
    role: z.string().max(120),                // "innkeeper", "antagonist", "ally"
    goal: z.string().max(200),
    voice: z.string().max(200),               // 1-sentence vocal tick
    disposition: z.number().int().min(-3).max(3).default(0),
    statBlock: NpcStatBlockSchema.optional(), // present only for combat NPCs
  });

  const LocationSchema = z.object({
    id: z.string(),
    name: z.string().max(120),
    aspects: z.array(z.string()).min(2).max(5), // 3 evocative aspects per Lazy DM
    mapRef: z.string().optional(),
  });

  // Amendment M — the practitioner review caught that v2 endings
  // reduced to "good / bad / middle" because they had no category
  // tag and no per-front resolution. Real GM endings read as
  // "Front A escalated to step 4, Front B was neutralized at step 2,
  // Front C was co-opted". This schema captures that.
  //
  // The validator MUST enforce: at least one ending with
  // `category === "defeat" || category === "tpk"` exists — or the
  // session is un-losable and the dice have no teeth.
  const EndingSchema = z.object({
    id: z.string(),
    nodeId: z.string(),                       // link to the "ending" kind node
    condition: PredicateSchema,               // clock-filled / flag-set predicates that unlock this ending
    title: z.string().max(120),
    summary: z.string().max(400),
    category: z.enum([
      "victory",    // party achieves primary objective cleanly
      "mixed",      // party succeeds but pays a cost
      "pyrrhic",    // party technically succeeds but at great loss
      "defeat",     // party fails the primary objective
      "tpk",        // all PCs reduced to 0 HP
      "runaway",    // party flees the session
    ]),
    frontOutcomes: z.record(
      z.string(),                              // frontId
      z.enum(["neutralized","delayed","escalated","triumphed"])
    ).default({}),
  });

  export const SessionGraphSchema = z.object({
    id: z.string(),
    version: VersionSchema,
    brief: SessionBriefSchema,
    startNodeId: z.string(),                  // always points at a strong-start node
    nodes: z.array(SessionNodeSchema).min(8).max(40),
    edges: z.array(SessionEdgeSchema),
    clocks: z.array(ClockSchema).min(2).max(8),
    fronts: z.array(FrontSchema).min(1).max(4),
    secrets: z.array(SecretSchema).min(6).max(20),
    npcs: z.array(NpcSchema).min(3).max(12),
    locations: z.array(LocationSchema).min(2).max(10),
    endings: z.array(EndingSchema).min(2).max(5),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    validatedAt: z.string().datetime().optional(),
  });
  ```
- **Size rationale (Q9 scaled up to 5–10h sessions):** 8–40 nodes, 2–8
  clocks, 1–4 fronts, 6–20 secrets. Floor is "5h heist", ceiling is
  "10h chapter-sized arc". Enforced by `.min()/.max()`.

#### File: `src/lib/schemas/session.ts` (modify)
- **What:** replace the gutted `SessionStateSchema` from Phase 0 with a
  runtime wrapper around the graph.
- **Schema:**
  ```ts
  export const SessionStateSchema = z.object({
    id: SessionIdSchema,
    version: VersionSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    phase: z.enum(["brief","generating","authoring","approved","playing","ended"]),
    brief: SessionBriefSchema.optional(),     // set after wizard
    graph: SessionGraphSchema.optional(),     // set after generation
    inkCompiled: z.string().optional(),       // inkjs compiled JSON (set after approval)
    inkState: z.string().optional(),          // Story.state.ToJson() — mutates during play
    worldState: z.object({
      cursorNodeId: z.string().optional(),
      clocks: z.record(z.string(), z.number().int()), // clockId → filled count
      flags: z.array(z.string()).default([]),
      vars: z.record(z.string(), z.any()).default({}),
      spotlightDebt: z.record(z.string(), z.number()).default({}), // characterName → turns-since-last
      turnCount: z.number().int().default(0),
      lastDirectorMove: z.enum(["hard","soft","question","cutscene","none"]).default("none"),
    }).default({
      clocks: {}, flags: [], vars: {}, spotlightDebt: {}, turnCount: 0, lastDirectorMove: "none",
    }),
    characters: z.array(CharacterSheetParsedSchema).max(MAX_CHARACTERS_PER_SESSION).default([]),
  });
  ```
- **Key decisions:**
  - `phase` lifecycle enforces the "brief → generate → author → approve → play" pipeline.
  - `inkCompiled` is cached on the session so we compile once at approval,
    not on every tick.
  - `worldState` is the mutable play-time state; everything else is frozen
    after `approved`.
  - `spotlightDebt` is tracked per character so the Director can rotate
    players (design primitive 7).

#### File: `src/lib/state/server/session-store.ts` (modify) — Amendment A
- **What:** this file becomes **interface + helper functions only**.
  The `InMemorySessionStore` class moves to its own file (see below).
  The current 304-line god-file is split into:
  - `session-store.ts` — `SessionStore` interface, `newSessionId`,
    `hashState`, `nowIso`, type re-exports. ~80 lines.
  - `in-memory-session-store.ts` — `InMemorySessionStore` class only.
    ~220 lines (will grow with graph-lifecycle methods).
- **Trade-off (Iron Law):** *Pro:* each file has one responsibility
  (interface vs impl); easier to swap in a mock store for tests;
  consistent with how `redis-session-store.ts` already sits in its own
  file. *Con:* one extra file + import hop for existing callers. Net
  positive — file was already at the 500-line soft cap with only the
  reactive turn model; the graph model would push it past 500.
- **New methods on `SessionStore` interface:**
  ```ts
  setBrief(id: string, brief: SessionBrief): Promise<SessionState|undefined>;
  setGraph(id: string, graph: SessionGraph): Promise<SessionState|undefined>;
  updateGraph(id: string, patch: Partial<SessionGraph>): Promise<SessionState|undefined>;
  approve(id: string, inkCompiled: string): Promise<SessionState|undefined>;
  tick(id: string, inkState: string, worldState: WorldState): Promise<SessionState|undefined>;
  ```
- **Deleted methods:** (from Phase 0) — do not re-add.

#### File: `src/lib/state/server/in-memory-session-store.ts` (create) — Amendment A
- **What:** new home for the `InMemorySessionStore` class. Implements
  the full new interface. `getSessionStore()` in `store-factory.ts`
  imports from here instead of from `session-store.ts`.

#### File: `src/lib/state/server/redis-session-store.ts` (modify)
- **What:** mirror the new interface. Graph + ink state are large blobs;
  store them as a single JSON value per session (same key pattern
  `pfnexus:session:${id}`). No separate keys for graph vs state — one
  round-trip per read/write.
- **TTL:** 7 days (up from 1 day). Prepped sessions may sit unplayed for
  multiple days; a 1-day TTL would be hostile to the "human GM preps on
  Sunday, plays on Friday" use case.

### Success Criteria

#### Automated
- [ ] `npm run typecheck` passes
- [ ] `npm run test` — new unit tests for SessionGraphSchema round-trip
      (parse a canonical fixture, re-stringify, deep-equal)
- [ ] Zod schema rejects a graph with <8 nodes (min bound)
- [ ] Zod schema rejects a graph where an edge's `from`/`to` references
      a non-existent node (custom `.refine()` validator)
- [ ] Zod schema rejects a graph where a `clock-trigger` edge has no `clockId`
- [ ] Zod schema rejects a graph with zero `ending` nodes
- [ ] InMemorySessionStore implements all new methods with test coverage

#### Manual
- [ ] Schema review: an experienced GM (user) scans SessionGraphSchema
      for missing fields vs. Lazy DM template / Dungeon World Fronts
- [ ] Redis store write size estimated <200KB per session (fits in
      Scaleway RED1-MICRO comfortably)

### Dependencies
- Requires: Phase 0
- Blocks: Phases 2, 3, 4

---

## Phase 2: Generator pipeline (LLM → SessionGraph)

**Rationale:** This is where the "AI GM preps like a human GM" claim is
either real or vapor. Must be multi-stage: one LLM call cannot emit a
coherent 40-node graph with cross-referential clocks + secrets. Research
(Lazy DM eight-step checklist) gives us a natural stage decomposition.

**Subagent:** `prompt-engineer` + `ai-engineer` for the prompt chain,
`llm-architect` for stage decomposition, `claude-api` skill for structured
output patterns.

### Sub-phase 2A: Prompt templates

#### File: `src/lib/prompts/session-generator/index.ts` (create)
- **What:** exports a `buildGeneratorChain(brief: SessionBrief)` that
  returns typed stage prompts. Mirror the existing
  `src/lib/prompts/zone-generator.ts` structure that `generateZone`
  already uses — new code follows proven patterns from the repo.

#### Stages (each its own file)
- `stage-a-skeleton.ts` — input: SessionBrief. Output: JSON with
  `{ acts: [{title, stakes}], fronts: [{name, dangers, grimPortents, impendingDoom}], primaryConflict }`.
  Polish output (user answer — Polish-primary). Temperature 0.9 for
  creative divergence.
- `stage-b-scenes.ts` — input: skeleton. Output: per-act scene list with
  `{id, title, synopsis, kind, act, tensionLevel, npcsPresent, locationRef, secretsRef}`.
  Scene count scales with `brief.targetDurationHours`: 3 scenes/hour as
  a rough heuristic → 15–30 scenes total. Temperature 0.7.
- `stage-c-worldkit.ts` — input: skeleton + scenes. Output: NPCs,
  locations, secrets, clocks (with names and segment counts; empty
  `filled` state). LLM is explicitly told "you are assembling the
  GM's prop box, not writing prose". Temperature 0.5. This stage is
  where the Three-Clue Rule is enforced in the prompt:
  `"each conclusion must be reachable from at least 3 distinct secrets"`.
- `stage-d-wiring.ts` — input: all prior stages. Output: edges + predicates
  + effects + clock bindings + endings. This stage emits the *control
  flow*, not the content. Temperature 0.3 (mostly deterministic).
- `stage-e-prose.ts` — input: wired graph. Output: per-node `prompt:` seed
  text (used by the Director at play time as narration input). One
  call that runs in parallel for all nodes. Temperature 0.8.
- `stage-f-statblocks.ts` — input: graph + NPC list. For every NPC
  tagged as combat, emit a PF2e stat block using the full
  `Pf2eStatBlockSchema` from Amendment L (level, AC, HP, perception,
  saves, strikes with traits, resistances, weaknesses, special
  abilities, reactions, spell slots if caster). Temperature 0.2
  (mechanical). **Followed by a deterministic post-generation
  validator (Amendment Q):**
  - `src/lib/orchestration/director/pf2e-statblock-validator.ts`
    (create) runs every generated stat block against PF2e *Gamemastery
    Guide* Table 2-5 "Building Creatures" ranges for the creature's
    level: AC ± 2, HP ± 15%, moderate-strike to-hit ± 2, moderate-damage
    ± 3. Out-of-range values are clamped to the legal range and
    flagged as warnings. A level-3 NPC cannot ship with AC 24 or HP 90
    — the validator catches it before the graph lands in authoring.
  - The validator has a hand-coded Table 2-5 data file
    (`pf2e-creature-build-table.json`) covering levels -1 through 20.
    This table is public OGL content and a one-time ingestion; it
    does not change with releases.
  - Validation warnings surface in the authoring UI's node inspector
    next to affected NPCs so the human reviewer can either accept
    the clamp or regenerate the stat block.

#### Polish-first enforcement
- `POLISH_OUTPUT_CLAUSE` from `src/lib/prompts/system/gm-core.ts:?` is
  appended to stages A–E. Stage F (stat blocks) is English-mechanical
  (numbers + dice expressions).

#### Prompt regression testing — promptfoo + vitest-evals (Amendment V)

**Trade-off (Iron Law):** *Pro:* catches prompt drift at PR time
instead of at user-facing play time; prompt quality is the product
so regression gates pay for themselves after one caught bug.
*Con:* adds two dev dependencies + one GitHub Action + ~15 min per
PR when eval runs on prompt file changes. Net positive.

- **`promptfoo` (PR-level gate):** declarative YAML evals per generator
  stage. Every stage's prompt has a `promptfoo.<stage>.yaml` config
  with input fixtures + `llm-rubric` Polish-language judge prompt
  checking for on-target scene content, Three-Clue Rule compliance,
  and PF2e math legality. Wired into
  `.github/workflows/prompt-eval.yml` via `promptfoo/promptfoo-action@v2`
  — posts a before/after eval diff comment on PRs that touch
  `src/lib/prompts/session-generator/**`.
- **`vitest-evals` (inline evals):** for pipeline-level assertions
  inside the existing vitest suite — `describeEval('stage-b produces ≥8 scenes', {...})`
  runs alongside unit tests. Uses `autoevals` scorers for structural
  checks (JSON validity, schema shape) and delegates subjective
  quality to a judge LLM via `Factuality` scorer.
- **Polish rubric:** both tools receive their `llm-rubric` judge prompt
  in Polish, so quality signal reflects output-language fluency, not
  just structure.
- **Cost gate:** promptfoo runs only when files in
  `src/lib/prompts/session-generator/**` change. Full suite runs on
  `main` merges, not every PR push.

Install:
```bash
npm install --save-dev promptfoo vitest-evals autoevals
npx promptfoo init   # scaffolds promptfooconfig.yaml + first fixture
```

### Sub-phase 2B: Orchestrator

#### File: `src/lib/orchestration/generate-session.ts` (create)
- **What:** single async function that runs the six-stage chain, validates
  each stage output with its stage-specific Zod schema (parse + surface
  errors), and assembles the final `SessionGraph`.
- **Shape:**
  ```ts
  export interface GenerateSessionDeps {
    callLLM: CallLLM;
    logger?: (stage: string, info: unknown) => void;
  }

  export type GenerateSessionResult =
    | { ok: true; graph: SessionGraph; warnings: string[] }
    | { ok: false; stage: "A"|"B"|"C"|"D"|"E"|"F"|"validate"; error: string; partial?: unknown };

  export async function generateSession(
    brief: SessionBrief,
    deps: GenerateSessionDeps
  ): Promise<GenerateSessionResult>
  ```
- **Retry policy:** each stage gets one retry on parse failure, feeding
  the bad output back as an assistant turn + a targeted "fix the JSON"
  instruction — same pattern as `generate-zone.ts` stage B retry
  (ref `src/lib/orchestration/generate-zone.ts:104-139`).
- **Validation pass:** after stage F, assemble the full `SessionGraph`
  and run `SessionGraphSchema.parse(...)`. This catches:
  - edges pointing at non-existent nodes
  - clocks with no ticker edges
  - secrets without a conclusionTag
  - orphan nodes (no incoming edges except startNode)
  - cycle detection (beyond clock-trigger loops, which are legal)
- **Validation repair:** if the final parse fails, run one "validator
  repair" LLM call with the error payload + the partial graph, asking
  for a minimal fix. One shot, no recursion.

### Sub-phase 2C: Generator route

#### File: `src/app/api/sessions/[id]/generate/route.ts` (create)
- **POST**: triggers generation for a session that is in `phase=brief`.
  - Reads the brief, calls `generateSession`, writes the result via
    `store.setGraph(id, graph)`, transitions `phase → authoring`.
  - **Streaming?** No, not MVP. The six-stage chain takes 30-90 seconds;
    return a 202 Accepted with a polling URL, or just block the request.
    Me pick **block the request with a 3-minute timeout**; the UI shows
    a spinner. Streaming is a later UX polish, not an MVP blocker.
  - Rate limit: 10 generations per IP per hour (protection against
    LLM cost blowup).

### Success Criteria

#### Automated
- [ ] Unit tests for each stage: mocked LLM returning canonical output,
      stage parser validates it
- [ ] Unit test for the full pipeline with a deterministic mock that
      returns pre-canned stage outputs → `generateSession` produces
      a valid `SessionGraph` that passes `SessionGraphSchema.parse`
- [ ] Unit test for the validation-repair path (mock emits a bad edge
      in stage D, repair is called once, final parse passes)
- [ ] Integration test (`src/tests/integration/generate-session.integration.test.ts`):
      real Scaleway LLM + a real brief → produces a graph that
      `SessionGraphSchema.parse` accepts. Budget: one integration run
      per PR, not per commit.

#### Manual
- [ ] Running `npm run dev` + completing the wizard produces a real
      session graph and shows it in the Phase 4 authoring UI
- [ ] Generated graphs visually pass the Three-Clue Rule (≥3 secrets
      per conclusion)
- [ ] Generated graphs have at least one clock whose `onFillNodeId`
      points at a Grim Portent scene
- [ ] Polish output in stages A-E (no English bleed)

### Dependencies
- Requires: Phase 1
- Blocks: Phases 3, 4

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Six-stage chain exceeds 3-minute route timeout | Med | High | Stream or split into 2+2+2 sub-chains with intermediate persistence; fallback = lower max-node count |
| Stage D wiring is the hardest stage — LLM struggles to emit graph-correct edges | High | High | Post-validate with graph checker; single repair retry; fallback = human fixes in authoring UI |
| Polish + JSON-structured-output quality drop on llama-3.1-70b-instruct | Med | Med | Integration tests at MVP will reveal this; fallback = bilingual prompts (English structure fields, Polish narrative fields) |
| LLM cost per generation | Low | Med | 6 calls × ~4k tokens avg × Scaleway rates ≈ well under $0.10/session at current pricing |
| Schema drift between LLM output and Zod schema | High | Med | Ship a deterministic JSON schema in the prompt (OpenAPI-style) + use `response_format: json_object` + Zod parse is authoritative |

---

## Phase 3: SessionGraph → Ink renderer → inkjs runtime wrapper

**Rationale:** The runtime executes, it does not interpret. Ink handles
flow control, variables, external functions. We only need to render our
authored graph into Ink source and bind a handful of external functions
for PF2e mechanics.

**Subagent:** `ai-engineer` for the renderer, `backend-developer` for the
runtime wrapper, `context7` library docs for inkjs API specifics.

### Sub-phase 3A: inkjs dependency — Amendment C (no wrapper)

#### File: `package.json`
- **What:** add `"inkjs": "^2.3.2"` (latest as of 2026-04). Pin exact
  minor version given narrative-engine APIs are historically unstable.
- **LangGraph:** reuse the existing `@langchain/langgraph` pin from
  the current `package.json` (added by the superseded 2026-04-10 plan).
  Do not bump versions without a documented reason — Amendment G.

#### File: `src/lib/orchestration/director/ink.ts` (create) — Amendment C
- **What:** flat module exporting named helper functions that wrap
  direct calls into inkjs. **No `InkRuntime` interface, no factory,
  no abstraction layer.** The Director imports these functions and
  calls them on `inkjs.Story` instances directly.
- **Trade-off (Iron Law):** *Pro:* zero indirection, the single
  planned runtime (inkjs) shows through the types directly, saves
  ~100 LOC of wrapper + wrapper tests. *Con:* if we ever replace
  inkjs, there will be ~20 call sites to touch across the director
  graph nodes. That cost is paid once, in exchange for never paying
  for an unused abstraction. Extraction is trivial if the second
  runtime ever appears.
- **Public surface (flat functions):**
  ```ts
  export function compileGraph(graph: SessionGraph): {
    compiledJson: string;
    warnings: string[];
  };

  export function createStory(compiledJson: string): inkjs.Story;

  export function continueMaximally(story: inkjs.Story): {
    narration: string;
    choices: { index: number; label: string }[];
    ended: boolean;
  };

  export function choose(story: inkjs.Story, choiceIndex: number): void;

  export function saveState(story: inkjs.Story): string;  // Story.state.ToJson()
  export function loadState(story: inkjs.Story, json: string): void;

  export function bindExternalFunction(
    story: inkjs.Story,
    name: string,
    fn: (...args: unknown[]) => unknown
  ): void;

  export function currentKnot(story: inkjs.Story): string | undefined;
  export function getVariable(story: inkjs.Story, name: string): unknown;
  export function setVariable(story: inkjs.Story, name: string, value: unknown): void;
  ```
- **Implementation:** each helper is a direct passthrough to the
  corresponding `inkjs.Story` method, with narrowed return types where
  inkjs's loose typings would otherwise leak `any` into the director.
  The renderer (below) produces the `.ink` source; `compileGraph` runs
  `inkjs.Compiler.compile()`.

### Sub-phase 3B: SessionGraph → Ink source renderer

#### File: `src/lib/orchestration/director/render-ink.ts` (create)
- **What:** pure function `SessionGraph → string` (the `.ink` source text).
- **Mapping rules:**
  - Each `SessionNode` becomes an Ink `knot` named by `node.id`:
    `=== knot_<id> ===`
  - `node.prompt` becomes the knot body text
  - `node.onEnterEffects` → `~ flag_<name> = true` / `~ tick_clock("<id>", N)` lines
  - Outgoing edges of kind `choice` → Ink `*` choices: `* [<label>] -> knot_<to>`
  - Outgoing edges of kind `auto` → Ink `-> knot_<to>` at the end of the knot
  - Outgoing edges of kind `fallback` → Ink fallback choice `* -> knot_<to>` with no label
  - Outgoing edges of kind `clock-trigger` do NOT render as Ink edges —
    they are handled in the Director tick loop (Phase 3C) by checking
    clock state between `continueMaximally()` calls
  - Predicates on edges become Ink conditional choices: `{ cond: ... } * [...]`
  - Variables: global Ink variables for every flag + clock: `VAR flag_x = false`, `VAR clock_x = 0`
  - `SessionGraph.startNodeId` → `-> knot_<startNodeId>` at the top
- **External function stubs:** emit `EXTERNAL roll_skill(skill, dc)`,
  `EXTERNAL roll_attack(npcId, targetAc)`, `EXTERNAL pick_character()`,
  `EXTERNAL spotlight_owed(name)` — actual implementations bind at runtime.

**Note on `compileGraph`:** the compile step lives in `ink.ts` above
(not a separate file per Amendment C). It is a pure step and we cache
`compiledJson` on `SessionState.inkCompiled` at approval time (Phase 4).
The Director never re-compiles during play.

### Sub-phase 3C: Director LangGraph loop

#### File: `package.json`
- **What:** add `"@langchain/langgraph": "^0.2.36"` (confirm latest at
  impl time via context7 MCP, per CLAUDE.md rule on Context7 for library
  docs).

#### File: `src/lib/orchestration/director/graph/state.ts` (create)
- **What:** LangGraph state annotation for the Director.
- **State:**
  ```ts
  const DirectorState = Annotation.Root({
    sessionId: Annotation<string>,
    input: Annotation<DirectorInput>,          // from player, or "continue"
    story: Annotation<inkjs.Story>,            // ephemeral, not serialized — Amendment C
    worldState: Annotation<WorldState>,
    output: Annotation<DirectorOutput>,
  });
  ```

#### File: `src/lib/orchestration/director/graph/nodes.ts` (create)
- **Nodes of the Director graph (each a TypeScript function):**
  1. `loadSessionNode` — fetch SessionState, `createStory(inkCompiled)`
     from `ink.ts`, `loadState(story, inkState)`, bind external functions
  2. `applyInputNode` — if `input.type==="choice"` call `ink.choose(idx)`;
     if `"cutscene-advance"` it's a no-op (ink will auto-advance);
     if `"skip-clock-tick"` manually ticks a clock (admin override)
  3. `tickClocksNode` — evaluate whether any clock is full, fire its
     `onFillNodeId` by calling `ink.divert(knot_<id>)`
  4. `evaluateTriggersNode` — evaluate `clock-trigger` edges against
     current clock state; divert if any are satisfied
  5. `continueNode` — call `ink.continueMaximally()`, collect narration
     + choices + ended flag
  6. `pickMoveNode` — inspect world state + spotlight debt + clock
     urgency → classify the resulting output as `hard|soft|question|cutscene`
     move. Update `worldState.lastDirectorMove`.
  7. `persistNode` — serialize `ink.saveState()` + `worldState` to
     Redis via `store.tick(id, inkState, worldState)`

- **Edge topology:**
  ```
  START → loadSessionNode → applyInputNode → tickClocksNode
        → evaluateTriggersNode → continueNode → pickMoveNode → persistNode → END
  ```

#### File: `src/lib/orchestration/director/director.ts` (create)
- **What:** the public entry point.
- **Interface:**
  ```ts
  export interface DirectorInput {
    type: "start" | "continue" | "choice" | "player-input" | "skip";
    choiceIndex?: number;
    playerInput?: string;        // when type==="player-input" (Model B free-text path)
    characterName?: string;      // which PC is acting
  }

  export interface DirectorOutput {
    narration: string | null;
    choices: { index: number; label: string }[];
    phase: "narrating" | "awaiting-choice" | "awaiting-roll" | "ended";
    pendingRoll?: { skillOrAttack: string; dc: number; characterName: string };
    lastMove: "hard" | "soft" | "question" | "cutscene" | "none";
    worldState: WorldState;
    ended: boolean;
  }

  export async function director(
    input: DirectorInput,
    deps: { callLLM: CallLLM; store: SessionStore; sessionId: string }
  ): Promise<DirectorOutput>
  ```
- **Implementation:** `director` invokes the compiled LangGraph.

**Move classifier — scored decision function (Amendments D + O)**

**Amendment O (post-practitioner-review rewrite):** v2's classifier
was a 4-rule cascade. The practitioner review called it "a traffic
light, not a GM" — it ignored spotlight debt, ignored recent-move
history, treated stall-fills and fail-fills identically, and crashed
on deadlock rather than improvising. v3 replaces the cascade with a
**scored decision function** that takes multiple signals and returns
the highest-weight move, with a **cooldown penalty** on whatever fired
last tick. Still inlined in `director.ts` per Amendment D; still a
pure function.

```ts
// in src/lib/orchestration/director/director.ts
export type Move =
  | "cutscene"       // auto-narrate, no player input
  | "soft"           // telegraph danger
  | "hard"           // consequence lands
  | "question"       // ask a specific player "what do you do?"
  | "spotlight-rotate" // force focus onto a neglected PC
  | "introduce-npc"  // bring in a new face to unblock
  | "breather"       // downtime moment, release tension
  | "forced-soft";   // deadlock-recovery soft move, ignores cooldown

export interface ClassifyInput {
  worldState: WorldState;
  pendingChoices: { index: number; label: string }[];
  narrationProduced: boolean;
  anyClockFull: boolean;
  anyPortentFired: boolean;
  maxClockUrgency: number;           // 0..1
  stallTicks: number;                // ticks since last worldState delta
  spotlightOwedTo: string | null;    // character name with max debt, or null
  pacingPressure: number;            // 0..1, elapsedMinutes / targetMinutes
  actPosition: "setup"|"confrontation"|"resolution";
}

export function classifyMove(input: ClassifyInput): Move {
  const last = input.worldState.lastDirectorMove;
  const cooldown = (m: Move) => (m === last ? -2 : 0);

  // Score each candidate move. Highest wins; ties resolved by the
  // order below (cutscene last = safe default).
  const scores: Array<[Move, number]> = [];

  // Deadlock recovery trumps everything — no cooldown.
  if (input.stallTicks >= 3) {
    return "forced-soft";
  }

  // Clock-fills split by tick source: stall-fill = inevitability,
  // fail-fill = consequence, hard-move = hit.
  if (input.anyClockFull || input.anyPortentFired) {
    scores.push(["hard", 10 + cooldown("hard")]);
  }

  // Spotlight rotation has own signal, distinct from pendingChoices.
  if (input.spotlightOwedTo && input.pendingChoices.length === 0) {
    scores.push(["spotlight-rotate", 7 + cooldown("spotlight-rotate")]);
  }

  // Pending choices → ask a question to the focused player.
  if (input.pendingChoices.length > 0) {
    scores.push(["question", 6 + cooldown("question")]);
  }

  // High clock urgency → soft move telegraphs.
  if (input.maxClockUrgency >= 0.75) {
    scores.push(["soft", 5 + cooldown("soft")]);
  }

  // Pacing pressure: past 70% of session wall-clock, not in final act,
  // accelerate via soft move.
  if (input.pacingPressure >= 0.7 && input.actPosition !== "resolution") {
    scores.push(["soft", 4 + cooldown("soft")]);
  }

  // Two hard moves in a row → breather.
  if (last === "hard" && input.worldState.turnCount > 0) {
    scores.push(["breather", 3]);
  }

  // Default: advance narration.
  scores.push(["cutscene", 1 + cooldown("cutscene")]);

  scores.sort((a, b) => b[1] - a[1]);
  return scores[0][0];
}
```

**Behavioral rules the Director graph enforces** (implemented in
`director.ts` graph nodes, not in `classifyMove` itself):

1. **`forced-soft` move.** When `stallTicks >= 3`, the Director
   generates a soft move that narrates an interruption (a passing
   watch patrol, a tremor, a stranger calling out) and resets
   `stallTicks=0`. It does NOT advance the ink cursor; it injects a
   narration chunk and asks a question. This is the graceful deadlock
   recovery. Never returns a crash page.
2. **`spotlight-rotate` move.** When a player's `spotlightDebt` exceeds
   3 turns, the Director emits a direct "what are you doing right
   now, <name>?" prompt aimed at that character. This uses the
   PendingRoll modal's `characterName` field without requiring a
   dice roll.
3. **`introduce-npc` move.** When `stallTicks >= 2` AND
   `forced-soft` is on cooldown, the Director can mint an ephemeral
   NPC via a one-call LLM stub (no stat block, no persistence
   guarantee) and add it to `worldState.vars.ephemeralNpcs`. The
   authoring UI flags these on next session for promotion.
4. **Tick-source coloring.** Every `tick-clock` effect records
   `Clock.lastTickSource`. The Director's narration prompt for the
   subsequent move receives the tick source as context so the LLM
   can color the phrasing ("the clock ticks again as you stand
   there silently" vs "your failed lockpick echoes down the hall").
5. **Pacing acceleration.** When `pacingPressure >= 0.7` and the
   current act is not `resolution`, the Director may advance one
   clock by one segment per tick as a forced time-skip. The UI
   shows "Time has passed: ..." above the narration chunk.
6. **Cooldown window.** The same move cannot fire on two consecutive
   ticks except `cutscene` and `forced-soft`. Enforced by the
   `cooldown()` penalty above.

**New WorldState fields required for this (add to `SessionStateSchema`
in Phase 1):**
```ts
worldState: {
  // ... existing fields ...
  stallTicks: z.number().int().default(0),          // ticks since last delta
  elapsedMinutes: z.number().int().default(0),       // wall-clock estimate (20 min/tick default)
  ephemeralNpcs: z.array(z.object({
    id: z.string(),
    name: z.string(),
    role: z.string(),
    bornAtTick: z.number().int(),
  })).default([]),
}
```

**Pacing assumption:** each tick ≈ 20 minutes of play. A 5-hour
session budgets 15 ticks; 10-hour budgets 30. The Director's pacing
pressure is derived from `elapsedMinutes / (targetDurationHours * 60)`.
Tick duration is a single-file tunable constant; calibrate after
first playtest.

#### File: `src/lib/orchestration/director/player-input-bridge.ts` (create)
- **What:** Model B support (Q6 hybrid). When the player types free text
  instead of picking a listed choice, we need to:
  1. Call `optimize-player-input.ts` (resurrected from Phase 0's deleted
     optimize-input.ts — same prompt, same schema) to convert prose to
     `PlayerIntent`
  2. Match the intent against the available `choice` edges — if it's
     close enough to one (semantic similarity via embeddings), take that
     choice
  3. Otherwise, call `adjudicate` directly (PF2e dice engine) and emit
     the result as a narrative interjection before continuing the ink
     flow
- **This is the "Model A+B hybrid" the user asked for.** The pre-authored
  choices are always available; free text is a bailout for when none
  of them fit.
- **Note to implementer:** yes, this is the thing we deleted in Phase 0
  being half-resurrected. That's intentional — the CONTEXT is different
  (it's now a fallback inside a pre-authored graph, not the whole game).

### Success Criteria

#### Automated
- [ ] Unit test: `renderInk(fixtureGraph)` produces `.ink` source that
      `inkjs.Compiler.compile()` accepts without errors
- [ ] Unit test: compiled story advances through a 5-node cutscene path
      without hitting a choice
- [ ] Unit test: compiled story hits a choice point and `ink.choose(0)`
      selects the first option
- [ ] Unit test: `tickClocksNode` advances a 4-segment clock from 3→4
      and diverts to `onFillNodeId`
- [ ] Unit test: `classifyMove` returns each move type for its input
      conditions
- [ ] Unit test: `player-input-bridge` routes a prose "I try to sneak
      past" to the matching "Sneak" choice edge
- [ ] Integration test: full Director round-trip from a generated graph
      → compile → play 10 ticks → state serialized to Redis → reloaded
      → play continues

#### Manual
- [ ] Director spit-output is coherent Polish (stages A-E prompts, runtime
      narration from node.prompt)
- [ ] Clocks visibly tick during integration test playthrough
- [ ] `lastDirectorMove` transitions across `cutscene|soft|question|hard`
      during a playthrough (logged in tick diagnostic)

### Dependencies
- Requires: Phases 1, 2
- Blocks: Phases 4 (authoring UI needs compile for preview), 5 (play UI)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| inkjs compile bundle too large for Next.js standalone | Low | Med | inkjs is ~250KB; measure at impl time; lazy-load if it blows budget |
| Graph → Ink renderer misses edge cases (conditional choices, nested fallbacks) | High | Med | Start with a restricted subset; grow as tests fail; refuse-and-warn on unsupported patterns |
| External function bindings break on Ink state reload | Med | Med | Rebind on every load (the wrapper handles this); integration test covers round-trip |
| Move classifier misclassifies, producing "ask question" when it should "hard move" | Med | Med | Pure function + unit test matrix; adjust thresholds empirically |
| Player-input-bridge free-text matching to choices is fuzzy | High | Low | Free text is a fallback; if no match, always fall through to `adjudicate` — worst case is a narrative interjection, not a crash |

---

## Phase 3.5: GM-practitioner edge cases (Amendment P)

**Rationale:** The v2 plan silently assumed the happy path. The
practitioner review enumerated six edge cases that a real table hits
inside the first session and that v2 had no answer for. Each is
addressed here with a concrete design — not deferred. These land in
the same phases as the code they touch; §3.5 is a cross-cut overview,
not a separate implementation phase.

### 3.5.1 Party split

**Problem:** PCs go different directions. `worldState.cursorNodeId` is
singular; the Director cannot represent "Alice at the docks, Bob at
the inn" simultaneously.

**MVP stance:** **explicitly unsupported for autonomous play.** Party
split is a post-MVP feature (requires `cursors: Record<PartyId,NodeId>`
+ round-robin director + UI switcher). For MVP, the play UI surfaces
a **"Party Split" banner** the moment the LLM narration detects party
divergence (free-text input keywords + choice edges that imply splits
are flagged at generation time). The banner says: *"This session is
designed for parties that stay together. Please agree on one course
of action before continuing."* Block `/api/director` calls until the
banner is dismissed.

**Where:** `src/components/play/party-split-banner.tsx` (new),
Director checks `worldState.flags` for `party-split` tag on every
tick, the flag is set by `player-input-bridge` when free text
includes splitting intent.

### 3.5.2 Player-introduced NPCs

**Problem:** "I ask the bartender for directions" when no bartender
is in `graph.npcs`. v2's `player-input-bridge` would fuzzy-match to
a different choice or fall through to `adjudicate`, never creating
the bartender.

**Fix:** When `player-input-bridge` detects a `[PERSON]` named entity
that does not resolve to any `graph.npcs[].name`, it calls a single
LLM stub (one sentence system prompt: "invent a name, role, and
voice for this NPC") and appends the result to
`worldState.vars.ephemeralNpcs`. The Director's next narration chunk
uses the minted NPC. They have no stat block, no persistence
guarantee, and the authoring UI flags them for promotion after the
session ends.

**Where:** `player-input-bridge.ts` gains an `ephemeralNpcMinter`
branch; `WorldState` schema gains `ephemeralNpcs[]` (already added in
Amendment O).

### 3.5.3 TPK (total party kill)

**Problem:** v2's `shouldEndSession` only checked Front portent state
and ending predicates. It never checked PC HP. Combat-tactical could
run every PC to 0 HP and the Director would keep diverting.

**Fix:** `shouldEndSession` gains a PC-HP check at the top of its
evaluation chain:
```ts
if (session.characters.every(c => (worldState.vars[`pc_${c.name}_hp`] ?? c.maxHp) <= 0)) {
  // Select the highest-priority ending with category in {tpk, defeat}
  return pickEndingByCategory(graph, ["tpk", "defeat"]);
}
```
Requires the validator to enforce "at least one ending with
`category: 'tpk' | 'defeat'` exists" — per Amendment M, this is
already a hard rule. If no TPK ending is authored, the generator
must synthesize one before the graph passes validation.

**Where:** `src/lib/orchestration/director/endings.ts` — add
`pickEndingByCategory(graph, allowed[])` helper. Validator in
Phase 2 rejects graphs without a defeat/tpk ending.

### 3.5.4 Player derailment ("we burn down the tavern")

**Problem:** Free text that has no matching choice edge AND no close
fuzzy match. v2 would call `adjudicate` once for narrative flavor and
return to the same cursor — the narrative would keep pretending the
tavern exists.

**Fix:** `player-input-bridge` classifies free text into a *scale of
disruption* via a tiny LLM prompt: `small | medium | large`.
- `small` → narrative flavor, no state change
- `medium` → `tick-clock` effect on a relevant clock (LLM picks from
  available clock labels)
- `large` → `fire-portent` effect on the front whose grim portents
  most closely match the disruption

This is the only graceful-derailment path. It does NOT allow
unlimited improvisation — the state changes are bounded to the
existing clocks and portents. If players want to truly break the
plot, they ratchet clocks; they cannot author new fronts.

**Where:** `player-input-bridge.ts` gains a disruption classifier;
it calls the same LLM as other stages.

### 3.5.5 Running out of wall-clock time

**Problem:** 5-hour session, players are halfway at hour 4. v2 had no
awareness of wall-clock; it would keep pacing the same regardless of
elapsed time.

**Fix:** Amendment O already added `worldState.elapsedMinutes` and
`classifyMove` consumes `pacingPressure`. When pressure exceeds 0.7
outside the resolution act, the Director:
1. Forces soft moves over cutscenes
2. Ticks one eligible clock by one segment per tick (as a time-skip)
3. Prunes unvisited hub branches from the visible choice set (hides
   optional content so the party focuses on the main spine)
4. Narrates a "Time has passed" chunk above the next narration

**Where:** `director.ts` graph nodes consume `pacingPressure` in the
`evaluateTriggersNode` and `pickMoveNode` steps. Tick duration is a
tunable constant `MINUTES_PER_TICK = 20`.

### 3.5.6 Emergency secret grant on critical success

**Problem:** A PC rolls a natural 20 on a Recall Knowledge / Sense
Motive / Perception check. v2 would return a critical success result
but had no mechanism to hand out an unrevealed secret.

**Fix:** `adjudicate` emits a `criticalSuccess: boolean` on its
result (already present in `AdjudicationResultSchema`). The Director
`pickMoveNode` checks: if the most recent adjudication was a crit AND
there are `graph.secrets` with `discovered: false` AND at least one
has a `conclusionTag` that matches an active front, pick that secret
and emit a `reveal-secret` effect. The next narration chunk includes
the secret text as a GM whisper to the critting player.

**Where:** `director.ts` graph nodes — new step between
`continueNode` and `persistNode` called `maybeGrantSecretNode`.

---

## Phase 4: Authoring UI — React Flow reviewer with edit mode

**Rationale:** This is where the human GM assistant turns "good enough"
into "actually runnable". Per user direction (Q4: level 3.5, Q5: React
Flow), the UI supports full graph surgery — add/remove/rewire nodes
and edges — plus a view-mode toggle for read-only review.

**Subagent:** `frontend-designer`, `frontend-design` skill, `ui-designer`,
`ux-designer` skill, and a performance-focused subagent (user Q4) to
guard rendering logic. React Flow's perf footguns are real on graphs
>50 nodes, and our graphs can hit 40.

### Sub-phase 4A: React Flow integration

#### File: `package.json`
- **What:** add `"reactflow": "^11.11.4"` (confirm latest via context7).
- **Why pin minor:** React Flow's API has shifted across 10→11; pin so
  upgrades are intentional.

#### File: `src/app/sesja/[id]/przygotowanie/page.tsx` (create)
- **What:** server component; loads session by id; if `phase==="brief"`
  redirects to the generator; if `phase==="authoring"` or `"approved"`
  renders the authoring shell; otherwise 404.
- **Components:** `<AuthoringShell session={session} />`

#### File: `src/components/authoring/authoring-shell.tsx` (create)
- **What:** top-level layout: left sidebar (brief + NPC roster + clocks +
  secrets), center React Flow canvas, right sidebar (selected-node
  inspector), top bar (read/edit toggle, save, approve, regen-node).
- **Split panes** via existing `src/components/ui/resizable.tsx` if it
  exists; else Tailwind flex with draggable divider (deferred polish).

#### File: `src/components/authoring/graph-canvas.tsx` (create)
- **What:** React Flow canvas that renders `SessionGraph` as a DAG.
- **Node → ReactFlow node** mapping:
  - Custom node type per `NodeKind` (`strong-start`, `scene`, `hub`,
    `cutscene`, `combat-narrative`, `combat-rolled`, `exploration`,
    `ending`)
  - Each custom node shows title + synopsis + tag row + a warning badge
    if the graph validator surfaces issues (e.g., orphaned, unreachable)
- **Edge → ReactFlow edge** mapping:
  - `choice` → solid line, label = edge.label
  - `auto` → solid line, no label, arrow
  - `fallback` → dashed line
  - `clock-trigger` → dotted line with clock-icon marker
- **Layout:** ELKjs (Eclipse Layout Kernel compiled to WASM, run in a
  Web Worker). Amendment V picks ELKjs over dagre because dagre
  produces passable top-level layout but terrible edge routing
  on 40-node directed graphs with multiple act boundaries — the
  React Flow team's own ELKjs example shows the difference. ELKjs
  runs async in a worker so re-layout never blocks the main thread.
  Manual override persists in graph metadata under
  `graph.editorLayout[nodeId]` — NOT in the SessionGraph schema
  itself (authoring vs runtime separation), so add a sibling field
  `SessionState.editorLayout?: Record<NodeId,{x:number,y:number}>`.
- **Trade-off (Iron Law for ELKjs swap):** *Pro:* crossing-edge
  minimization, async in worker, supports compound/nested nodes
  (needed for Amendment T's group-by-act swim lanes), +2 bundle
  deps (~400KB gzipped). *Con:* slightly more config than dagre's
  4 lines. Net positive for 40-node session graphs.
- **Performance guardrails** (user Q4: perf subagent; Amendment V
  adds explicit requirements):
  - **`onlyRenderVisibleElements` prop** = true. Single-line viewport
    virtualization. React Flow's own docs recommend this for any
    graph over ~50 nodes; we enforce it at 8 nodes because it costs
    nothing and the ceiling is 40.
  - Custom node components are `React.memo` with deep-equal prop check
  - `nodes` and `edges` passed to React Flow are stable references
    via `useMemo` keyed on `graph.version`
  - Edge bundling disabled; simple straight/step edges only (ELKjs
    already routes edges intelligently)
  - Virtualize the left sidebar's NPC/secret/clock lists with
    `react-window` when counts exceed 20

#### File: `src/components/authoring/node-inspector.tsx` (create)
- **What:** right-pane editor for the selected node.
- **Form fields (read-only in view mode, editable in edit mode):**
  - title, synopsis, prompt (big textarea), tags, tensionLevel slider,
    npcsPresent multi-select from `graph.npcs`, locationId dropdown,
    `when` predicate builder (tree UI), `onEnterEffects` list
- **Regen button:** calls `/api/sessions/[id]/nodes/[nodeId]/regenerate`
  which runs a single-node LLM call (reusing stage E prompt) and updates
  only this node's `prompt` text. Other fields untouched.

#### File: `src/components/authoring/graph-editor-toolbar.tsx` (create)
- **What:** top bar with: read/edit toggle (big), Save Draft, Approve,
  "Add Node" menu, "Validate" button (re-runs client-side graph validator
  + server-side via `POST /api/sessions/[id]/validate`), and a family
  of **regenerate-at-level** buttons (Amendment S, from practitioner
  review §6):
  - **Regenerate Node** — already planned; single-node LLM call
  - **Regenerate Front** — re-runs stage A for one front, preserving
    other fronts + all scenes that don't reference it
  - **Regenerate Clock** — re-runs a targeted clock-generation LLM
    call given the live front + scene context
  - **Regenerate NPC** — re-runs stage F (stat block) + a short NPC
    personality refresh for one character
  - **Regenerate All** — nukes the graph and re-runs the full 6-stage
    generator
  The practitioner explicitly said node-only regen was the thing that
  would keep them re-doing half the graph from scratch. Four extra
  regen routes turn the authoring UI from "edit" to "iteratively
  curate", which is the actual GM workflow.

#### React Flow layout — group by act (Amendment T)
- **What:** ELKjs layout alone routes edges well but does not cluster
  nodes by act — a 40-node heist with three interleaved fronts would
  still look like spaghetti. Add **group nodes** (React Flow's
  `parentNode` feature) that visually cluster all nodes of the same
  `act` (1, 2, or 3) into horizontal swim lanes. ELKjs handles the
  nested layout; edges still cross lane boundaries.
- **Where:** `src/components/authoring/graph-canvas.tsx` —
  `useMemo`-built group nodes from `graph.nodes[].act`. Three fixed
  lanes named "Akt I", "Akt II", "Akt III". ELKjs's nested-graph
  option (`hierarchyHandling: INCLUDE_CHILDREN`) is the supported
  path for this pattern.
- **Trade-off (Iron Law):** *Pro:* readable at 40 nodes; ELKjs
  natively supports nested hierarchies so the feature is ~30 LOC of
  node-transformation code. *Con:* adds a `parentNode` level which
  makes drag-and-drop UX slightly more complex (children clamp to
  parent bounds). React Flow handles both natively. Net positive.

#### Confidence score display (Amendment U)
- **What:** After the server-side validator runs, the authoring UI
  shows a single headline number: **Generation confidence: X%**.
  Derived from: (validator warnings count × -5) + (stat-block
  out-of-range clamps × -10) + (Three-Clue-Rule redundant-secret
  flags × -5), clamped to [0, 100]. A score ≥90 means "probably safe
  to approve after spot-check"; a score <60 means "plan to re-author
  by hand".
- **Why:** the practitioner said their 25-minute review pass on a
  generated graph was the gating factor on whether the product saves
  time vs Obsidian. A trust score lets them shortcut that pass when
  confidence is high.

### Sub-phase 4B: Authoring API

#### File: `src/app/api/sessions/[id]/graph/route.ts` (create)
- **PATCH** — accepts a partial `SessionGraph` diff; merges server-side;
  re-validates; persists via `store.updateGraph(id, patch)`. Returns
  the updated graph + any validation warnings.

#### File: `src/app/api/sessions/[id]/nodes/[nodeId]/regenerate/route.ts` (create)
- **POST** — runs stage E of the generator for a single node; merges
  the new `prompt` into the graph; persists.

#### File: `src/app/api/sessions/[id]/validate/route.ts` (create)
- **POST** — runs the graph validator (Phase 2 validation repair logic)
  against the current graph; returns a list of `ValidationIssue` objects
  with node/edge id + severity + message. No LLM calls.

#### File: `src/app/api/sessions/[id]/approve/route.ts` (create)
- **POST** — transitions `phase → approved`; runs `compileGraph`;
  persists `inkCompiled` + initializes `worldState` with empty clocks/flags
  + cursor = startNodeId. Returns OK. Client navigates to `/sesja/[id]`
  (the play page, Phase 5).

### Success Criteria

#### Automated
- [ ] Unit test: renders 40-node fixture without errors
- [ ] Unit test: node inspector edit → PATCH route → graph updated
- [ ] Unit test: validator route catches orphan nodes, missing endings,
      clock-trigger edges with no clock
- [ ] Component test: read mode disables all form inputs; edit mode
      enables them
- [ ] Perf test (Playwright, `src/tests/e2e/authoring-perf.spec.ts`):
      opening a 40-node graph completes <2s; dragging a node re-renders
      <100ms

#### Manual
- [ ] User (experienced GM) reviews a generated graph and is able to
      (a) understand it, (b) find problems, (c) fix them without reading docs
- [ ] Approve button compiles + navigates to play without losing state
- [ ] Polish i18n copy throughout (use existing `t()` helper from
      `src/lib/i18n`)

### Dependencies
- Requires: Phases 1, 2, 3 (compile happens on approve)
- Blocks: Phase 5 (play UI reads approved sessions)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| React Flow perf tanks on 40+ node graphs | Med | High | Perf subagent review of node memoization + virtualization; acceptance threshold <100ms drag re-render |
| Predicate builder UI too fiddly for humans | High | Med | Start with a "raw JSON" editor mode + a simplified drop-down for common patterns (`flag-set`, `clock-filled`); expand later |
| Graph surgery breaks referential integrity (delete a node, orphan edges) | High | Med | PATCH validator runs every write; cascading delete option on the client; warning banner when orphans are created |
| Users lose work on browser crash before save | Med | Med | Auto-save draft every 15s + localStorage backup; flush on tab close |

---

## Phase 5: Play runtime — autonomous cutscene loop with multi-human single-browser

**Rationale:** This is the payoff. The page shows the narrative streaming
out of the Director, pauses at player-action nodes, and supports the
multi-human single-browser model (Q7) via a character switcher.

**Subagent:** `frontend-developer`, `ui-designer`, `accessibility-tester`
after initial impl.

### Sub-phase 5A: Play page shell

#### File: `src/app/sesja/[id]/page.tsx` (rewrite from Phase 0 stub)
- **What:** server component; loads session; if `phase!=="approved"` and
  `phase!=="playing"` and `phase!=="ended"` redirects to wizard or authoring;
  otherwise renders `<PlayShell session={session} />`.

#### File: `src/components/play/play-shell.tsx` (create)
- **What:** top-level layout: header (session title + active clocks
  visualizer), main (narration feed + choice pane), right sidebar
  (characters + "whose turn" indicator + spotlight debt), bottom
  (free-text escape hatch).

### Sub-phase 5B: Narration feed

#### File: `src/components/play/narration-feed.tsx` (create)
- **What:** scrollable append-only list of narration chunks and player
  actions. Each entry has `{ at, speaker, text, move }` where `move`
  is the Director's classifier output — displayed as a subtle icon
  (hard move = red, soft = yellow, question = blue, cutscene = grey).
- **Autoplay:** on mount, if `phase==="approved"`, POST to `/api/director`
  with `{type: "start"}` to kick off the strong start, then recursively
  POST `{type: "continue"}` as each DirectorOutput arrives WITHOUT
  pending choices or roll — until a choice or roll surfaces. This is
  the "cutscene runs automatically" loop (Q6 Model A).
- **Stream or poll?** For MVP, each `/api/director` call is request/response
  (no streaming). The narration appears in chunks corresponding to Director
  ticks. Streaming SSE is a later polish.

#### File: `src/components/play/choice-pane.tsx` (create)
- **What:** renders `DirectorOutput.choices` as buttons. On click,
  POST `/api/director` with `{type: "choice", choiceIndex: N}`.
- **Free-text escape hatch (Q6 hybrid):** always-visible text input
  below the choice buttons, submits with `{type: "player-input", playerInput: "..."}`.
  The Director's `player-input-bridge` (Phase 3C) handles fuzzy matching
  to available choices + adjudicate fallback.

#### File: `src/components/play/character-switcher.tsx` (create)
- **What:** right-sidebar list of PCs with a "currently active" pill.
  When the Director emits `pendingRoll.characterName`, that character
  is highlighted. Humans at the table take turns physically — no auth,
  no user model. The switcher is just a visual prompt.
- **Spotlight debt viz:** tiny bar chart showing
  `worldState.spotlightDebt[character]` per PC. When one bar grows too
  tall, the human GM assistant can nudge the Director with the
  "advance spotlight" admin control.

#### File: `src/components/play/clock-tracker.tsx` (create)
- **What:** horizontal row of SVG clock circles (Blades-style segmented
  wheels) in the header. Each clock shows `filled/segments`. Clicking
  opens a tooltip with the clock's `onFillNodeId` preview so the human
  knows what's about to happen. Read-only — clocks only tick via Director
  effects (or admin override).

#### File: `src/components/play/pending-roll.tsx` (create)
- **What:** when `DirectorOutput.phase === "awaiting-roll"`, this modal
  takes over. Shows: "Character X needs to roll Y against DC Z". A single
  button rolls via the existing PF2e adjudicator and POSTs the outcome
  as `{type: "roll-result", ...}`.
- **This is the hand-off between Ink flow + the PF2e dice engine.**
  Ink pauses via an external function call; the TS side rolls; the result
  is fed back to Ink via `ink.choose()` or variable assignment.

### Sub-phase 5C: Director API route

#### File: `src/app/api/director/route.ts` (create)
- **POST** — the single endpoint for ALL play-time Director calls.
- **Input:** `{ sessionId, input: DirectorInput }`
- **Output:** `DirectorOutput`
- **Implementation:** thin HTTP adapter → calls `director(input, deps)`.
- **Rate limiting:** 60 req/min per session (generous; the autoplay loop
  can hammer it during cutscenes)

### Sub-phase 5D: NPC action router

**Relates to Q8 — user wants a mix of narrative-NPC-actions and
full-rules NPC actions.**

#### File: `src/lib/orchestration/director/npc.ts` (create) — Amendments D + R
- **What:** single file covering everything combat-related at play time:
  NPC routing by node kind, initiative, and per-round action
  resolution. Amendment D consolidates the former `npc-router.ts` +
  `initiative.ts` into one module because they have one caller and
  share state.
- **Amendment R — combat scope honesty.** The practitioner review
  flagged that "PF2e without three actions is not PF2e". True. The
  `combat-tactical` node kind is therefore renamed to
  `combat-rolled` throughout the schema and code, and its
  implementation is explicitly **one strike per turn, not three**,
  with MAP not applied. This is documented in the NodeKind union's
  docstring so nobody downstream confuses it with full PF2e combat:
  ```ts
  "combat-rolled"  // combat resolved via rolled strikes + initiative.
                    // NOT full PF2e 3-action economy (post-MVP).
                    // Single strike per turn, MAP ignored.
  ```
  Marketing copy for the product must say "PF2e-flavored narrative
  combat" or similar — never "full PF2e combat". An honest YELLOW
  is better than a dishonest GREEN. Full 3-action + MAP is a
  post-MVP phase, explicitly documented below under Post-MVP.
- **Trade-off (Iron Law):** *Pro:* two closely-coupled concerns live
  together; one import from the director graph; easier to reason about
  combat state. *Con:* file may grow past 300 lines if tactical combat
  expands; if so, split along `router | initiative | resolution` lines
  at that point (not speculatively now).
- **Public surface:**
  ```ts
  // Router — called from the director LangGraph for combat nodes
  export async function resolveCombatNode(
    node: SessionNode,
    graph: SessionGraph,
    worldState: WorldState,
    deps: { callLLM: CallLLM }
  ): Promise<{ narration: string; effects: Effect[]; continue: boolean }>;

  // Initiative helpers (pure)
  export function rollInitiative(
    party: CharacterSheetParsed[],
    npcs: Npc[]
  ): InitiativeOrder;
  export function nextActor(order: InitiativeOrder, state: WorldState): Actor;
  export function advanceRound(state: WorldState): WorldState;
  ```
- **Routing behavior:**
  - `node.kind === "combat-narrative"` → one LLM narration call + one
    summary party check via `adjudicate()`. No stat blocks consulted.
  - `node.kind === "combat-rolled"` → initiative roll + per-round
    NPC single-strike via the adjudicator (using stat blocks from
    `graph.npcs[].statBlock`), HP tracked in
    `worldState.vars["npc_<id>_hp"]`. LLM narrates each round in one
    chunk (not per-action) to keep UX paced. **One strike per actor
    per round, MAP not applied** (Amendment R).
- **Mode selection:** the author (LLM stage B) tags each combat node
  during generation. Human assistant can flip the tag in the authoring UI.
- **Deferred scope:** no action economy beyond "one attack per turn".
  Full PF2e 3-action system is post-MVP (documented below under
  "Post-MVP" section).

### Success Criteria

#### Automated
- [ ] Unit test: narration feed renders cutscene chunks in order
- [ ] Unit test: choice click POSTs and updates feed
- [ ] Unit test: free-text submit routes through `player-input-bridge`
- [ ] Unit test: `combat-rolled` node triggers initiative + single-strike round
- [ ] Unit test: `combat-narrative` node triggers single-check narration
- [ ] Playwright E2E (`src/tests/e2e/play-flow.spec.ts`): full
      cutscene → choice → cutscene → combat → ending flow on a
      pre-canned approved session

#### Manual
- [ ] Sitting down with a human GM + 3 players at one laptop produces
      a coherent 30-minute session without the Director stalling
- [ ] The clock visualization visibly advances during hard moves
- [ ] Polish throughout (narration, UI labels, choice labels)
- [ ] Accessibility: keyboard-navigable choice buttons; narration feed
      has `aria-live="polite"` so screen readers announce new chunks

### Dependencies
- Requires: Phases 1-4
- Blocks: Phase 6 (endings), Phase 7 (tests)

### Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Autoplay loop runs forever if Director never returns a choice | Med | High | Safety cap: max 20 consecutive `{type: "continue"}` calls; surface an error if exceeded |
| Tactical combat is slower than narrative — UX becomes a slog | High | Med | Initiative order kept to ≤6 actors; LLM narration chunked per round not per action |
| Free-text bridge matches wrong choice, player frustrated | Med | Med | Always show the text input + the "what I understood as" confirmation chip before committing |
| Multi-human single-browser is confusing about "whose turn" | Med | Med | Character switcher is huge + high contrast; Director emits explicit `"now X rolls"` prompts |

---

## Phase 6: Endings and session completion (no Victory Points — Amendment E)

**Rationale:** The session must be able to END. Without this phase, the
Director keeps ticking forever. Endings are already in the schema (Phase
1) — this phase wires them to actual termination.

**Amendment E (drop Victory Points):** Victory Points were cut from
MVP scope on architecture review. User did not ask for VP; research
mentioned it among several ending-selection mechanics. Clock-filled
+ flag-set predicates cover MVP ending conditions adequately. VP is
documented in the Post-MVP section below.

### Changes

#### File: `src/lib/orchestration/director/endings.ts` (create) — Amendment D
- **What:** pure function(s) that evaluate `SessionGraph.endings[]` in
  priority order when the Director detects "session should end" (any
  Front's Impending Doom reached OR any ending's `condition` predicate
  satisfied). Returns the winning `Ending`, which points at a terminal
  node; Director diverts there, narrates, sets `phase → ended`.
- **Trade-off (Iron Law):** merged from `ending-selector.ts` + the
  dropped `victory-points.ts`. Single file for end-of-session logic;
  grows to ~100 LOC, well under the file-size cap.
- **Public surface:**
  ```ts
  export function selectEnding(
    graph: SessionGraph,
    worldState: WorldState
  ): Ending | null;

  export function shouldEndSession(
    graph: SessionGraph,
    worldState: WorldState
  ): boolean;
  ```
- **Priority order:**
  1. Any Front's `firedPortents === grimPortents.length` → that front's
     Impending Doom ending wins.
  2. Else, iterate `graph.endings[]` in array order and return the
     first one whose `condition` predicate evaluates true.
  3. Else, return null (session continues).

#### File: `src/components/play/ending-screen.tsx` (create)
- **What:** full-screen replacement for `PlayShell` when `phase==="ended"`.
  Shows: ending title + summary + recap of key decisions + shareable
  session URL. Bookmarks the session in `useSessionBookmarks` local
  storage for later viewing (read-only).

#### File: `src/components/play/play-shell.tsx` (modify)
- **What:** branch on `phase==="ended"` → render `<EndingScreen />`.

### Success Criteria
- [ ] Unit test: `selectEnding` picks the first matching ending when
      multiple conditions are true (deterministic order)
- [ ] Unit test: Impending Doom trumps clock-condition endings when all
      portents fire
- [ ] E2E: full session to a positive ending and to a failure ending
- [ ] Ending page is a read-only bookmark (no further Director calls)

### Dependencies
- Requires: Phase 5
- Blocks: nothing

---

## Phase 7: Tests — rebuild after Phase 0 deletion

**Rationale:** Phase 0 deleted ~65 tests. Phases 1-6 add new ones. This
phase is explicit so we don't close out the plan with a half-covered
codebase.

**Coverage baseline (Amendment H):** Before Phase 0 lands, capture the
current `src/lib/` branch coverage with `npm run test -- --coverage`
(vitest's c8 reporter). That number is the acceptance floor for this
plan. Test count is a vanity metric; we track coverage % instead. If
the pre-demolition baseline is e.g. 78% branch coverage on
`src/lib/`, the post-plan branch coverage on `src/lib/` must be ≥78%.

### Changes (all test files, create) — list reflects consolidated file layout

- `src/tests/session-brief.test.ts` — Phase 1 schema round-trip
- `src/tests/session-graph.test.ts` — Phase 1 schema validation (orphans,
  min nodes, edge referents, ending existence, duplicated ids, cycle
  detection exceptions for clock-triggers)
- `src/tests/in-memory-session-store.test.ts` — Phase 1 new store file (Amendment A)
- `src/tests/generate-session.test.ts` — Phase 2 pipeline with mocked LLM
  (all six stages)
- `src/tests/render-ink.test.ts` — Phase 3 graph → .ink source text
- `src/tests/ink.test.ts` — Phase 3 flat helpers (Amendment C):
  compileGraph round-trip, createStory + continueMaximally, choose,
  saveState/loadState round-trip, bindExternalFunction invocation
- `src/tests/director.test.ts` — Phase 3 full Director loop with
  fixture, **plus inlined `classifyMove` matrix tests** (Amendment D —
  no separate moves.test.ts)
- `src/tests/player-input-bridge.test.ts` — Phase 3 fuzzy matching
- `src/tests/npc.test.ts` — Phase 5 combat (narrative + tactical +
  initiative helpers, Amendment D — replaces former npc-router.test.ts
  and initiative.test.ts)
- `src/tests/endings.test.ts` — Phase 6 (Amendment D — replaces former
  ending-selector.test.ts; Amendment E — no victory-points.test.ts)
- `src/tests/authoring-shell.test.tsx` — Phase 4 component test
- `src/tests/graph-canvas.test.tsx` — Phase 4 React Flow render
- `src/tests/node-inspector.test.tsx` — Phase 4 edit mode
- `src/tests/integration/generate-session.integration.test.ts` — Phase 2 real LLM
- `src/tests/integration/director-play.integration.test.ts` — Phase 3+5 end-to-end
- `src/tests/e2e/authoring-flow.spec.ts` — Phase 4 happy path (wizard → generate → edit → approve)
- `src/tests/e2e/authoring-perf.spec.ts` — Phase 4 React Flow perf (40-node graph load + drag latency)
- `src/tests/e2e/play-flow.spec.ts` — Phase 5 full play flow (cutscene → choice → combat → ending)
- `src/tests/evals/generator-stages.eval.test.ts` — Amendment V: vitest-evals suite running `describeEval()` on each generator stage's prompt with recorded fixtures + autoevals scorers (structural + LLM judge for Polish quality)
- `src/lib/prompts/session-generator/stage-a.eval.yaml` through `stage-f.eval.yaml` — Amendment V: promptfoo declarative configs, run by GitHub Action on PRs that touch the prompt files

**Success target (Amendment H):** `src/lib/` branch coverage ≥
pre-demolition baseline. The baseline is captured in the Phase 0 commit
message as a one-line note: `branch coverage baseline: X%`.

---

## Local testing strategy (cross-phase)

**Purpose:** This section answers *"what do I run before I push, and
what do I do when a test fails at 11pm?"*. Phase 7 lists the test files
to create; this section tells the implementer which pyramid level each
test belongs to, how to run it locally, how to seed fixtures, and how
to debug a broken session.

**Principles followed:** test pyramid (70/15/10/5 unit / component /
integration / E2E), behavior over implementation, no arbitrary waits,
no test interdependence, meaningful coverage via branch not line.
These principles were sourced from the `pokayokay:testing-strategy`
Claude skill (installed at
`~/.claude/plugins/cache/pokayokay/.../skills/testing-strategy/`) and
its references on flaky-test prevention. The skill is an authoring
aid; nothing in this plan depends on it being present for other
readers.

### 1. Test pyramid — allocations per surface

| Surface | Unit | Integration | Component | E2E |
|---|---|---|---|---|
| Schemas (`session-brief`, `session-graph`) | ✅ heavy | — | — | — |
| Generator pipeline (6 stages) | ✅ per-stage with mock LLM | ✅ one full real-LLM run | — | — |
| Director graph (LangGraph + classifyMove) | ✅ fixture-driven | ✅ one real-LLM + real Redis run | — | — |
| inkjs helpers (`ink.ts`, `render-ink.ts`) | ✅ pure fixtures | — | — | — |
| NPC combat (`npc.ts`) | ✅ deterministic dice seed | — | — | — |
| Endings (`endings.ts`) | ✅ predicate truth table | — | — | — |
| API routes (`/api/sessions/*`, `/api/director`) | ✅ with in-memory store | ✅ smoke with real Redis | — | — |
| Authoring UI (React Flow, inspector) | — | — | ✅ RTL + MSW | ✅ happy path |
| Play UI (narration feed, choice pane, clock tracker) | — | — | ✅ RTL + MSW | ✅ happy path |
| Store factory (in-memory vs Redis) | ✅ with env-var stub | ✅ real Redis | — | — |

**Share target:** 70% unit, 15% component, 10% integration, 5% E2E.
Test count is not a KPI; branch coverage is (see Amendment H / Phase 7).

### 2. Local dev stack

The app needs three runtime dependencies to exercise the full pipeline
locally: (a) a Redis instance, (b) an LLM provider, (c) a Next.js dev
server. The strategy below lets a developer iterate on the authoring
UI and play flow *without burning Scaleway credits on every refresh*.

#### 2.1 Redis — local Docker

```bash
# One-time
docker run -d --name pfnexus-redis -p 6379:6379 redis:7-alpine

# Or, if you already have Redis via brew
brew services start redis
```

Add to `.env.local`:
```
REDIS_URL=redis://localhost:6379/0
```

`store-factory.ts` picks this up automatically; no code change needed.
The integration test suite uses a scoped key prefix
(`pfnexus:test:${randomSuffix}:session:`) so it cannot clobber your
dev sessions. Per the 2026-04-10 plan Phase 1.

#### 2.2 LLM provider — three tiers

The app reads `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_TEXT_MODEL`, and
`LLM_VISION_MODEL`. Same `callLLM` surface regardless of backend, so
swapping is a `.env.local` change.

| Tier | When to use | Setup |
|---|---|---|
| **Scaleway Generative APIs** (default) | integration + E2E with real prompts, pre-push sanity | Copy keys from the Scaleway console into `.env.local`; nothing else. |
| **Local Ollama** (optional) | iterating on authoring UI, play loop ticks, anything that doesn't care about prompt quality | `ollama pull llama3.1:70b-instruct-q4_0`, set `LLM_BASE_URL=http://localhost:11434/v1 LLM_API_KEY=ollama LLM_TEXT_MODEL=llama3.1:70b-instruct-q4_0`. Quality is worse; structure is good enough for UI dev. |
| **Recorded LLM fixtures (DI of `callLLM`)** | every unit test that touches an orchestrator (generator stages A–F, director, player-input-bridge) | Record real LLM responses once into `src/tests/fixtures/llm-responses/stage-{a,b,c,d,e,f}.json`. Replay in test by passing a `vi.fn().mockResolvedValue(recordedString)` through the orchestrator's `deps.callLLM` — the exact same dependency-injection pattern `resolve-interaction.test.ts` uses today. **This path does NOT use MSW.** MSW is reserved for `/api/*` route mocking in component tests (§5); the `callLLM` boundary is mocked via DI. Two boundaries, two tools, no overlap. |

**Iron Law trade-off on Ollama:** *Pro:* free, fast on M-series Mac;
*Con:* Polish output quality is lower than Scaleway's llama-3.1-70b;
**never use Ollama for prompt regression tests** — those must hit real
Scaleway. Ollama is for UI dev, not prompt dev.

#### 2.3 Next.js dev server

```bash
npm run dev     # http://localhost:3000
```

Nothing special. Test flows run against the same dev server that
Playwright hits in E2E mode.

### 3. Fixtures — the canonical test assets

All tests share a small set of hand-authored fixtures. These live
under `src/tests/fixtures/` (create in Phase 7) and are imported by
unit, integration, and component tests alike. **Fixtures are
hand-written, not generated** — we commit them to git so that a test
failure points at a stable known-good object, not a flaky LLM output.

| Fixture | Phase | Purpose |
|---|---|---|
| `brief-heist-pf2e-level3.json` | 1 | Canonical `SessionBrief`: 4 PCs, level 3, 5h, "port-city heist". Used by generator tests + wizard tests. |
| `graph-heist-8nodes.json` | 1 | Hand-authored `SessionGraph`: 8 nodes, 2 fronts, 4 clocks, 6 secrets, 2 endings. Passes schema validation. Used by renderer tests, authoring-UI tests, director tests. |
| `graph-heist-invalid-orphan.json` | 1 | Same graph with one orphan node — used to prove validator catches it. |
| `graph-heist-invalid-clock.json` | 1 | `clock-trigger` edge with missing `clockId` — validator proof. |
| `ink-source-heist.ink` | 3 | Expected `.ink` source from `render-ink(graph-heist-8nodes)`. Snapshot test ensures renderer determinism. |
| `session-approved-heist.json` | 1 | `SessionState` in `phase=approved`, pre-compiled `inkCompiled`, clean `worldState`. Director integration test loads this to start play. |
| `session-midplay-heist.json` | 1 | **Added post-review.** `phase=playing`, non-zero inkjs cursor, 1 clock at 50% fill, 1 secret revealed, 2 flags set. Drives the `ink.saveState`/`loadState` resume path in `ink.test.ts` and the mid-run classifyMove branches in `director.test.ts`. Without this fixture those tests can only exercise cold-start. |
| `session-clockfull-heist.json` | 1 | **Added post-review.** One clock at `filled === segments`, triggering a `clock-trigger` edge. Drives `classifyMove → "hard"` and the `onFillNodeId` divert branch. |
| `session-combat-rolled-heist.json` | 5 | **Added post-review.** `worldState.pendingRoll` populated, one NPC HP halved, initiative order set. Drives `npc.ts` combat-rolled round resolution (single-strike). |
| `session-ended-heist.json` | 1 | `SessionState` in `phase=ended` with a terminal worldState. Ending screen component test. |
| `llm-response-stage-a.json` | 2 | Recorded Scaleway LLM response for skeleton stage — replayed via DI of `callLLM` in unit tests (see §2.2). |
| `llm-response-stage-b.json` through `stage-f.json` | 2 | Same, for stages B–F. Six files total, one per generator stage. |

#### 3.1 Test data factories

Builders live in `src/tests/factories/`:

```ts
// src/tests/factories/brief-factory.ts
export function makeBrief(overrides: Partial<SessionBrief> = {}): SessionBrief {
  return SessionBriefSchema.parse({
    version: "pf2e",
    partySize: 4,
    partyLevel: 3,
    targetDurationHours: 5,
    tone: "port-city heist",
    setting: "Absalom, dockside district",
    presetId: "classic",
    storyDna: defaultStoryDNA("pf2e"),
    characterHooks: [],
    ...overrides,
  });
}

// src/tests/factories/graph-factory.ts
export function makeGraph(overrides: Partial<SessionGraph> = {}): SessionGraph { ... }

// src/tests/factories/session-factory.ts
export function makeSession(
  phase: SessionState["phase"] = "approved",
  overrides: Partial<SessionState> = {}
): SessionState { ... }
```

**Rule:** never write test setup that manually constructs a graph
object inline. Always use a factory + overrides. A test that *needs*
a special graph shape says so via overrides — the default is stable
and reused across every other test.

### 4. Running tests locally

#### 4.1 The inner loop (every save)

```bash
npm run test       # vitest watch mode — picks up file changes, re-runs related tests
```

Vitest watch is the default. Runs only unit + component tests (per
`vitest.config.ts:exclude` which excludes `src/tests/integration`).
Target: <5 seconds per iteration.

#### 4.2 Pre-commit (`npm run` one-liner)

Add a script to `package.json`:

```json
"test:local": "npm run typecheck && npm run lint && npm run test -- --run && npm run test:e2e"
```

This is what you run before `git commit`:
- typecheck (~10s)
- lint (~5s)
- unit + component in run-once mode (~10s)
- E2E against dev server with mocked LLM routes (~60s)

Total ~90s. Integration tests are NOT in this script — they hit real
Scaleway and cost real money.

#### 4.3 Pre-push (manual)

```bash
npm run test:integration   # real Scaleway LLM + real local Redis
```

Integration suite. **Hard-fails on missing `LLM_API_KEY` or
`REDIS_URL`** — no `skipIf` guards, no "test skipped" warnings. This
matches the policy already set by the 2026-04-10 plan Phase 1 and
enforced in the existing `src/tests/integration/*.integration.test.ts`
files; the new director-play integration test adopts the same rule,
so there is **no inconsistency** between old and new integration tests
(review #2 question Q2).

Run once before `git push`. **This is also the step where you
actually see whether your prompt changes work on the real model.**

**Integration test tick budget (review #2 question Q1):**
`director-play.integration.test.ts` must run **5 director ticks** per
test (not 10). Rationale:
- 5 ticks is enough to hit the resume path (load inkState mid-run),
  classifyMove transitions across at least two move kinds, and one
  `persistNode` + reload cycle.
- At ~2s per LLM call, 5 ticks ≈ 10s per test, well inside the 60s
  per-test timeout from `vitest.config.integration.ts`.
- The ending-selector path is covered by a separate integration test
  that loads `session-clockfull-heist.json` and asserts one tick
  produces `phase: "ended"` — no need to "play to the end" organically.

#### 4.4 CI (github actions, deferred to existing `ci.yml`)

CI runs `npm run typecheck && npm run lint && npm run test && npm run test:e2e`.
CI does **not** run `test:integration` — those are gated behind manual
pre-push because Scaleway API key is not a CI secret. This is a
deliberate trade-off (see Iron Law block below).

**Iron Law trade-off on CI integration tests:**
*Pro (current policy):* CI is free, fast, deterministic; no Scaleway
key in GitHub Secrets reduces blast radius of repo compromise.
*Con:* prompt regressions only surface when a human runs
`test:integration` manually. Mitigation: a `pre-push` git hook that
blocks push unless `test:integration` ran clean in the last 30
minutes. Deferred to post-MVP — for a personal project with one
developer, manual discipline is acceptable.

### 5. Component testing (Authoring + Play UI)

Two new UI surfaces land in Phases 4 and 5; both are heavy on
asynchronous state + fetch calls. Component tests use RTL + user-event
+ MSW for route mocking. **No raw `fetch` mocks**; no
`jest.fn()`-as-fetch; always MSW handlers so we exercise the real JSON
serialization path.

#### 5.1 MSW setup

Add to `package.json` devDeps: `msw ^2.4.0`.

```ts
// src/tests/msw/handlers.ts
import { http, HttpResponse } from "msw";
import {
  makeSession,
  makeGraph,
  makeDirectorOutput,
  makeValidationReport,
} from "@/tests/factories";

/**
 * MSW handlers for every /api/* route touched by component tests.
 * Handler bodies MUST use factories (never hardcoded literals) so the
 * response shape drifts in lock-step with the schema.
 */
export const handlers = [
  // Phase 2 — generator
  http.post("/api/sessions/:id/generate", async ({ params }) => {
    return HttpResponse.json({
      ok: true,
      session: makeSession("authoring", {
        id: params.id as string,
        graph: makeGraph(),
      }),
    });
  }),

  // Phase 4 — authoring
  http.patch("/api/sessions/:id/graph", async ({ request }) => {
    const patch = await request.json();
    return HttpResponse.json({ ok: true, graph: makeGraph(patch as object) });
  }),
  http.post("/api/sessions/:id/nodes/:nodeId/regenerate", async ({ params }) => {
    return HttpResponse.json({
      ok: true,
      node: {
        id: params.nodeId as string,
        prompt: "Zregenerowany fragment prozy.",
      },
    });
  }),
  http.post("/api/sessions/:id/validate", async () => {
    return HttpResponse.json({ ok: true, issues: makeValidationReport() });
  }),
  http.post("/api/sessions/:id/approve", async ({ params }) => {
    return HttpResponse.json({
      ok: true,
      session: makeSession("approved", { id: params.id as string }),
    });
  }),

  // Phase 5 — play
  http.post("/api/director", async () => {
    return HttpResponse.json(makeDirectorOutput());
  }),

  // Next.js prefetch passthrough — see §5.1 footnote on
  // onUnhandledRequest: "error" + /_next/* noise in jsdom
  http.get("/_next/*", () => HttpResponse.text("", { status: 200 })),
  http.get("/favicon.ico", () => HttpResponse.text("", { status: 204 })),
];

// src/tests/msw/server.ts
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
export const server = setupServer(...handlers);
```

Wire into `vitest.setup.ts` — **use the `@` alias**, not a relative
path, so moving the setup file cannot silently break the import:

```ts
import { beforeAll, afterEach, afterAll } from "vitest";
import { server } from "@/tests/msw/server";

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

`onUnhandledRequest: "error"` is critical — it catches the failure
mode where a test accidentally makes a real network call.

**Known jsdom noise (review #2 catch):** in jsdom, Next.js's client
router and React Flow's initial render occasionally trigger
`fetch("/_next/static/chunks/...")` or `fetch("/favicon.ico")`. With
`onUnhandledRequest: "error"`, these would fail component tests for
reasons unrelated to the test's assertion. The handler file above
includes blanket `/_next/*` and `/favicon.ico` passthroughs as the
**last** entries so real handlers still match first. Do not move them.

#### 5.2 Authoring UI component tests

React Flow is painful to unit test (canvas + measure-based layout).
Strategy: **don't test React Flow internals**. Test:

- ✅ That our custom node components render the right fields for each `NodeKind`
- ✅ That the inspector reads/writes the right schema fields
- ✅ That the validate button triggers the MSW-mocked route and surfaces warnings
- ✅ That the approve button calls the route and navigates

Skip:
- ❌ Drag-and-drop behavior (test in Playwright if at all)
- ❌ Edge rendering correctness (React Flow's concern)
- ❌ ELKjs layout coordinates (ELKjs's concern)

#### 5.3 Play UI component tests

- ✅ Narration feed appends new chunks in order
- ✅ Choice pane surfaces buttons from `DirectorOutput.choices`
- ✅ Free-text submit calls `/api/director` with `type: "player-input"`
- ✅ Clock tracker renders filled segments proportional to state
- ✅ Character switcher highlights the active character from `pendingRoll.characterName`
- ✅ Autoplay loop stops after 20 consecutive `{type: "continue"}` calls (safety cap)
- ✅ Ending screen shows when `phase === "ended"`

### 6. E2E (Playwright) — three specs total

**Three** Playwright specs, all on mocked LLM routes (no real Scaleway
calls in E2E — we don't want flaky network in the E2E bucket):

1. `authoring-flow.spec.ts` — happy path through wizard → generate → author → approve (below)
2. `play-flow.spec.ts` — happy path through play → ending (below)
3. `authoring-perf.spec.ts` — Phase 4 React Flow perf regression
   (opening a 40-node graph <2s, dragging a node re-renders <100ms).
   Referenced in Phase 4 Success Criteria; not re-described here
   because it's a pure measurement, not a user journey.

#### `src/tests/e2e/authoring-flow.spec.ts`
1. Navigate to `/sesja/nowa`
2. Fill wizard (version, preset, party size, character hooks), submit
3. Wait for redirect to `/sesja/[id]/przygotowanie`
4. Verify graph canvas renders with ≥8 nodes
5. Toggle edit mode, change one node title, save
6. Click Approve
7. Verify redirect to `/sesja/[id]`

#### `src/tests/e2e/play-flow.spec.ts`
1. Seed an approved session via API fixture
2. Navigate to `/sesja/[id]`
3. Verify first narration chunk appears within 5s
4. Verify a choice button renders
5. Click first choice
6. Verify next narration chunk appears
7. (Skip to ending via test-only header `X-Test-Skip-To-Ending: true`
   — add a dev-mode-only shortcut to the director route that forces
   a terminal divert, off by default in prod)
8. Verify ending screen renders with title + summary

**Performance budget:** each E2E scenario <15s. If they grow beyond
that, the MSW handlers are probably slow (add `delay: 0` to responses).

### 7. Debugging & replay tooling (post-review: trimmed to warranted only)

**Revised after review #2:** the v3 draft of this section proposed
six CLI scripts. Two are warranted on day 1; four are speculative and
deferred. The deferred scripts were creating their own scope creep —
`tail-director.ts` presumed a `DEBUG_DIRECTOR` pub/sub fan-out that
is not in any phase's Changes section (feature ambush), and
`replay-director.ts` duplicated Phase 3's `ink.test.ts` saveState /
loadState round-trip coverage.

**Ship on day 1:**

| Script | What it does |
|---|---|
| `scripts/dump-session.ts <id>` | Reads `SessionState` from Redis, pretty-prints JSON with worldState / clocks / cursor highlighted. Used when a session breaks at play time and the developer needs to inspect state without re-running the flow. |
| `scripts/seed-session.ts <fixture>` | Loads a fixture JSON and writes it to Redis as a session. **Required by E2E setup** (Phase 5 play-flow.spec.ts needs to seed an approved session without running the generator). |

**Deferred** (add when the specific debugging need arises during
impl, not speculatively):
- `dump-ink.ts` — `render-ink.test.ts` already snapshots graph → ink
  source; re-running the renderer from the CLI adds nothing.
- `graph-to-dot.ts` — Phase 4's React Flow authoring canvas already
  visualizes the graph; a DOT exporter is redundant.
- `tail-director.ts` — presumes a pub/sub channel not in any phase.
  If runtime log tailing is needed, it's a feature request, not a
  tooling bullet.
- `replay-director.ts` — duplicates `ink.test.ts` + `director.test.ts`
  coverage.

These are **developer tools, not production code.** They import from
`src/lib/*` but are never loaded by the Next.js server. Keep them in
`scripts/`, run via `npx tsx`, never bundle.

### 8. Flakiness prevention — the non-negotiables

From `anti-rationalization.md` (skill reference):

1. **No `setTimeout(fn, N)` in any test.** Use `vi.waitFor(() => expect(...).toBe(...))` or Playwright's `expect.poll()`. Arbitrary waits are the #1 cause of flaky suites.
2. **No test ordering dependencies.** Every test creates its own session via factory; no shared module-level state; `afterEach` cleans up MSW handlers.
3. **LLM integration tests assert shape, not exact strings.** The prompt may produce different Polish phrasing run-to-run. Assert: `expect(result.graph.nodes.length).toBeGreaterThanOrEqual(8)`, not `expect(result.graph.nodes[0].title).toBe("Dok w dymie")`.

   **Director narration assertion pattern (review #2 addition).**
   `director.test.ts` and `director-play.integration.test.ts` must
   assert on *state transitions and structure*, never on exact
   narration text. Canonical pattern:

   ```ts
   // GOOD — asserts the Director advanced state correctly
   const out = await director({ type: "start" }, deps);
   expect(out.narration).toBeTruthy();           // non-empty string
   expect(out.narration.length).toBeGreaterThan(20);
   expect(out.choices.length).toBeGreaterThanOrEqual(1);
   expect(out.phase).toBe("awaiting-choice");
   expect(out.worldState.turnCount).toBe(1);     // advanced by 1 tick
   expect(out.lastMove).toMatch(/cutscene|question/);

   // For a hard move: verify a clock ticked or a portent fired
   expect(out.worldState.clocks["racing_guards"]).toBeGreaterThan(
     input.worldState.clocks["racing_guards"] ?? 0
   );

   // BAD — brittle, will break on every LLM re-roll
   expect(out.narration).toContain("Dym wypełnia doki");
   ```

   **Allowed exact-string assertions:** `choices[].label` IS allowed
   to match exactly *when the choice label is authored in the graph
   fixture* (not LLM-generated). The choice label comes from
   `SessionEdge.label`, which is deterministic.
4. **No real network in unit/component/E2E buckets.** MSW with `onUnhandledRequest: "error"` catches leaks. Only the integration bucket is allowed to hit Scaleway + Redis.
5. **Fixtures are hand-written and committed.** Do not generate fixtures from real LLM output in CI — the LLM is nondeterministic; the fixture would drift.
6. **Director tests use deterministic dice.** `src/lib/dice/roll.ts` already supports seed injection; every director/NPC test seeds the RNG to a fixed value.
7. **Clock segments are bounded integers.** Clock state is `{filled, segments}` where both are `int`. No floating-point urgency math leaks into test assertions; `classifyMove`'s `maxClockUrgency` is derived once at call time.

### 9. Coverage baseline & enforcement (post-review: scoped to survivors)

**Review #2 catch:** the naive "compare `src/lib/` baseline before vs
after Phase 0" is mathematically unsound. Phase 0+1 deletes code
(`resolve-interaction.ts`, `narrate-scene.ts`, `optimize-input.ts`,
`summarize-deadlock.ts`, `orchestration/graph/*`) whose branches cannot
be covered after deletion. A whole-directory baseline would drop for
reasons unrelated to test quality.

**Corrected enforcement:**

1. **Survivor subset baseline (captured at HEAD before Phase 0 lands):**
   ```bash
   npm run test -- --coverage --coverage.reporter=text-summary \
     --coverage.include="src/lib/dice/**" \
     --coverage.include="src/lib/rag/**" \
     --coverage.include="src/lib/llm/**" \
     --coverage.include="src/lib/schemas/character-sheet.ts" \
     --coverage.include="src/lib/schemas/story-dna.ts" \
     --coverage.include="src/lib/schemas/version.ts" \
     --coverage.include="src/lib/schemas/zone.ts" \
     --coverage.include="src/lib/i18n/**" \
     --coverage.include="src/lib/state/story-dna-store.ts" \
     --coverage.include="src/lib/storage/**" \
     --coverage.include="src/lib/utils/**"
   ```
   Record the resulting branch coverage % in the Phase 0+1 commit
   message as: `survivor-subset branch coverage: X%`. This is the
   floor for the subset going forward — none of those files may
   regress.

2. **New surface per-file floor (enforced at each phase's success criteria):**
   - `src/lib/schemas/session-brief.ts` ≥ 90% branch (it's a Zod schema — mostly declarative, easy to hit)
   - `src/lib/schemas/session-graph.ts` ≥ 85% branch
   - `src/lib/orchestration/generate-session.ts` ≥ 75% branch
   - `src/lib/orchestration/director/director.ts` ≥ 80% branch (incl. `classifyMove`)
   - `src/lib/orchestration/director/ink.ts` ≥ 80% branch
   - `src/lib/orchestration/director/render-ink.ts` ≥ 85% branch
   - `src/lib/orchestration/director/endings.ts` ≥ 90% branch
   - `src/lib/orchestration/director/npc.ts` ≥ 75% branch
   - `src/lib/state/server/in-memory-session-store.ts` ≥ 90% branch

3. **No line coverage target.** Line coverage rewards useless tests
   (trivial rendering assertions). Branch coverage rewards testing
   decisions.

4. **Exclusions:**
   - `src/tests/**` (self-test exclusion)
   - `src/app/api/**/route.ts` (tested via integration — the base-config
     coverage run will not see these files because they are thin HTTP
     adapters that `node` integration tests hit, and vitest does not
     merge coverage across configs without explicit `mergeReports`
     wiring. **Documented concession: route handler coverage does not
     appear in the branch baseline.** If we need it, we add
     `mergeReports` in a follow-up.)
   - `src/lib/orchestration/director/graph/*` (LangGraph state
     annotations — declarative, no branches worth measuring)
   - `scripts/**`, generated type files, Next.js generated route types

### 10. What the Phase 7 file list maps to

Re-reading Phase 7 with the pyramid allocation from §1 above:

| Phase 7 file | Level | Notes |
|---|---|---|
| `session-brief.test.ts` | unit | Zod round-trip + factory |
| `session-graph.test.ts` | unit | Schema validation, orphan detection |
| `in-memory-session-store.test.ts` | unit | Lifecycle methods |
| `generate-session.test.ts` | unit | Mocked LLM, per-stage |
| `render-ink.test.ts` | unit | Snapshot against `ink-source-heist.ink` |
| `ink.test.ts` | unit | inkjs compile + run on tiny fixtures |
| `director.test.ts` | unit | Fixture-driven LangGraph + inlined classifyMove matrix |
| `player-input-bridge.test.ts` | unit | Mocked LLM |
| `npc.test.ts` | unit | Deterministic dice seed |
| `endings.test.ts` | unit | Predicate truth table |
| `authoring-shell.test.tsx` | component | RTL + MSW |
| `graph-canvas.test.tsx` | component | Custom nodes only, no React Flow internals |
| `node-inspector.test.tsx` | component | Edit mode RTL |
| `integration/generate-session.integration.test.ts` | integration | Real Scaleway, ≥1 full pipeline run per PR |
| `integration/director-play.integration.test.ts` | integration | Real Scaleway + real Redis, 10-tick playthrough |
| `e2e/authoring-flow.spec.ts` | E2E | Playwright + MSW — happy path |
| `e2e/authoring-perf.spec.ts` | E2E | Playwright — Phase 4 perf regression |
| `e2e/play-flow.spec.ts` | E2E | Playwright + MSW — happy path |

Seventeen files. That's less than the v1 list (reflects Amendment D
consolidations). Coverage matters, count doesn't.

### 11. Plan-level acceptance: "done" means all of these green

Before considering this plan implemented:

- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes with branch coverage on `src/lib/` ≥ pre-demolition baseline
- [ ] `npm run test:integration` passes with real Scaleway + real local Redis
- [ ] `npm run test:e2e` passes (both scenarios)
- [ ] Manual walkthrough: wizard → generate → author (edit one node) → approve → play a 10-tick cutscene → pick a choice → hit an ending, on one laptop, with Polish throughout
- [ ] A TTRPG practitioner (real human, §TTRPG validation in this plan)
      agrees the generated graph would produce a runnable session

---

## Cross-cutting considerations

### Polish-first
Every prompt and every UI string is Polish. English is allowed ONLY in:
- Zod schema field names (code convention, not user-visible)
- PF2e stat block expressions (`1d8+4`, `AC 17` — mechanical lingua franca)
- Log output and error messages (dev-facing)

The `t()` i18n helper from `src/lib/i18n` is the authoritative source for
UI copy.

### OpenAPI spec generation — `@asteasolutions/zod-to-openapi` (Amendment V)

The 15 interlocking Zod schemas (SessionBrief, SessionGraph, Node,
Edge, Clock, Front, Secret, Npc, Location, Ending, Predicate, Effect,
WorldState, SessionState, AdjudicationResult) are the API contract
for every route under `src/app/api/*`. Hand-writing OpenAPI would
drift from the schemas immediately. Instead:

```bash
npm install @asteasolutions/zod-to-openapi
```

Create `scripts/generate-openapi.ts` that imports every route's input
and output schemas, registers them via `OpenAPIRegistry`, and writes
`openapi.yaml` to the repo root. Wire it as a pre-commit script:
```json
"scripts": {
  "openapi": "tsx scripts/generate-openapi.ts"
}
```

Run manually during implementation; the resulting `openapi.yaml`
doubles as API documentation for the authoring UI team AND as input
to contract tests (via the existing vitest integration suite).

**Trade-off (Iron Law):** *Pro:* ~300 LOC of hand-written spec
replaced by one script; schema changes automatically propagate to
docs; can feed into promptfoo if we later add structured-output
assertions against the OpenAPI schema. *Con:* one extra dev
dependency; one extra script to run occasionally. Net positive at
15 schemas; would be break-even at <5.

### Orchestration boundary (CLAUDE.md rule 7)
- `src/lib/orchestration/generate-session.ts` is an orchestrator.
- `src/lib/orchestration/director/*` is ALSO an orchestrator — it spans multiple LLM
  calls, dice engine calls, and store writes. It lives under
  `src/lib/orchestration/director/` rather than `src/lib/orchestration/` only because
  it's a large enough subdomain to warrant its own namespace.
  API routes remain thin HTTP adapters.

### State boundary (CLAUDE.md rule 6)
- `SessionBrief` + `SessionGraph` + `WorldState` + `inkCompiled` + `inkState`
  are ALL server-owned. The client gets an opaque `sessionId` + the current
  `DirectorOutput` chunk. No zustand mirror. `useSessionBookmarks`
  (already exists) is the one client-side state and it's just a local
  list of `{id, name, lastSeen}`.

### LLM costs
- Generation: ~6 LLM calls × ~4k tokens avg ≈ 24k tokens/session
- Per-tick Director: ~1 LLM call × ~2k tokens = 2k tokens/tick
- Average session: ~100 ticks × 2k = 200k tokens
- Total per session: ~225k tokens
- At Scaleway's ~€0.15/M input + ~€0.60/M output for llama-3.1-70b:
  ~€0.05/session. Comfortable for a personal project.

### Observability — Arize Phoenix (local) + Scaleway Cockpit (prod) — Amendment V

Every Director tick emits a structured log line with:
`{sessionId, cursor, lastMove, clocksAdvanced, portentFired, tokensIn, tokensOut, latencyMs}`.

**Local dev observability:** Arize Phoenix running in Docker.
```bash
docker run -d --name phoenix -p 6006:6006 -p 4317:4317 arizephoenix/phoenix:latest
```
Wire the OTel exporter once in a dev-mode entrypoint:
```bash
npm install @arizeai/openinference-instrumentation-langchain \
  @opentelemetry/sdk-node @opentelemetry/exporter-otlp-grpc
```
Phoenix UI at `localhost:6006` shows span-level traces for every
Director loop tick with token counts + latencies + LangGraph node
graph. Zero external data transfer — all traces stay on the
developer's laptop.

**Trade-off (Iron Law):** *Pro:* local LangGraph traces are the
single biggest debug-time productivity win the research pass
identified; Phoenix is Apache 2.0 and runs in Docker in 30 seconds;
native LangGraph JS instrumentation exists via
`@arizeai/openinference-instrumentation-langchain`. *Con:* adds one
Docker dependency for dev loop, adds three npm dev-deps. Fallback
path: `@opentelemetry/sdk-trace-node`'s `ConsoleSpanExporter` prints
every span to stdout, works in CI without Docker.

**Production observability:** Scaleway Cockpit via OTLP export
(same SDK, different exporter URL). **Never** ship LangSmith traces
to production — per the 2026-04-10 plan's data classification
decision, LangSmith is dev-only because traces contain player
input that could include session PII.

**Rejected alternatives:**
- *Langfuse self-hosted* — also viable (Apache 2.0, persistent eval
  history) and can run alongside Phoenix. Flagged as "add later if
  we want eval history across builds"; not required at MVP.
- *LangSmith SaaS* — data classification reject.

---

## Risk Assessment (cross-phase)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Total plan scope is too big for one engineer | High | High | Phases are independently shippable in order; can stop after Phase 5 (MVP) and defer Phase 6 endings to a hotfix release; Phase 2 stage-wise generator can land with fewer stages initially |
| inkjs is the wrong runtime choice after all | Low | High | inkjs is reached only via the flat helpers in `ink.ts` (Amendment C); the swap point is ~20 call sites across director graph nodes. Extract a wrapper interface *only* if a second runtime is actually picked. |
| Generator produces incoherent graphs that the authoring UI can't fix | Med | High | Validation-repair pass + mandatory human review step + "regenerate all" button always available |
| React Flow perf on 40-node graphs | Med | Med | Perf subagent review at Phase 4A; virtualization + memoization; fallback = cap generator output at 25 nodes |
| Scaleway llama-3.1-70b can't reliably emit structured JSON for stage D wiring | Med | High | Measure at integration-test time; fallback = use a smaller JSON schema in stage D (fewer fields per edge) and rely on the validator to fill gaps |
| Polish output quality drops at temperature 0.9 in stage A | Med | Med | Integration test includes a Polish-fluency scan (no English bleed); fallback = temperature 0.7 with a "make it more creative" retry |

## Rollback Strategy

- Phase 0 is the only irreversible phase (it deletes real code). After
  Phase 0 lands on main, rollback is `git revert <phase-0-commit>` +
  cherry-pick subsequent phases back on a branch if we want to reattempt.
- Phases 1–7 each ship as independent commits on a single branch
  (`feat/session-graph-director`). Each phase can be reverted independently.
- The prod Redis wipe script (`scripts/wipe-prod-sessions.ts`) is a
  one-shot; no "rollback" because there's nothing left to restore.
  Intended deployment order: (1) deploy the Phase 0 code, (2) run wipe
  script, (3) deploy Phase 1+ code. Sessions created between step 1 and
  step 3 will be visible on step-1 code but invalid on step-3 code;
  acceptable for a personal project with no real users.

## File Ownership Summary (post-amendments)

Phase 0 and Phase 1 land as one atomic commit (Amendment F), so the
"Phase" column lists "0+1" for files touched by both.

| File | Phase | Change Type |
|---|---|---|
| `src/lib/schemas/session.ts` | 0+1 | Modify in place (wipe reactive model, write graph model in one diff) |
| `src/lib/schemas/session-brief.ts` | 0+1 | Create |
| `src/lib/schemas/session-graph.ts` | 0+1 | Create |
| `src/lib/state/server/session-store.ts` | 0+1 | Modify — interface + helpers only (Amendment A) |
| `src/lib/state/server/in-memory-session-store.ts` | 0+1 | Create — extracted from former session-store.ts (Amendment A) |
| `src/lib/state/server/redis-session-store.ts` | 0+1 | Modify in place (new interface impl) |
| `src/lib/state/server/store-factory.ts` | 0+1 | Modify (import from new in-memory file) |
| `src/lib/orchestration/resolve-interaction.ts` | 0 | Delete |
| `src/lib/orchestration/narrate-scene.ts` | 0 | Delete |
| `src/lib/orchestration/optimize-input.ts` | 0 | Delete |
| `src/lib/orchestration/summarize-deadlock.ts` | 0 | Delete |
| `src/lib/orchestration/graph/*` | 0 | Delete (old LangGraph scaffold; new one lives under `director/graph/`) |
| `src/lib/orchestration/generate-session.ts` | 2 | Create |
| `src/lib/prompts/session-generator/*` | 2 | Create (6 files: one per stage) |
| `src/lib/orchestration/director/ink.ts` | 3 | Create — flat helpers, Amendment C (replaces former `ink/ink-runtime.ts` + `ink/compile-graph.ts`) |
| `src/lib/orchestration/director/render-ink.ts` | 3 | Create |
| `src/lib/orchestration/director/director.ts` | 3 | Create — entry + LangGraph assembly + inlined `classifyMove` (Amendment D, replaces former `moves.ts`) |
| `src/lib/orchestration/director/graph/state.ts` | 3 | Create — LangGraph state annotation |
| `src/lib/orchestration/director/graph/nodes.ts` | 3 | Create — LangGraph node functions |
| `src/lib/orchestration/director/player-input-bridge.ts` | 3 | Create |
| `src/lib/orchestration/director/npc.ts` | 5 | Create — NPC router + initiative + combat-rolled resolution (Amendments D + R: single-strike per turn, MAP deferred) |
| `src/lib/orchestration/director/endings.ts` | 6 | Create — ending selector + `pickEndingByCategory` helper (Amendments D + E + M: no VP; defeat/tpk category required) |
| `src/lib/orchestration/director/pf2e-statblock-validator.ts` | 2 | Create — Amendment Q: deterministic range-check of generated stat blocks vs GMG Table 2-5 |
| `src/lib/orchestration/director/pf2e-creature-build-table.json` | 2 | Create — Amendment Q: OGL creature build table levels -1..20 (AC / HP / to-hit / damage ranges) |
| `src/components/play/party-split-banner.tsx` | 5 | Create — Amendment P §3.5.1: blocks director calls when party split flag is set |
| `src/components/authoring/confidence-badge.tsx` | 4 | Create — Amendment U: surfaces generator confidence score from validator warnings |
| `src/app/api/interaction/*` | 0 | Delete |
| `src/app/api/sessions/[id]/override/route.ts` | 0 | Delete |
| `src/app/api/sessions/[id]/generate/route.ts` | 2 | Create |
| `src/app/api/sessions/[id]/graph/route.ts` | 4 | Create |
| `src/app/api/sessions/[id]/nodes/[nodeId]/regenerate/route.ts` | 4 | Create |
| `src/app/api/sessions/[id]/validate/route.ts` | 4 | Create |
| `src/app/api/sessions/[id]/approve/route.ts` | 4 | Create |
| `src/app/api/director/route.ts` | 5 | Create |
| `src/app/sesja/[id]/page.tsx` | 0, 5 | Modify (Phase 0 stub, Phase 5 rewrite to PlayShell) |
| `src/app/sesja/[id]/przygotowanie/page.tsx` | 4 | Create |
| `src/components/interaction/player-input-console.tsx` | 0 | Delete (god module, 629 LOC) |
| `src/components/authoring/*` | 4 | Create — feature dir: shell, canvas, inspector, toolbar, README |
| `src/components/play/*` | 5, 6 | Create — feature dir: shell, feed, choice pane, switcher, clock tracker, pending roll, ending screen, README |
| `src/components/sessions/new-session-wizard.tsx` | 0+1 | Modify (add SessionBrief fields: party size, level, duration, tone, setting, character hooks) |
| `package.json` | 2, 3, 4 | Modify (add runtime: `inkjs`, `reactflow`, `elkjs`, `web-worker`, `@asteasolutions/zod-to-openapi`; add dev: `promptfoo`, `vitest-evals`, `autoevals`, `@arizeai/openinference-instrumentation-langchain`, `@opentelemetry/sdk-node`, `@opentelemetry/exporter-otlp-grpc`, `@opentelemetry/sdk-trace-node`, `msw`; **reuse existing `@langchain/langgraph` pin** — Amendment G) |
| `.vscode/extensions.json` | 0+1 | Create — Amendment V: commit `ephread.ink` (Ink syntax + diagnostics via inklecate), plus standard VSCode recommendations for this stack |
| `.claude/settings.json` | 0+1 | Create — commits `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` so every contributor gets Agent Teams workflow by default |
| `.claude/agents/ttrpg-gm-expert.md` | 0+1 | Create — domain-authority agent for PF2e + GM craft consultation, see top of plan |
| `.github/workflows/prompt-eval.yml` | 2 | Create — promptfoo GitHub Action wiring, runs on changes under `src/lib/prompts/session-generator/**` |
| `promptfooconfig.yaml` + `src/lib/prompts/session-generator/*.eval.yaml` | 2 | Create — declarative eval configs per generator stage |
| `scripts/wipe-prod-sessions.ts` | 0 | Create (one-shot, delete after use) |
| `src/tests/*` | 0, 7 | Delete (~20 files) then Create (~17 files — smaller post-consolidation) |

**Post-MVP explicitly out of scope (documented deferrals):**
- PF2e Victory Points subsystem (Amendment E)
- **Full PF2e 3-action economy + MAP** (Amendment R). MVP runs
  `combat-rolled` as single-strike-per-turn. Product marketing must
  describe combat as "PF2e-flavored narrative combat", never "full
  PF2e combat". Full 3-action support is a known post-MVP phase with
  its own schema extension + UI for action selection.
- **Party-split autonomous play** (Amendment P §3.5.1). MVP shows a
  banner + blocks director calls on party split. True multi-cursor
  director is post-MVP.
- **Multi-device, multi-browser live sync** (Q7 deferral)
- **Streaming narration** (Phase 2 / Phase 5 UX polish)
- **Per-PR preview environments** (carry-over from 2026-04-10 plan)
- **Expanded regen granularity** — the authoring UI regen-at-level
  (Amendment S) ships node/front/clock/NPC/all. Regen at the level
  of individual edges, predicates, or effects is post-MVP.
- **Trust-score LLM self-critique** (Amendment U delivers the validator
  score but not the LLM self-rating).

---

## Open questions / flagged uncertainties

These are items where the plan makes an opinionated choice but the
implementer should flag if reality differs:

1. **Stage D (wiring) LLM reliability.** If the integration test in Phase 2
   shows llama-3.1-70b struggles to emit graph-correct edges, we may need
   to split wiring into "skeleton edges" (deterministic from scene order)
   + "conditional edges" (LLM). Flagged, not blocking.
2. **Free-text player input bridge.** Whether to use embedding similarity
   or pure LLM routing for matching free text to choices. Embeddings are
   faster (sub-100ms) but require bge-multilingual for Polish. LLM routing
   is slower (~2s) but more flexible. MVP: LLM routing. Revisit after
   real play sessions reveal the latency vs flexibility trade-off.
3. **Multi-user live sync.** Q7 answer was "multiple humans one browser",
   but the long-term answer is probably "multiple devices, one session".
   That requires websockets, presence, CRDT or optimistic-locking edits.
   Explicitly out of scope for this plan; note as the most likely next
   phase after Phase 6.
4. **~~Victory Points vs Impending Doom priority~~** — resolved by
   Amendment E: VP cut from MVP. Endings use clock-filled + flag-set
   predicates only. If playtests demand richer ending conditions,
   restore VP as a follow-up feature with its own schema field.
5. **StoryDNA slider influence.** The current sliders (`narrativePacing`,
   `tacticalLethality`, `npcImprov`) must somehow influence Phase 2
   generation. Proposed: inject them as prompt context in each stage
   (e.g., `tacticalLethality=85 → favor combat-rolled over combat-narrative`).
   Not yet specified in detail — flagged for Phase 2 implementer.
