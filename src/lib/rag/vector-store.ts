/**
 * In-memory vector store for SRD RAG retrieval.
 *
 * Brute-force cosine similarity — SRD corpus is small (~50-500 entries)
 * so sub-millisecond search without any indexing overhead.
 *
 * Dependency direction: orchestration/ → rag/ → llm/
 */

export interface SRDChunk {
  id: string;
  text: string;
  metadata: { category: string; name: string; version: string; source?: string };
}

export interface SRDChunkWithScore extends SRDChunk {
  score: number;
}

export interface VectorStore {
  search(query: number[], topK: number): SRDChunkWithScore[];
  load(chunks: SRDChunk[], embeddings: number[][]): void;
  size(): number;
}

/**
 * Cosine similarity between two vectors of equal dimension.
 * Returns 0 when either vector is a zero vector (avoids division by zero).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export class InMemoryVectorStore implements VectorStore {
  private _chunks: SRDChunk[] = [];
  private _embeddings: number[][] = [];

  load(chunks: SRDChunk[], embeddings: number[][]): void {
    if (chunks.length !== embeddings.length) {
      throw new Error(
        `Load mismatch: ${chunks.length} chunks but ${embeddings.length} embeddings.`
      );
    }
    if (embeddings.length > 1) {
      const dim = embeddings[0].length;
      for (let i = 1; i < embeddings.length; i++) {
        if (embeddings[i].length !== dim) {
          throw new Error(
            `Embedding dimension mismatch at index ${i}: expected ${dim}, got ${embeddings[i].length}.`
          );
        }
      }
    }
    this._chunks = chunks;
    this._embeddings = embeddings;
  }

  search(query: number[], topK: number): SRDChunkWithScore[] {
    if (this._chunks.length === 0) return [];

    const scored: SRDChunkWithScore[] = this._chunks.map((chunk, i) => {
      const embedding = this._embeddings[i];
      // When embeddings are empty (fallback mode — no embeddings file), return
      // score 0 for every chunk so retrieval still works without crashing.
      const score = embedding.length === 0 ? 0 : cosineSimilarity(query, embedding);
      return { ...chunk, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  size(): number {
    return this._chunks.length;
  }
}
