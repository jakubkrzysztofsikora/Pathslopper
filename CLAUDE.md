# Pathslopper — Agent & Skill Playbook

This repo ships a curated `.claude/` toolkit of subagents and skills. The goal is
that any non-trivial task flows through a **Plan → Build → Test → Ship** loop
with the right specialist at each step, rather than one generalist trying to do
everything.

## The standard loop

```
┌─────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ 1. Context  │──▶│  2. Plan     │──▶│  3. Build    │──▶│  4. Verify   │
│  (gather)   │   │  (spec+TDD)  │   │  (implement) │   │  (test+ship) │
└─────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
       │                 │                   │                   │
  context-manager  workflow-orchestrator  *-developer/       tdd-orchestrator
  conductor:       tdd-orchestrator       *-architect        test-automator
  context-driven-  workflow-patterns      scaleway-          qa-expert
  development      (skill)                specialist         code-reviewer
  (skill)                                 terraform          architect-reviewer
                                          (skill)            webapp-testing
                                                             (skill)
```

## Phase 1 — Context

**Goal:** understand the code, product, stack, and constraints before touching anything.

- **`context-manager` agent** — call first on any non-trivial feature. Most of
  the VoltAgent subagents expect a `context-manager` to have primed them.
- **`context-driven-development` skill** — scaffolds `conductor/product.md`,
  `conductor/tech-stack.md`, `conductor/workflow.md`, `conductor/tracks.md` for
  project-level context artifacts. Use on greenfield or when the repo has no
  clear spec.

## Phase 2 — Plan

**Goal:** turn intent into a concrete, checkpointed plan with tests described first.

- **`workflow-orchestrator` / `agent-organizer`** — break a feature into a DAG
  of tasks and decide which specialists own which steps.
- **`workflow-patterns` skill** — the Conductor TDD workflow: phase checkpoints,
  per-task git commits, and verification gates.
- **`tdd-orchestrator`** — owns red-green-refactor discipline. Call it BEFORE
  you start writing implementation code so failing tests get written first.
- **`architect-reviewer` / `microservices-architect`** — for anything that
  crosses service boundaries or introduces a new component. Review the plan,
  not the code, at this phase.
- **`prompt-engineer` / `llm-architect`** — if the feature involves calling
  Claude or another LLM, design the prompt and system shape here, not later.

## Phase 3 — Build

**Goal:** implement against the failing tests from Phase 2.

Pick the builder(s) by domain:

| Domain | Agent / Skill |
|---|---|
| REST/GraphQL APIs, services | `backend-developer`, `microservices-architect` |
| React / Vue / Angular UI | `frontend-developer`, `frontend-design` (skill) |
| Visual design & design systems | `ui-designer`, `brand-guidelines` (skill) |
| End-to-end features | `fullstack-developer` |
| LLM features (Claude SDK, tool use, RAG) | `claude-api` (skill), `ai-engineer`, `llm-architect` |
| MCP servers / tools | `mcp-builder` (skill) |
| Terraform / IaC | `terraform` (skill), `terraform-style-guide` (skill), `terraform-engineer` |
| Scaleway infra | `scaleway-specialist` |
| CI/CD pipelines, GitHub Actions | `deployment-engineer`, `devops-engineer` |
| Multi-cloud | `cloud-architect` |

**Rule:** builders must make Phase 2's failing tests pass without modifying
those tests. If a test needs to change, loop back to Phase 2.

## Phase 4 — Verify

**Goal:** prove the build is correct, accessible, performant, and safe.

- **`tdd-orchestrator`** — confirms the red-green-refactor cycle closed cleanly.
- **`test-automator` / `qa-expert`** — expands coverage beyond the initial
  TDD tests: integration, edge cases, regression.
- **`webapp-testing` skill** — Playwright-based browser verification for any
  web UI change. Use to capture screenshots and confirm interactive behavior.
- **`accessibility-tester`** — WCAG review for any UI change.
- **`code-reviewer`** — final line-by-line review. Gate before commit.
- **`architect-reviewer`** — revisit if the implementation drifted from the
  Phase 2 plan.
- **`debugger`** — call when Phase 4 surfaces failures.

