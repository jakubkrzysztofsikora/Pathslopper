import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SynthesizedBadge, isSynthesized, clearSynthesizedPath } from "@/components/authoring/synthesized-badge";
import type { Provenance } from "@/lib/schemas/session-graph";

afterEach(cleanup);

describe("SynthesizedBadge", () => {
  it("renders a visible badge with tooltip text", () => {
    render(<SynthesizedBadge />);
    const badge = screen.getByRole("status");
    expect(badge).not.toBeNull();
    expect(badge.getAttribute("title")).toMatch(/AI|imp|synt|wymy/i);
  });
});

describe("isSynthesized helper", () => {
  const provenance: Provenance = {
    synthesized: {
      "scene-1": ["prompt", "outcomes.failure"],
      "npc-mayor": ["*"],
    },
  };

  it("returns true when exact field path is flagged", () => {
    expect(isSynthesized(provenance, "scene-1", "prompt")).toBe(true);
    expect(isSynthesized(provenance, "scene-1", "outcomes.failure")).toBe(true);
  });

  it("returns true when entity is wholly flagged via ['*']", () => {
    expect(isSynthesized(provenance, "npc-mayor", "anything")).toBe(true);
    expect(isSynthesized(provenance, "npc-mayor", "goal")).toBe(true);
  });

  it("returns false for unflagged fields", () => {
    expect(isSynthesized(provenance, "scene-1", "title")).toBe(false);
    expect(isSynthesized(provenance, "scene-2", "prompt")).toBe(false);
  });

  it("is safe when provenance is undefined", () => {
    expect(isSynthesized(undefined, "scene-1", "prompt")).toBe(false);
  });
});

describe("clearSynthesizedPath helper", () => {
  it("removes a single field path, leaves others intact", () => {
    const provenance: Provenance = {
      synthesized: {
        "scene-1": ["prompt", "outcomes.failure"],
      },
    };
    const next = clearSynthesizedPath(provenance, "scene-1", "prompt");
    expect(next.synthesized["scene-1"]).toEqual(["outcomes.failure"]);
  });

  it("drops the entity entry when no paths remain", () => {
    const provenance: Provenance = {
      synthesized: { "scene-1": ["prompt"] },
    };
    const next = clearSynthesizedPath(provenance, "scene-1", "prompt");
    expect(next.synthesized["scene-1"]).toBeUndefined();
  });

  it("clears a wholly-synthesized entity when any field is edited", () => {
    const provenance: Provenance = {
      synthesized: { "npc-1": ["*"] },
    };
    const next = clearSynthesizedPath(provenance, "npc-1", "goal");
    expect(next.synthesized["npc-1"]).toBeUndefined();
  });

  it("returns identical object when nothing to clear", () => {
    const provenance: Provenance = {
      synthesized: { "scene-1": ["prompt"] },
    };
    const next = clearSynthesizedPath(provenance, "scene-2", "title");
    expect(next.synthesized["scene-1"]).toEqual(["prompt"]);
  });

  it("handles undefined provenance without throwing", () => {
    const next = clearSynthesizedPath(undefined, "scene-1", "prompt");
    expect(next.synthesized).toEqual({});
  });
});
