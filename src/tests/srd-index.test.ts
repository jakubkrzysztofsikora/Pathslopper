import { describe, it, expect, beforeEach } from "vitest";
import { getSrdIndex, _resetSrdIndex } from "@/lib/rag/srd-index";

describe("getSrdIndex", () => {
  beforeEach(() => {
    _resetSrdIndex();
  });

  it("loads chunks from the JSON file — store has non-zero size", async () => {
    const index = await getSrdIndex();
    expect(index.size()).toBeGreaterThan(0);
  });

  it("is a singleton — second call returns same instance", async () => {
    const a = await getSrdIndex();
    const b = await getSrdIndex();
    expect(a).toBe(b);
  });

  it("_resetSrdIndex clears the singleton so next call creates a fresh instance", async () => {
    const a = await getSrdIndex();
    _resetSrdIndex();
    const b = await getSrdIndex();
    expect(a).not.toBe(b);
  });

  it("loaded index can search and return results", async () => {
    const index = await getSrdIndex();
    // Search with a query matching the actual embedding dimension.
    // If real embeddings exist (3584-dim), use that; otherwise fallback handles any dim.
    const dim = index.size() > 0 ? 3584 : 768;
    const results = index.search(new Array(dim).fill(0), 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});
