/**
 * Loads a SessionState fixture JSON file and writes it to Redis.
 *
 * Usage:
 *   REDIS_URL=rediss://... npx tsx scripts/seed-session.ts <path-to-fixture.json>
 *
 * The session will be stored under its fixture's `id` field. If no `id` is
 * present in the fixture, a new random ID is generated and printed.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Redis from "ioredis";
import { newSessionId } from "../src/lib/state/server/session-store";

const KEY_PREFIX = "pfnexus:session:";
const TTL_SECONDS = 60 * 60 * 24; // 24h

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL is not set. Aborting.");
    process.exit(1);
  }

  const fixturePath = process.argv[2];
  if (!fixturePath) {
    console.error(
      "Usage: npx tsx scripts/seed-session.ts <path-to-fixture.json>"
    );
    process.exit(1);
  }

  const absolutePath = resolve(process.cwd(), fixturePath);
  let fixture: Record<string, unknown>;
  try {
    fixture = JSON.parse(readFileSync(absolutePath, "utf-8"));
  } catch (err) {
    console.error(`Failed to read fixture at ${absolutePath}:`, err);
    process.exit(1);
  }

  const sessionId = typeof fixture.id === "string" ? fixture.id : newSessionId();
  if (!fixture.id) {
    fixture.id = sessionId;
  }

  const redis = new Redis(url);
  await redis.set(
    `${KEY_PREFIX}${sessionId}`,
    JSON.stringify(fixture),
    "EX",
    TTL_SECONDS
  );
  await redis.quit();

  console.log(`Seeded session '${sessionId}' (TTL: ${TTL_SECONDS}s)`);
}

main().catch((err) => {
  console.error("seed-session failed:", err);
  process.exit(1);
});
