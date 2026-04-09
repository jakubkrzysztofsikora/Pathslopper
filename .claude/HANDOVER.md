# Pathfinder Nexus — Session Handover

**Read this first on session start.** It captures the state of the project at the end of the previous Claude Code session so a fresh session can resume without re-reading the full conversation history.

## Boot sequence for a new session

1. Read this file (`.claude/HANDOVER.md`) — you are here.
2. Read `CLAUDE.md` for the project conventions (state boundary, orchestration rule, LLM provider, persistence, phase playbook, agent inventory).
3. `git status && git log --oneline -15 && git branch --show-current` to confirm the branch and commit state below.
4. Run the verification gate to confirm the repo is healthy:
   ```bash
   ./node_modules/.bin/vitest run
   ./node_modules/.bin/tsc --noEmit
   ./node_modules/.bin/next lint
   ./node_modules/.bin/next build
   ```
   Expected: 205/205 tests, tsc clean, lint clean, build clean, 7 API routes listed.
5. If the user asked about PR status or CI, check PR **jakubkrzysztofsikora/Pathslopper#2** via the `mcp__github__pull_request_read` tool (`get`, `get_check_runs`, `get_review_comments`). The PR is the canonical surface for review feedback on the whole working branch.

## Current state snapshot

| Field | Value |
|---|---|
| Working branch | `claude/pathfinder-nexus-gm-4q4ji` |
| Base branch | `main` |
| Open PR | `jakubkrzysztofsikora/Pathslopper#2` |
| LLM provider | Scaleway Generative APIs (OpenAI-compatible) |
| Session store | `RedisSessionStore` when `REDIS_URL` set, `InMemorySessionStore` otherwise |
| Test count | 205 across 27 files |
| Build output | Next.js 14 standalone, 7 API routes, landing page ~35 kB / 122 kB First Load JS |
| Infra state | Single prod environment on Scaleway; one-time bootstrap done via GHA |

## Where things live

| Concern | File(s) |
|---|---|
| Project conventions | `CLAUDE.md` |
| Infra topology | `infra/terraform/README.md`, `infra/terraform/main.tf` |
| CI / deploy | `.github/workflows/ci.yml`, `deploy.yml`, `bootstrap-tfstate.yml` |
| Container runtime | `Dockerfile`, `next.config.mjs` (`output: 'standalone'`) |
| LLM client | `src/lib/llm/client.ts` (Scaleway Generative APIs fetch wrapper, 60s timeout) |
| Schema kernel (Zod) | `src/lib/schemas/{version,story-dna,character-sheet,zone,player-intent,adjudication,session}.ts` |
| Dice engine | `src/lib/dice/roll.ts` |
| Prompts | `src/lib/prompts/{banned-phrases,zone-generator,character-sheet-vlm,input-optimizer,narrator,system/gm-core}.ts` |
| Orchestrators | `src/lib/orchestration/{generate-zone,optimize-input,adjudicate,resolve-interaction,narrate-scene}.ts` |
| Session store | `src/lib/state/server/{session-store,redis-session-store,redis-client,store-factory}.ts` |
| Client state | `src/lib/state/story-dna-store.ts` (zustand, CLIENT only) |
| API routes | `src/app/api/{health,character-sheet,zones/generate,interaction/resolve,interaction/narrate,sessions,sessions/[id]}/route.ts` |
| UI | `src/components/{version-picker,story-dna/*,character-sheet/uploader,zones/zone-generator-panel,interaction/player-input-console,ui/*}.tsx` |
| Landing page | `src/app/page.tsx` composes: VersionPicker → StoryDNAConfig → CharacterSheetUploader → ZoneGeneratorPanel → PlayerInputConsole |

## Architecture invariants (DO NOT VIOLATE)

These are encoded in `CLAUDE.md` but restated here so a new session gets them immediately:

1. **State boundary.** The client owns *authoring state* (Story DNA, form inputs, UI mode) in zustand. The server owns *session and episodic memory* in the `SessionStore` (Redis in prod, in-memory fallback). Story DNA is shipped to the server as a POST payload — it is never mirrored into a server-side cache.
2. **Orchestration location.** Multi-stage prompt chains, retry policies, RAG context assembly, and all LLM call orchestration live in `src/lib/orchestration/`. Next.js route handlers are thin HTTP adapters: validate input → call an orchestrator → serialize. Do not add stage logic to a route handler.
3. **Schema kernel placement.** Zod schemas in `src/lib/schemas/` are imported by both client components and API routes. They are the single source of truth for shapes. Widen them only with explicit reason; prefer `.min(1).max(...)` on strings and `.int().finite()` on numbers.
4. **LLM provider is env-var driven.** `LLM_BASE_URL`, `LLM_TEXT_MODEL`, `LLM_VISION_MODEL`, `LLM_API_KEY` — no provider is hardcoded. Swap to Managed Inference / Bielik by changing Terraform variables, not code.
5. **Anti-sycophancy + slop filter.** Every user-facing LLM call must inherit `ANTI_SYCOPHANCY_CLAUSE` (`src/lib/prompts/system/gm-core.ts`) and run `scanBannedPhrases` on its output. Zone and narration outputs both do.
6. **Server-side route boundary.** Anything in `src/lib/state/server/` is server-only. Never import it from a client component. The `getSessionStore()` factory is the single entry point.

