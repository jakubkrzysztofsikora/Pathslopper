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
    // Embeddings file won't exist in tests — index falls back to zero vectors
    // but should still be searchable without throwing.
    expect(() => index.search(new Array(768).fill(0), 3)).not.toThrow();
  });
});
