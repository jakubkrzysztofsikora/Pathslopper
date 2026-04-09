import { describe, it, expect } from "vitest";
import { roll, check } from "@/lib/dice/roll";

describe("roll", () => {
  it("produces a single d20 result within the expected range", () => {
    const r = roll({ count: 1, faces: 20, seed: 42 });
    expect(r.rolls).toHaveLength(1);
    expect(r.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(r.rolls[0]).toBeLessThanOrEqual(20);
    expect(r.total).toBe(r.rolls[0]);
    expect(r.formula).toBe("1d20");
  });

  it("produces a reproducible result for a given seed", () => {
    const a = roll({ count: 1, faces: 20, seed: 12345 });
    const b = roll({ count: 1, faces: 20, seed: 12345 });
    expect(a.total).toBe(b.total);
    expect(a.rolls).toEqual(b.rolls);
  });

  it("sums 2d6 correctly and preserves individual rolls", () => {
    const r = roll({ count: 2, faces: 6, seed: 7 });
    expect(r.rolls).toHaveLength(2);
    expect(r.total).toBe(r.rolls[0] + r.rolls[1]);
    expect(r.formula).toBe("2d6");
  });

  it("adds modifier terms to the total and breakdown", () => {
    const r = roll({
      count: 1,
      faces: 20,
      seed: 1,
      modifiers: [
        { label: "STR", value: 3 },
        { label: "Prof", value: 2 },
      ],
    });
    expect(r.total).toBe(r.rolls[0] + 5);
    expect(r.formula).toContain("STR");
    expect(r.formula).toContain("Prof");
    expect(r.breakdown).toMatch(/1d20\(\d+\).*STR.*Prof.*= \d+/);
  });

  it("formats negative modifiers with a minus sign", () => {
    const r = roll({
      count: 1,
      faces: 20,
      seed: 1,
      modifiers: [{ label: "Penalty", value: -2 }],
    });
    expect(r.formula).toContain("- 2 Penalty");
    expect(r.breakdown).toContain("- 2 Penalty");
  });

  it("throws on invalid dice count", () => {
    expect(() => roll({ count: 0, faces: 20 })).toThrow();
    expect(() => roll({ count: 101, faces: 20 })).toThrow();
  });

  it("throws on invalid dice faces", () => {
    expect(() => roll({ count: 1, faces: 1 })).toThrow();
    expect(() => roll({ count: 1, faces: 1001 })).toThrow();
  });
});

describe("check", () => {
  it("returns success when total meets DC", () => {
    // Seed tuned so the roll + mod >= DC.
    const r = check({
      count: 1,
      faces: 20,
      seed: 1,
      modifiers: [{ label: "STR", value: 10 }],
      dc: 10,
    });
    expect(r.total).toBeGreaterThanOrEqual(10);
    expect(["success", "critical-success"]).toContain(r.degreeOfSuccess);
  });

  it("returns failure when total is below DC", () => {
    const r = check({
      count: 1,
      faces: 20,
      seed: 5,
      modifiers: [{ label: "STR", value: -5 }],
      dc: 30,
    });
    expect(r.degreeOfSuccess === "failure" || r.degreeOfSuccess === "critical-failure").toBe(true);
  });

  it("returns critical-success when total exceeds DC by 10+", () => {
    const r = check({
      count: 1,
      faces: 20,
      seed: 2,
      modifiers: [{ label: "High", value: 25 }],
      dc: 10,
    });
    expect(r.degreeOfSuccess).toBe("critical-success");
  });

  it("returns critical-failure when total is 10+ below DC", () => {
    const r = check({
      count: 1,
      faces: 20,
      seed: 1,
      modifiers: [{ label: "Low", value: -20 }],
      dc: 25,
    });
    expect(r.degreeOfSuccess).toBe("critical-failure");
  });

  it("includes the DC and outcome in breakdown string", () => {
    const r = check({
      count: 1,
      faces: 20,
      seed: 10,
      modifiers: [{ label: "Mod", value: 3 }],
      dc: 15,
    });
    expect(r.breakdown).toContain("vs DC 15");
    expect(r.breakdown).toMatch(/SUCCESS|FAILURE|CRITICAL/);
  });
});
