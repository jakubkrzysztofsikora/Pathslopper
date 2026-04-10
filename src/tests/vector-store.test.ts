import { describe, it, expect } from "vitest";
import {
  InMemoryVectorStore,
  type SRDChunk,
} from "@/lib/rag/vector-store";

function makeChunk(id: string, text: string): SRDChunk {
  return {
    id,
    text,
    metadata: { category: "skill", name: id, version: "pf2e" },
  };
}

describe("InMemoryVectorStore", () => {
  it("load stores chunks and embeddings — size() reflects count", () => {
    const store = new InMemoryVectorStore();
    const chunks = [makeChunk("a", "alpha"), makeChunk("b", "beta")];
    const embeddings = [
      [1, 0, 0],
      [0, 1, 0],
    ];
    store.load(chunks, embeddings);
    expect(store.size()).toBe(2);
  });

  it("search returns top-K by cosine similarity for known vectors", () => {
    const store = new InMemoryVectorStore();
    const chunks = [
      makeChunk("exact", "exact match"),
      makeChunk("close", "close match"),
      makeChunk("far", "far match"),
    ];
    // Three orthogonal-ish vectors
    const embeddings = [
      [1, 0, 0],  // exact
      [0.9, 0.1, 0],  // close
      [0, 0, 1],  // far
    ];
    store.load(chunks, embeddings);

    const query = [1, 0, 0]; // identical to "exact"
    const results = store.search(query, 2);

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("exact");
    expect(results[0].score).toBeCloseTo(1.0, 5);
    expect(results[1].id).toBe("close");
  });

  it("search with empty store returns empty array", () => {
    const store = new InMemoryVectorStore();
    const results = store.search([1, 0, 0], 3);
    expect(results).toEqual([]);
  });

  it("search returns at most topK results even when store has more", () => {
    const store = new InMemoryVectorStore();
    const chunks = Array.from({ length: 10 }, (_, i) => makeChunk(`c${i}`, `chunk ${i}`));
    const embeddings = Array.from({ length: 10 }, (_, i) => {
      const v = new Array(10).fill(0);
      v[i] = 1;
      return v;
    });
    store.load(chunks, embeddings);
    const query = new Array(10).fill(0);
    query[0] = 1;
    const results = store.search(query, 3);
    expect(results).toHaveLength(3);
  });

  it("search returns results sorted descending by score", () => {
    const store = new InMemoryVectorStore();
    const chunks = [makeChunk("a", "a"), makeChunk("b", "b"), makeChunk("c", "c")];
    const embeddings = [
      [0.5, 0.5, 0],
      [1, 0, 0],
      [0, 1, 0],
    ];
    store.load(chunks, embeddings);
    const query = [1, 0, 0];
    const results = store.search(query, 3);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("load throws if chunks and embeddings arrays have mismatched lengths", () => {
    const store = new InMemoryVectorStore();
    const chunks = [makeChunk("a", "alpha")];
    const embeddings = [[1, 0], [0, 1]]; // 2 embeddings for 1 chunk
    expect(() => store.load(chunks, embeddings)).toThrow(/mismatch/i);
  });

  it("load throws if embeddings have inconsistent dimensions", () => {
    const store = new InMemoryVectorStore();
    const chunks = [makeChunk("a", "alpha"), makeChunk("b", "beta")];
    const embeddings = [[1, 0, 0], [0, 1]]; // different dims
    expect(() => store.load(chunks, embeddings)).toThrow(/dimension/i);
  });
});
