/**
 * Reads a SessionState from Redis by session ID and pretty-prints it as JSON.
 *
 * Usage:
 *   REDIS_URL=rediss://... npx tsx scripts/dump-session.ts <session-id>
 */

import Redis from "ioredis";

const KEY_PREFIX = "pfnexus:session:";

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL is not set. Aborting.");
    process.exit(1);
  }

  const sessionId = process.argv[2];
  if (!sessionId) {
    console.error("Usage: npx tsx scripts/dump-session.ts <session-id>");
    process.exit(1);
  }

  const redis = new Redis(url);
  const raw = await redis.get(`${KEY_PREFIX}${sessionId}`);
  await redis.quit();

  if (!raw) {
    console.error(`Session '${sessionId}' not found in Redis.`);
    process.exit(1);
  }

  const parsed = JSON.parse(raw);
  console.log(JSON.stringify(parsed, null, 2));
}

main().catch((err) => {
  console.error("dump-session failed:", err);
  process.exit(1);
});
