/**
 * SRD index singleton.
 *
 * Lazy-loads the SRD vector store on first use. In production/CI a pre-computed
 * srd-embeddings.json exists next to srd-chunks.json — cold start is instant.
 * In local dev (no embeddings file) the index falls back to zero-vectors,
 * which means retrieval scores will be uniform but the pipeline won't crash.
 * Run `pnpm compute-srd-embeddings` to generate the real vectors.
 *
 * Singleton pattern mirrors src/lib/state/server/store-factory.ts.
 */

import { InMemoryVectorStore, type VectorStore } from "./vector-store";
import type { SRDChunk } from "./vector-store";

// Node.js / Next.js server-side only — fs is safe to import here.
import { readFileSync } from "fs";
import { join } from "path";

let _index: VectorStore | null = null;
let _loading: Promise<VectorStore> | null = null;

interface EmbeddingsFile {
  model: string;
  dimensions: number;
  chunksHash: string;
  embeddings: number[][];
}

function resolveRagDir(): string {
  // Works whether running from project root (Next.js server) or from
  // vitest (which sets process.cwd() to the project root as well).
  return join(process.cwd(), "src", "lib", "rag");
}

async function loadIndex(): Promise<VectorStore> {
  const ragDir = resolveRagDir();

  // Load chunks (always present).
  const chunksPath = join(ragDir, "srd-chunks.json");
  let chunks: SRDChunk[];
  try {
    chunks = JSON.parse(readFileSync(chunksPath, "utf-8")) as SRDChunk[];
  } catch (err) {
    throw new Error(
      `Failed to read SRD chunks from ${chunksPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Attempt to load pre-computed embeddings file.
  const embeddingsPath = join(ragDir, "srd-embeddings.json");
  let embeddings: number[][];
  try {
    const raw = readFileSync(embeddingsPath, "utf-8");
    const file = JSON.parse(raw) as EmbeddingsFile;
    embeddings = file.embeddings;
  } catch {
    // Embeddings file does not exist (local dev without compute step).
    // Fall back to empty-vector arrays so the store loads without crashing.
    // All cosine similarities will be 0 (uniform ranking) — acceptable
    // for local development; run compute-srd-embeddings to fix.
    // Using empty arrays avoids hardcoding a dimension that may not match
    // the actual bge-multilingual-gemma2 output dimension at search time.
    embeddings = chunks.map(() => [] as number[]);
  }

  const store = new InMemoryVectorStore();
  store.load(chunks, embeddings);
  return store;
}

export async function getSrdIndex(): Promise<VectorStore> {
  if (_index) return _index;
  if (_loading) return _loading;
  _loading = loadIndex().then((store) => {
    _index = store;
    _loading = null;
    return store;
  });
  return _loading;
}

/**
 * Test-only: reset the singleton so next getSrdIndex() creates a fresh instance.
 */
export function _resetSrdIndex(): void {
  _index = null;
  _loading = null;
}
