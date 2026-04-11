# Generator stage fixtures

Hand-authored canonical JSON fixtures for the six-stage session
generator pipeline. One file per stage (`stage-a` through `stage-f`).
Loaded by `src/tests/generate-session.test.ts` to exercise the
orchestrator end-to-end with a mocked `callLLM`.

## Source

Hand-authored. **Not captured from real model output.** The whole
point is that these fixtures are stable, schema-tuned, and do not
drift when the LLM's phrasing shifts. Stage outputs are sized at the
minimums required by `SessionGraphSchema` (8 nodes, 2 clocks, 1
front, 6 secrets, 2 endings, 3 NPCs, 2 locations) so the fixture
stays small while still satisfying all `.min()` bounds and every
`.superRefine()` cross-reference check from `session-graph.ts`.

## Invariant

When `src/lib/schemas/session-graph.ts` or its amendments tighten,
these fixtures **must be re-tuned in the same commit** that tightens
the schema. A failing `generate-session.test.ts` "happy path" test
after a schema change is the signal that these files need a touch.

Do not loosen the schema to accommodate stale fixtures; fix the
fixtures. The schema is authoritative.

## Stage F note

`stage-f.json` returns `statBlocks: {}` (empty) on purpose — stat
block correctness is exercised by the dedicated
`pf2e-statblock-validator.test.ts`, not by the pipeline test.
Separating those concerns keeps the pipeline test focused on
orchestration (retry, validation repair, assembly) and keeps the
validator test focused on mechanical clamping. Phase 2B's integration
test (against real Scaleway LLM) should use a non-empty Stage F
fixture since it cannot mock the validator out.

## Ownership

These fixtures live in `src/tests/fixtures/generate-session/` per the
plan's §3 "Fixtures" section (Local testing strategy). They are
committed to git. They are not test-owned scratch space.
