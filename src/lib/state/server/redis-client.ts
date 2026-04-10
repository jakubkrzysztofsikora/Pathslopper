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
 * Redact the password portion of a Redis URL so it cannot leak into
 * error messages or container logs.
 *
 * Before: rediss://default:s3cr3t@hostname:6379
 * After:  rediss://***@hostname:6379
 */
function redactUrl(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//***@");
}

/**
 * Structural type for the ioredis options object form we construct.
 * We deliberately pass options explicitly (host, port, password, tls)
 * instead of a URL string so that the TLS settings cannot be silently
 * overridden by ioredis's URL-string parser, which in practice has
 * shallow-merge ambiguity around the `tls` key when a `rediss://` URL
 * is combined with a constructor-level `tls` option. Passing options
 * directly also lets us set `tls.servername` (SNI) to the parsed host,
 * which some managed Redis endpoints require for the TLS handshake.
 */
interface IoRedisOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  tls?: {
    rejectUnauthorized: boolean;
    servername?: string;
  };
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
  lazyConnect?: boolean;
}

function parseRedisUrl(raw: string): IoRedisOptions {
  const parsed = new URL(raw);
  const isTls = parsed.protocol === "rediss:";
  const host = parsed.hostname;
  const port = parsed.port ? Number(parsed.port) : 6379;
  const username = parsed.username
    ? decodeURIComponent(parsed.username)
    : undefined;
  const password = parsed.password
    ? decodeURIComponent(parsed.password)
    : undefined;
  // pathname is e.g. "/0" — strip leading slash to get the db index
  const dbStr = parsed.pathname.replace(/^\//, "");
  const db = dbStr.length > 0 ? Number(dbStr) : undefined;

  const opts: IoRedisOptions = {
    host,
    port,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  };
  if (username !== undefined) opts.username = username;
  if (password !== undefined) opts.password = password;
  if (db !== undefined && !Number.isNaN(db)) opts.db = db;
  if (isTls) {
    // Scaleway Managed Redis uses a self-signed TLS certificate signed
    // by a private CA; trust is established by the password + network
    // ACL rather than the public CA chain. rejectUnauthorized: false
    // keeps the connection encrypted but skips cert verification.
    // servername is set so Node's TLS stack sends the correct SNI.
    opts.tls = { rejectUnauthorized: false, servername: host };
  }
  return opts;
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
        try {
          const mod = await import("ioredis");
          const Ctor = (mod as unknown as { default?: unknown }).default ??
            (mod as unknown);
          const RedisCtor = Ctor as new (
            opts: IoRedisOptions,
          ) => IoRedisLike;
          const opts = parseRedisUrl(url);
          return new RedisCtor(opts);
        } catch (err) {
          throw new Error(
            `Failed to connect to Redis at ${redactUrl(url)}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
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