## Phase 5 — Ship

**Goal:** get the verified build running on Scaleway infrastructure via
GitHub Actions, reusing the same Terraform module for feature-branch
previews (`dev`) and production (`prod`).

- **`scaleway-specialist`** — owns the Scaleway resource topology
  (Serverless Containers, Container Registry, Secret Manager, IAM
  applications, Object Storage for Terraform state). All resources live
  in `infra/terraform/`.
- **`deployment-engineer` / `devops-engineer`** — owns the GitHub Actions
  workflows in `.github/workflows/` (`ci.yml`, `deploy-dev.yml`,
  `deploy-prod.yml`). CI runs lint + typecheck + test + build + Terraform
  fmt/validate on every push. Deploys build a linux/amd64 image, push it
  to Scaleway Container Registry, and `terraform apply` against a workspace
  (`dev` or `prod`).
- **`terraform-engineer` + `terraform` skill** — for infra/terraform/
  changes. Follow the HashiCorp style guide and keep modules small.
- State backend is the Scaleway Object Storage bucket
  `pathfinder-nexus-tfstate` (S3-compatible). Bootstrap with
  `./infra/terraform/scripts/bootstrap-tfstate.sh` before the first init.
- State locking is serialized via GitHub Actions environment +
  concurrency groups, since Scaleway Object Storage does not support
  DynamoDB-style locking.
- The `dev` environment is shared across feature branches (Option A from
  the deployment-engineer plan). Per-PR ephemeral environments are a
  post-MVP upgrade.

## LLM provider

The runtime LLM provider is **Scaleway Generative APIs** (OpenAI-compatible
`/chat/completions` endpoint). A single Scaleway IAM application API key
per environment, minted by Terraform and scoped to
`GenerativeApisFullAccess`, is the only credential the container holds.
No `ANTHROPIC_API_KEY`, no external provider dependency.

Model selection is env-var driven, not code-driven:

| Env var | Default | Purpose |
|---|---|---|
| `LLM_BASE_URL` | `https://api.scaleway.ai/v1` | OpenAI-compatible endpoint |
| `LLM_TEXT_MODEL` | `llama-3.1-70b-instruct` | GM prompt chains, input optimizer |
| `LLM_VISION_MODEL` | `pixtral-12b-2409` | Character-sheet VLM route |
| `LLM_API_KEY` | (secret) | Scaleway IAM API key, injected by Secret Manager |

Swapping to a self-hosted model (e.g., Bielik via Scaleway Managed
Inference for Polish-first reasoning) is a Terraform variable change, not
a code deploy.

## Defaults & conventions

1. **Never skip Phase 2.** Even a tiny bug fix should describe the failing test
   before the fix lands.
2. **Commit per task.** `workflow-patterns` and `tdd-orchestrator` both expect
   small, verifiable commits — one per green test.
3. **Context-manager is not optional** for multi-file changes. The VoltAgent
   subagents will ask for it by name if you skip it.
4. **Use skills over ad-hoc prompts** for Terraform, Claude SDK work, MCP
   servers, and web UI generation — the skills encode battle-tested defaults
   that raw prompting misses.
5. **Model tiers in the installed agents:**
   - `opus` — planning, architecture, TDD orchestration, code review
   - `sonnet` — building (frontend, backend, fullstack, LLM, infra)
   - `haiku` — focused linting and deployment tasks
   These are set in each agent's frontmatter; override per invocation only
   when you have a reason.
6. **State boundary invariant (Pathfinder Nexus).** The client owns
   *authoring state* (Story DNA, form inputs, UI mode). The server owns
   *session and episodic memory* (future RedisVL / Pinecone stores). Story
   DNA is always shipped to the server as a POST payload — it is never
   mirrored into a server-side cache for convenience. When the stateful
   interaction loop (Narration → Optimization → Adjudication → Resolution)
   lands, its world-state hash and episodic memory belong in a server-owned
   store, not in zustand. Do not cross this boundary to simplify a feature.
7. **Orchestration lives in `src/lib/orchestration/`, not in API routes.**
   Next.js route handlers should be thin HTTP adapters that validate input,
   call an orchestrator from `src/lib/orchestration/`, and serialize the
   result. Multi-stage prompt chains, retry policies, and RAG context
   assembly all belong in the orchestration layer so LangGraph can take
   ownership later without rewriting routes.

