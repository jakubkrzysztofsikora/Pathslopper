import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns 200 with a self-contained ok payload", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.service).toBe("pathfinder-nexus");
    expect(typeof json.uptime).toBe("number");
  });

  it("does not depend on LLM_API_KEY or REDIS_URL being set", async () => {
    const originalLlm = process.env.LLM_API_KEY;
    const originalRedis = process.env.REDIS_URL;
    delete process.env.LLM_API_KEY;
    delete process.env.REDIS_URL;
    try {
      const res = await GET();
      expect(res.status).toBe(200);
    } finally {
      if (originalLlm !== undefined) process.env.LLM_API_KEY = originalLlm;
      if (originalRedis !== undefined) process.env.REDIS_URL = originalRedis;
    }
  });
});
