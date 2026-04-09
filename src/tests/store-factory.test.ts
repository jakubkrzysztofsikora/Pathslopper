import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getSessionStore,
  _resetSessionStoreSingleton,
} from "@/lib/state/server/store-factory";
import { InMemorySessionStore } from "@/lib/state/server/session-store";

describe("getSessionStore factory", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    _resetSessionStoreSingleton();
  });

  afterEach(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
    _resetSessionStoreSingleton();
  });

  it("returns an InMemorySessionStore when REDIS_URL is not set", () => {
    delete process.env.REDIS_URL;
    const store = getSessionStore();
    expect(store).toBeInstanceOf(InMemorySessionStore);
  });

  it("returns an InMemorySessionStore when REDIS_URL is an empty string", () => {
    process.env.REDIS_URL = "";
    const store = getSessionStore();
    expect(store).toBeInstanceOf(InMemorySessionStore);
  });

  it("returns a singleton across repeated calls", () => {
    delete process.env.REDIS_URL;
    const a = getSessionStore();
    const b = getSessionStore();
    expect(a).toBe(b);
  });

  it("_resetSessionStoreSingleton forces a fresh instance on the next call", () => {
    delete process.env.REDIS_URL;
    const a = getSessionStore();
    _resetSessionStoreSingleton();
    const b = getSessionStore();
    expect(a).not.toBe(b);
  });
});
