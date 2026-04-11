import { InMemorySessionStore } from "./in-memory-session-store";
import { RedisSessionStore } from "./redis-session-store";
import type { SessionStore } from "./session-store";

/**
 * Session store factory.
 *
 * - If REDIS_URL is set, connects to Scaleway Managed Redis and uses the
 *   RedisSessionStore (production and any environment where a real
 *   persistence layer is provisioned).
 * - Otherwise, falls back to InMemorySessionStore for local dev and the
 *   vitest suite. Cold starts and horizontal scale-out still lose
 *   in-memory state — the Redis path is the authoritative production
 *   persistence layer.
 *
 * The factory caches its choice in a module-scoped singleton so the
 * Redis connection is created lazily on first use and reused across
 * requests in a warm Serverless Container instance.
 */

let _store: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (_store) return _store;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.trim().length > 0) {
    _store = RedisSessionStore.fromUrl(redisUrl);
  } else {
    _store = new InMemorySessionStore();
  }
  return _store;
}

/**
 * Test-only: reset the cached singleton so subsequent getSessionStore()
 * calls re-read REDIS_URL. The previous store's in-memory state, if any,
 * is dropped — callers who want to reuse the same store across tests
 * should await store._reset() instead.
 */
export function _resetSessionStoreSingleton(): void {
  _store = null;
}
