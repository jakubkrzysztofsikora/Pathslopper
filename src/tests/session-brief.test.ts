import { describe, it, expect } from "vitest";
import { SessionBriefSchema } from "@/lib/schemas/session-brief";
import { makeBrief } from "@/tests/factories/brief-factory";

describe("SessionBriefSchema", () => {
  it("round-trip parses a valid brief", () => {
    const brief = makeBrief();
    const result = SessionBriefSchema.safeParse(brief);
    expect(result.success).toBe(true);
  });

  it("rejects invalid version", () => {
    const brief = makeBrief({ version: "pf3e" as "pf2e" });
    const result = SessionBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });

  it("rejects partySize > 8", () => {
    const brief = makeBrief({ partySize: 9 });
    const result = SessionBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });

  it("rejects partySize < 1", () => {
    const brief = makeBrief({ partySize: 0 });
    const result = SessionBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });

  it("rejects partyLevel > 20", () => {
    const brief = makeBrief({ partyLevel: 21 });
    const result = SessionBriefSchema.safeParse(brief);
    expect(result.success).toBe(false);
  });

  it("accepts all valid presetIds", () => {
    for (const presetId of ["classic", "intrigue", "horror", "custom"] as const) {
      const result = SessionBriefSchema.safeParse(makeBrief({ presetId }));
      expect(result.success).toBe(true);
    }
  });

  it("applies default xCardEnabled = true when not provided", () => {
    const brief = makeBrief();
    // omit safetyTools to test defaults
    const { safetyTools: _ignored, ...rest } = brief;
    const result = SessionBriefSchema.safeParse(rest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.safetyTools.xCardEnabled).toBe(true);
    }
  });
});
