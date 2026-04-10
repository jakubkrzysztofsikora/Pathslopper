import { describe, it, expect } from "vitest";
import { callLLM } from "@/lib/llm/client";

// No guards. No skipIf. If LLM_API_KEY is missing, callLLM throws.
// That's the contract of test:integration.

describe("callLLM — real Scaleway Generative APIs", () => {
  it("returns a non-empty string for a trivial prompt", async () => {
    const result = await callLLM({
      system: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Say hello in one word." }],
    });
    expect(typeof result).toBe("string");
    expect(result.trim().length).toBeGreaterThan(0);
  });

  it("handles structured output request", async () => {
    const result = await callLLM({
      system: "You are a JSON generator. Respond ONLY with valid JSON.",
      messages: [{ role: "user", content: 'Return a JSON object: {"greeting": "hello"}' }],
    });
    expect(result).toContain("hello");
  });
});
