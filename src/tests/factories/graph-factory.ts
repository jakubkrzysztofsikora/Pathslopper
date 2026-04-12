import type { SessionGraph } from "@/lib/schemas/session-graph";
import { FIXTURE_GRAPH } from "@/tests/fixtures/session-graph";

/**
 * Creates a valid SessionGraph for use in tests.
 * Uses the canonical FIXTURE_GRAPH as the base; pass overrides to customise.
 */
export function makeGraph(overrides: Partial<SessionGraph> = {}): SessionGraph {
  const now = new Date().toISOString();
  return {
    ...FIXTURE_GRAPH,
    id: `test-graph-${Date.now()}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