## Plan status

| Phase | Tranche | Status | Notes |
|---|---|---|---|
| 3 Build | Story DNA (version picker, sliders, slop filter) | DONE | |
| 3 Build | VLM character-sheet route + uploader UI | DONE | |
| 3 Build | Tactical Zone Generator (Polish → English → verify) | DONE | |
| 3 Build | Stateful Loop Phase 2 (Input Optimization) | DONE | |
| 3 Build | Stateful Loop Phase 3 (Adjudication + dice engine) | DONE | |
| 3 Build | Stateful Loop Phase 1 (Narration) | DONE | |
| 3 Build | Stateful Loop Phase 4 (Resolution / session append) | DONE | |
| 4 Verify | Validator sweep (code / architect / a11y / qa) | DONE | |
| 4 Verify | P0 + P1 punch list (H1/H2/H3, M1-M5, a11y) | DONE | |
| 4 Verify | P2 orchestration extraction + component tests | DONE | |
| 4 Verify | Copilot + gemini PR review fixes | DONE (this session) | |
| 5 Ship | Scaleway topology + Terraform module | DONE | `infra/terraform/` |
| 5 Ship | GitHub Actions CI + Deploy + Bootstrap | DONE | `.github/workflows/` |
| 5 Ship | Provider swap (Anthropic → Scaleway Generative APIs) | DONE | |
| 5 Ship | RedisVL persistence (Managed Redis + store swap) | DONE | |
| 5 Ship | Node.js 24 action opt-in | DONE | |

### Not yet done — in rough priority order

1. **HITL Manager Mode / Break the Fourth Wall** — deadlock summariser + force-outcome UI. Completes the player-facing loop surface. Medium-small, UI-heavy.
2. **Character roster persistence** — parsed character sheets currently render once then evaporate. Wire them into a per-session character list on the server side so the adjudicator can look up modifiers automatically instead of requiring the player to type them.
3. **SRD RAG index** — vector store + Stage A augmentation. Layer 2 of the multi-layered verification stack from the original brief. Needs an embedding model choice (Scaleway has embeddings endpoints) + a vector store (RedisVL via redis-stack or Pinecone — Scaleway's managed Redis does not include the search module so we'd need a separate provisioning path).
4. **LangGraph rewrite** of the orchestrators. No behaviour change, better observability, unlocks parallel stages where the graph allows.
5. **Object Storage for character-sheet assets** — migrate base64 POST uploads to pre-signed PUT URLs against a Scaleway bucket. Cheaper and faster than shipping ~1 MB base64 through Next.js.
6. **Custom prod domain** — `scaleway_container_domain` + DNS. Waiting on a domain choice from the user.
7. **Playwright smoke test** via the `webapp-testing` skill. Post-deploy smoke that exercises the full Plan → Ingest → Generate → Resolve → Narrate flow against the real Serverless Container.

## Known follow-ups from PR reviews

| Severity | File | Issue | Status |
|---|---|---|---|
| HIGH | `src/lib/state/server/redis-session-store.ts:~95-135` | Read-modify-write on session keys is racy under concurrent writers to the same session ID. Fix needs Redis `WATCH`/`MULTI` or a Lua script. | **Deferred.** MVP is single-player so the exposure is zero; revisit when multi-client sessions become real. |
| SECURITY-MED | `src/app/api/zones/generate/route.ts` seed regex | Regex blocks control chars and backticks but plain-text injection like "Ignore prior instructions" passes through. Perfect defense impossible at the seed layer. | **Partially addressed** by the output-side banned-phrase scan + anti-sycophancy clause + structured stage separation. A stronger fix would wrap seeds in quoted delimiters in the prompt template and add output verification that the model didn't emit forbidden text. |
| INFO | `infra/terraform/main.tf` | Scaleway provider's `secret_environment_variables` does not support dynamic Secret Manager references — the values are literal strings stored in Terraform state. | **Documented** in the NOTE block in `main.tf` and in `infra/terraform/README.md`. The state bucket's bucket-owner-only ACL is the actual protection layer. Revisit if/when the provider adds a secret-reference primitive. |

## Deployment state (what to expect after infra is provisioned)

The following Scaleway resources should exist in the project at the time you read this:

