---
date: 2026-04-11
phase: 2A-pre-implementation
---

# Coverage baseline — Phase 2A start

Captured before any Phase 2A files are written.

## Summary

| Metric     | Value  |
|------------|--------|
| Statements | 52.45% |
| Branches   | 74.54% |
| Functions  | 62.26% |
| Lines      | 52.45% |

Test suite: 27 files, 195 tests — all passing.

## Command

```
npm run test -- --run --coverage
```

## Notes

- Low statement/line coverage is dominated by untested infrastructure files:
  `redis-client.ts`, `redis-session-store.ts`, `s3-client.ts`, `embed.ts`,
  `client.ts` (LLM) — none of which exercise real network calls in vitest.
- `session-graph.ts` statements at 54.76% because the Predicate recursive type
  (`z.lazy`) and `superRefine` validator body are partially exercised.
- Business-critical orchestration code (`generate-zone.ts`) sits at 100%.
- Target for Phase 2A new code: ≥80% coverage on all new files.
