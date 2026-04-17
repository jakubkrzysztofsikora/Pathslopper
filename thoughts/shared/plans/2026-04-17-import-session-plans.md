---
date: 2026-04-17
branch: claude/plan-narration-pipeline-x2L47
status: shipped (Phases 1-7 merged; Phase 8 E2E deferred)
---

# Plan: Import existing session plans

## Context

Pathslopper generates a `SessionGraph` from scratch via a six-stage LLM
pipeline. Many GMs already have session notes written in Obsidian,
gists, the Sly Flourish Lazy-DM template, or Notion exports; forcing
them to discard that prep and re-prompt is wasteful. This plan adds an
**import** path alongside generate: the user pastes Markdown, the tool
parses it into the same SessionGraph shape, and the GM edits the graph
before approving.

Research via ttrpg-gm-expert confirmed that Markdown is the dominant
GM-prep format in 2024-2026 (Obsidian, GitHub gists, Sly Flourish
template, Notion). Foundry/Roll20 exports are VTT world-state, not
session plans. PDF adventure modules are IP-encumbered and deferred.

## Architecture

```
Markdown paste  →  parseMarkdownToSections  →  six extract-or-fill LLM stages
                   (gray-matter + marked)       (reuses existing generator prompts
                                                 prefixed with extract-or-fill
                                                 instructions, response schemas
                                                 extended with synthesizedPaths)
                   ↓
                   assembleGraph  →  SessionGraphSchema.safeParse  →  Ink compile
                   (shared with generate,        single-shot LLM repair on failure
                    extracted to
                    generate-session-assembler)
                   ↓
                   graph.provenance.synthesized  +  warnings + pendingConsent
                   ↓
                   setGraph → phase=authoring → /sesja/:id/przygotowanie
```

All orchestration lives in `src/lib/orchestration/import/`. Route
handlers are thin adapters per the CLAUDE.md orchestration rule.

## Format

**Markdown only** (one format, two tiers):

- **Primary**: any Markdown doc parsed fuzzily by the LLM.
- **Fast deterministic path**: docs matching the Sly Flourish 8-step
  heading shape skip the LLM extract stages (not yet wired — flag
  reserved via `isLazyDmExact`).
- **YAML frontmatter** (optional): `system`, `party_level`, `party_size`,
  `duration_hours`, `title`, `tags` are pre-parsed deterministically and
  populate the brief.

Bilingual heading aliases (EN + PL) are seeded in the parser; the LLM
handles exotic variations. Recognised: Strong Start / Otwarcie, Scenes /
Sceny, Secrets and Clues / Sekrety, Locations / Lokacje, NPCs / BNi,
Monsters / Potwory, Treasure / Skarb, Clocks / Zegary, Fronts / Fronty,
Endings / Zakończenia.

Explicitly out of scope in v1: Foundry `.fvttadv`, Roll20 JSON, PDF
modules, Homebrewery tokens.

## Amendment W — Informational pending-consent + provenance review

The Lazy-DM template does not author clocks, fronts, or endings.
Research flagged that silently fabricating them and handing the GM a
graph they didn't write is bad domain practice. In v1 the orchestrator
always synthesises missing sections and returns a
`pendingConsent: {clocks, fronts, endings}` flag whenever a section
was absent from the source. The API surfaces those flags so the UI
can warn the GM that those sections were invented. Every synthesised
field is also tagged in `graph.provenance.synthesized` so the editor
renders a `SynthesizedBadge` next to it for targeted GM review.
A real two-round consent handshake (don't run LLM stages for
clocks/fronts/endings until GM explicitly consents) is scoped for v2 —
v1 intentionally exposes no `consent` input to avoid a misleading API.

## Amendment X — Provenance tracking

`graph.provenance.synthesized` (optional on SessionGraph) records
`{entityId: [fieldPaths]}` for every field the LLM invented rather
than extracted. `["*"]` marks a fully-synthesised entity. The editor's
SynthesizedBadge renders next to any flagged field; editing the field
removes its path from the map, so the badge clears as the GM reviews.

## Phases shipped

| Phase | Commit | What |
|-------|--------|------|
| 1 | `a25491b` | `ProvenanceSchema` + optional field on `SessionGraphSchema` |
| 2 | `0c962e3` | `parseMarkdownToSections` + `isLazyDmExact` (gray-matter + marked) |
| 3 | `1567670` | `extendWithSynthesizedPaths`, `EXTRACT_OR_FILL_PREFIX_PL`, `formatImportedSections`, `buildImportChain` |
| 4 | `9838546` | `importSession` orchestrator + `assembleGraph` extracted to shared module |
| 5 | `d406f6f` | `POST /api/sessions/[id]/import` with re-import confirm gating |
| 6 | `c13e589` | `SynthesizedBadge` + NodeInspector wiring + provenance-clearing on edit |
| 7 | `fa5b565` | `ImportStep` + `/sesja/nowa/import` page + wizard discovery link |

## Phase 8 — Deferred

Full Playwright E2E (`import-flow.test.ts`) is not shipped in this branch.
Unit + integration coverage holds the line: 503 passing. Follow-up PR
can add the browser smoke test (paste fixture → consent → editor → badge
clear → approve) when Playwright mocks for Scaleway LLM are in place.

## Verification

```bash
npx vitest run           # 503 passing, 6 skipped
npx tsc --noEmit         # clean
```

Manual smoke (requires dev server + Scaleway key):

- Paste Sly Flourish fixture → land in editor → clocks/fronts/endings
  flagged as synthesised.
- Paste a recap-only doc → "looks-like-recap" warning.
- Paste "Pathfinder Society" text → "paizo-ip" disclosure banner.
- Edit a synthesised scene prompt → badge clears on save.
- Re-import over an authoring session without `?confirm=overwrite` →
  409 with preview; retry with confirm → overwrite.