## Inventory

### Skills (`.claude/skills/`)

| Skill | Source | Purpose |
|---|---|---|
| `frontend-design` | anthropics/skills | Production-grade web UI generation |
| `brand-guidelines` | anthropics/skills | Consistent brand look & feel |
| `webapp-testing` | anthropics/skills | Playwright-based UI testing |
| `claude-api` | anthropics/skills | Building LLM apps with Anthropic SDK |
| `mcp-builder` | anthropics/skills | Building MCP servers / tools |
| `context-driven-development` | wshobson/agents (conductor) | Project context scaffolding |
| `workflow-patterns` | wshobson/agents (conductor) | TDD workflow + checkpoints |
| `terraform` | antonbabenko/terraform-skill | Terraform/OpenTofu best practices |
| `terraform-style-guide` | hashicorp/agent-skills | HashiCorp HCL style guide |

### Agents (`.claude/agents/`)

**Planning & orchestration:** `context-manager`, `workflow-orchestrator`,
`agent-organizer`

**Architecture & review:** `microservices-architect`, `architect-reviewer`,
`code-reviewer`

**Builders:** `backend-developer`, `frontend-developer`, `fullstack-developer`,
`ui-designer`

**Quality & testing:** `tdd-orchestrator`, `test-automator`, `qa-expert`,
`debugger`, `accessibility-tester`, `ux-researcher`

**LLM / AI:** `ai-engineer`, `llm-architect`, `prompt-engineer`, `nlp-engineer`

**Infrastructure:** `terraform-engineer`, `devops-engineer`,
`deployment-engineer`, `cloud-architect`, `scaleway-specialist`

## Environment & secrets

This repository has the following Scaleway credentials pre-configured as
environment variables / CI secrets. Agents and skills (Terraform provider,
`scw` CLI, any S3 SDK against Scaleway Object Storage) should rely on these
rather than prompting the user for credentials or hardcoding values:

| Variable | Purpose |
|---|---|
| `SCW_ACCESS_KEY` | Scaleway API access key (IAM) |
| `SCW_SECRET_KEY` | Scaleway API secret key (IAM) — treat as sensitive, never echo |
| `SCW_DEFAULT_ORGANIZATION_ID` | Default organization ID used by `scw` and the Terraform provider |
| `SCW_DEFAULT_PROJECT_ID` | Default project ID — Scaleway resources land here unless overridden |
| `SCW_DEFAULT_REGION` | Default region (e.g. `fr-par`, `nl-ams`, `pl-waw`) for region-scoped resources |
| `SCW_DEFAULT_ZONE` | Default availability zone (e.g. `fr-par-1`) for zone-scoped resources |

Rules:

1. **Do not add these keys to example `.tf`, `.env`, or docs files.** The
   `scaleway/scaleway` Terraform provider and the `scw` CLI both read them
   from the environment automatically; leave `provider "scaleway" {}` empty
   or only set non-secret overrides.
2. **Do not print their values** in command output, logs, or commit messages.
   When you need to reference a variable, use its name only.
3. **Terraform state on Scaleway Object Storage** should reuse these
   credentials via the S3 backend's `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`
   env-var shim (or the `access_key` / `secret_key` backend arguments sourced
   from the SCW equivalents) — never inline the secrets in `backend "s3" {}`.
4. **Region/zone overrides** — if a task explicitly targets a different
   region or zone, pass it as a resource-level argument; don't mutate
   `SCW_DEFAULT_REGION` / `SCW_DEFAULT_ZONE` for the whole session.

## Sources

- [anthropics/skills](https://github.com/anthropics/skills) — official Anthropic skills
- [VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) — 100+ community subagents
- [wshobson/agents](https://github.com/wshobson/agents) — Conductor & TDD workflow plugins
- [antonbabenko/terraform-skill](https://github.com/antonbabenko/terraform-skill) — community Terraform skill
- [hashicorp/agent-skills](https://github.com/hashicorp/agent-skills) — official HashiCorp skills
