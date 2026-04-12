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

// Use globalThis to survive Next.js dev-mode hot-module-reload.
// Module-level `let _store` gets wiped when the module is re-evaluated;
// globalThis persists across reloads in the same Node.js process.
const _global = globalThis as unknown as { __pfnexus_session_store?: SessionStore };

export function getSessionStore(): SessionStore {
  if (_global.__pfnexus_session_store) return _global.__pfnexus_session_store;

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl && redisUrl.trim().length > 0) {
    _global.__pfnexus_session_store = RedisSessionStore.fromUrl(redisUrl);
  } else {
    _global.__pfnexus_session_store = new InMemorySessionStore();
  }
  return _global.__pfnexus_session_store;
}

/**
 * Test-only: reset the cached singleton so subsequent getSessionStore()
 * calls re-read REDIS_URL. The previous store's in-memory state, if any,
 * is dropped — callers who want to reuse the same store across tests
 * should await store._reset() instead.
 */
export function _resetSessionStoreSingleton(): void {
  _global.__pfnexus_session_store = undefined;
}
