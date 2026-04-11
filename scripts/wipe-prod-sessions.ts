/**
 * One-shot script: wipe all Pathfinder Nexus session keys from prod Redis.
 *
 * Run once against prod Redis at the start of the Phase 0+1 deploy to
 * clear sessions that were written under the old reactive turn model
 * (those sessions will fail SessionStateSchema validation with the new
 * schema and would be returned as `undefined` anyway — wiping is clean).
 *
 * Usage:
 *   REDIS_URL=rediss://... WIPE_CONFIRM=yes-delete-all \
 *     npx tsx scripts/wipe-prod-sessions.ts
 *
 * WIPE_CONFIRM is a mandatory kill-switch. Without it the script lists
 * the keys it *would* delete and exits — a dry run. This prevents an
 * accidental `REDIS_URL=... npx tsx ...` from nuking prod state.
 *
 * Delete this script after it has been run — it is a one-off tool, not
 * long-term infrastructure.
 */

import Redis from "ioredis";

const KEY_PREFIX = "pfnexus:session:";
const CONFIRM_TOKEN = "yes-delete-all";

async function main() {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.error("REDIS_URL is not set. Aborting.");
    process.exit(1);
  }

  const confirmed = process.env.WIPE_CONFIRM === CONFIRM_TOKEN;
  const redis = new Redis(url);

  const keys = await redis.keys(`${KEY_PREFIX}*`);
  if (keys.length === 0) {
    console.log("No session keys found. Nothing to delete.");
    await redis.quit();
    return;
  }

  if (!confirmed) {
    console.log(
      `DRY RUN. Would delete ${keys.length} session key(s) (first 10 shown):`
    );
    keys.slice(0, 10).forEach((k) => console.log(`  ${k}`));
    console.log(
      `\nTo actually delete, re-run with WIPE_CONFIRM=${CONFIRM_TOKEN}`
    );
    await redis.quit();
    return;
  }

  console.log(`Found ${keys.length} session key(s). Deleting...`);
  await redis.del(...keys);
  console.log("Done.");
  await redis.quit();
}

main().catch((err) => {
  console.error("Wipe script failed:", err);
  process.exit(1);
});
