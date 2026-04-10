#!/usr/bin/env tsx
/**
 * Compute SRD embeddings.
 *
 * Reads src/lib/rag/srd-chunks.json, embeds all texts in batches via the
 * Scaleway Generative APIs /embeddings endpoint, and writes the result to
 * src/lib/rag/srd-embeddings.json.
 *
 * Usage:
 *   LLM_API_KEY=<key> npx tsx scripts/compute-srd-embeddings.ts
 *
 * The output file is committed alongside the source so production cold starts
 * don't need to re-embed at runtime. Re-run whenever srd-chunks.json changes.
 */

import { readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";
import { embedTexts } from "../src/lib/rag/embed";

const BATCH_SIZE = 50;

interface SRDChunk {
  id: string;
  text: string;
  metadata: { category: string; name: string; version: string };
}

async function main(): Promise<void> {
  const ragDir = join(process.cwd(), "src", "lib", "rag");
  const chunksPath = join(ragDir, "srd-chunks.json");
  const embeddingsPath = join(ragDir, "srd-embeddings.json");

  console.log(`Reading chunks from ${chunksPath}…`);
  const chunksRaw = readFileSync(chunksPath, "utf-8");
  const chunks = JSON.parse(chunksRaw) as SRDChunk[];
  console.log(`Found ${chunks.length} chunks.`);

  const chunksHash = createHash("sha256").update(chunksRaw).digest("hex");
  const model = process.env.LLM_EMBEDDING_MODEL ?? "bge-multilingual-gemma2";

  const texts = chunks.map((c) => c.text);
  const allEmbeddings: number[][] = [];

  for (let start = 0; start < texts.length; start += BATCH_SIZE) {
    const batch = texts.slice(start, start + BATCH_SIZE);
    const end = Math.min(start + BATCH_SIZE, texts.length);
    console.log(`Embedding chunks ${start + 1}–${end} of ${texts.length}…`);
    const batchEmbeddings = await embedTexts(batch, { model });
    allEmbeddings.push(...batchEmbeddings);
  }

  const dimensions = allEmbeddings[0]?.length ?? 0;
  const output = {
    model,
    dimensions,
    chunksHash,
    embeddings: allEmbeddings,
  };

  writeFileSync(embeddingsPath, JSON.stringify(output, null, 2), "utf-8");
  console.log(
    `Written ${allEmbeddings.length} embeddings (dim=${dimensions}) to ${embeddingsPath}`
  );
}

main().catch((err) => {
  console.error("compute-srd-embeddings failed:", err);
  process.exit(1);
});
