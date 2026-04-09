/**
 * Minimal Redis client port.
 *
 * The RedisSessionStore only needs a handful of string operations
 * (get / set-with-TTL / del / exists). Defining our own narrow
 * interface keeps the store trivially fake-able in unit tests (no
 * testcontainers, no docker) and makes the ioredis dependency optional
 * at the type level — tests never import ioredis.
 *
 * Implementations:
 *   - createIoRedisClient: production. Dynamically imports ioredis on
 *     first use so vitest runs without touching the native binding.
 *   - FakeRedisClient (in tests): Map-backed.
 */

export interface RedisClient {
  get(key: string): Promise<string | null>;
  setWithTtl(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /** Returns the number of keys matching a glob pattern. Used for size(). */
  countKeys(pattern: string): Promise<number>;
  /** Delete every key matching a glob pattern. Used for _reset(). */
  deleteByPattern(pattern: string): Promise<void>;
  disconnect(): Promise<void>;
}

/** Minimal structural type for the ioredis methods we touch. */
interface IoRedisLike {
  get(key: string): Promise<string | null>;
  set(
    key: string,
    value: string,
    mode: "EX",
    ttlSeconds: number
  ): Promise<string>;
  del(...keys: string[]): Promise<number>;
  exists(key: string): Promise<number>;
  scan(
    cursor: string,
    matchToken: "MATCH",
    pattern: string,
    countToken: "COUNT",
    count: number
  ): Promise<[string, string[]]>;
  quit(): Promise<string>;
}

/**
 * IoRedis-backed adapter. ioredis is pure JS (no native bindings), but
 * importing it eagerly would bundle the full module into the vitest
 * graph and open a real network client at first use. We instead use a
 * dynamic `await import("ioredis")` gated behind the first call so
 * the test suite never touches ioredis at all and the production cold
 * start only pays the import cost once per warm Serverless Container
 * instance.
 */
export function createIoRedisClient(url: string): RedisClient {
  let clientPromise: Promise<IoRedisLike> | null = null;

  async function getClient(): Promise<IoRedisLike> {
    if (!clientPromise) {
      clientPromise = (async () => {
        const mod = await import("ioredis");
        const Ctor = (mod as unknown as { default?: unknown }).default ??
          (mod as unknown);
        const RedisCtor = Ctor as new (url: string) => IoRedisLike;
        return new RedisCtor(url);
      })();
    }
    return clientPromise;
  }

  return {
    async get(key) {
      const client = await getClient();
      return client.get(key);
    },
    async setWithTtl(key, value, ttlSeconds) {
      const client = await getClient();
      await client.set(key, value, "EX", ttlSeconds);
    },
    async del(key) {
      const client = await getClient();
      await client.del(key);
    },
    async exists(key) {
      const client = await getClient();
      const n = await client.exists(key);
      return n > 0;
    },
    async countKeys(pattern) {
      const client = await getClient();
      let cursor = "0";
      let count = 0;
      do {
        const [next, batch] = await client.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100
        );
        count += batch.length;
        cursor = next;
      } while (cursor !== "0");
      return count;
    },
    async deleteByPattern(pattern) {
      const client = await getClient();
      let cursor = "0";
      do {
        const [next, batch] = await client.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100
        );
        if (batch.length > 0) await client.del(...batch);
        cursor = next;
      } while (cursor !== "0");
    },
    async disconnect() {
      if (!clientPromise) return;
      const client = await clientPromise;
      await client.quit();
    },
  };
}