- Object Storage bucket: `pathfinder-nexus-tfstate` (backs Terraform state)
- Container Registry namespace: `pathfinder-nexus`
- IAM application: `pathfinder-nexus-llm` + API key with `GenerativeApisFullAccess`
- Managed Redis cluster: `pathfinder-nexus-redis` (RED1-MICRO, TLS, public endpoint)
- Container namespace: `pathfinder-nexus`
- Serverless Container: `app`, running the image `rg.<region>.scw.cloud/pathfinder-nexus/app:<sha>`

Verify the deploy landed:

```bash
# From any machine with curl, using the container hostname Terraform output:
curl https://<container-hostname>/api/health
# => {"ok":true,"service":"pathfinder-nexus","uptime":<seconds>}
```

The container environment holds:

| Variable | Source |
|---|---|
| `LLM_API_KEY` | Terraform-minted IAM API key, injected via `secret_environment_variables` |
| `LLM_BASE_URL` | Terraform variable, default `https://api.scaleway.ai/v1` |
| `LLM_TEXT_MODEL` | Terraform variable, default `llama-3.1-70b-instruct` |
| `LLM_VISION_MODEL` | Terraform variable, default `pixtral-12b-2409` |
| `REDIS_URL` | Terraform-assembled `rediss://` URL, injected via `secret_environment_variables` |
| `NODE_ENV`, `PORT`, `HOSTNAME`, `NEXT_TELEMETRY_DISABLED` | Terraform static env vars |

`SCW_ACCESS_KEY` / `SCW_SECRET_KEY` are NEVER present in the container — only in CI.

## Immediate next tranche — pick one

The user's last stated direction before this handover was "now we deploy terraform state and infra then we come back with a clean session". The expected starting state is: **infra deployed, app reachable on the auto-generated Scaleway hostname**. On resume, ask which of these to execute:

### Option A — HITL Manager Mode (UI, small-medium)
Completes the player-facing loop surface from the original brief. Adds a "Break the Fourth Wall" button to `PlayerInputConsole` that summarises the last N resolved turns and lets the player force a specific outcome that overrides the next adjudication. Extends the session schema with a `ManagerOverrideTurn`. Good choice for fast visible progress.

### Option B — Character roster persistence (fullstack, medium)
Wires the parsed character sheets from the VLM uploader into the session store so the adjudicator can auto-populate `modifier` from `abilityScores[target] + proficiencyBonus` instead of requiring the player to type it. Adds `POST /api/sessions/:id/characters` and extends `AdjudicateOptions` with a `character` parameter. Gets real gameplay value out of the VLM pipeline.

### Option C — SRD RAG index (infra + orchestration, large)
Layer 2 of the multi-layered verification stack. Requires an embedding model choice, a vector store decision (RedisVL via redis-stack module, Pinecone, or Scaleway's own managed vector DB if available), and a Stage A augmentation pass. Biggest unlock for "deterministic game state" but the biggest scope. Defer until after one of A or B unless the user specifically asks.

### Option D — Post-deploy Playwright smoke via `webapp-testing` skill
Verifies the full flow end-to-end against the live Serverless Container. Not a feature, but high signal. Pair with option A or B for the same tranche.

## Recent commit trail (last 6)

```
<set at end of handover commit>  Address PR review + handover doc
91de005  RedisVL persistence + Node.js 24 action opt-in
d0d93ea  Close the Stateful Interaction Loop: Phase 1 (Narration) + Phase 4
5d737cf  Collapse to prod-only; add bootstrap-tfstate workflow
6dd062c  Ship tranche: Scaleway infra + Generative APIs swap + GHA CI/CD
86f21ca  Add Stateful Interaction Loop Phase 2 + Phase 3 slice
```

## Verification commands

Keep these handy:

```bash
# Fast loop (tests only)
./node_modules/.bin/vitest run

# Full gate
./node_modules/.bin/vitest run \
  && ./node_modules/.bin/tsc --noEmit \
  && ./node_modules/.bin/next lint \
  && ./node_modules/.bin/next build

# Single file
./node_modules/.bin/vitest run src/tests/<file>.test.ts

# Redeploy from the current HEAD
# (run in the GitHub Actions UI: Deploy workflow with workflow_dispatch,
# optionally passing a specific `ref` for rollback)
```

## Rules of engagement reminder

- Use subagents and Claude skills per `CLAUDE.md` phase playbook. Do not try to be a generalist.
- Commit per task; do not batch unrelated changes into one commit.
- Do not push directly to `main`. The working branch is `claude/pathfinder-nexus-gm-4q4ji` and it ships via PR #2.
- Do not introduce backwards-compatibility shims or dead abstractions. If something is unused, delete it.
- Every new LLM caller goes through `src/lib/llm/client.ts` — no direct `fetch` to model endpoints, no new SDK dependencies without a plan.
- Every new persistence touch goes through the `SessionStore` interface or its successor — do not open a second Redis connection or a second state layer without discussion.
- If you're subscribed to PR activity, investigate each incoming review comment: fix if small and confident, ask if ambiguous, skip if no action.
