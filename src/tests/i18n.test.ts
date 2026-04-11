import { describe, it, expect } from "vitest";
import { t, format, pl } from "@/lib/i18n";

describe("i18n.t", () => {
  it("resolves a top-level namespace.key path to its Polish string", () => {
    expect(t("home.ctaStart")).toBe(pl.home.ctaStart);
    expect(t("home.ctaStart")).toBe("Nowa sesja");
  });

  it("throws on unknown keys (typed at compile time, guarded at runtime)", () => {
    // @ts-expect-error — intentionally invalid key to exercise the runtime guard.
    expect(() => t("home.nothingHere")).toThrow(/Missing translation/);
  });

  it("format substitutes named placeholders", () => {
    expect(format(t("storyDna.lead"), { versionLabel: "Pathfinder 2e" })).toContain(
      "Pathfinder 2e"
    );
  });

  it("format leaves unknown placeholders untouched", () => {
    expect(format("Hello {unknown}", { name: "Ala" })).toBe("Hello {unknown}");
  });

  it("every session.* key resolves to a non-empty Polish string", () => {
    for (const key of Object.keys(pl.session) as Array<keyof typeof pl.session>) {
      expect(pl.session[key]).toMatch(/\S/);
    }
  });
});
