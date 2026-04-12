import { describe, it, expect, beforeEach } from "vitest";
import { InMemorySessionStore } from "@/lib/state/server/in-memory-session-store";
import { makeBrief } from "@/tests/factories/brief-factory";
import { makeGraph } from "@/tests/factories/graph-factory";

describe("InMemorySessionStore", () => {
  let store: InMemorySessionStore;

  beforeEach(async () => {
    store = new InMemorySessionStore();
  });

  it("create returns a session in 'brief' phase", async () => {
    const session = await store.create("pf2e");
    expect(session.phase).toBe("brief");
    expect(session.version).toBe("pf2e");
    expect(typeof session.id).toBe("string");
  });

  it("get returns the session after creation", async () => {
    const session = await store.create("pf2e");
    const fetched = await store.get(session.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(session.id);
  });

  it("get returns undefined for unknown id", async () => {
    const result = await store.get("not-a-real-id");
    expect(result).toBeUndefined();
  });

  it("setBrief attaches the brief to the session", async () => {
    const session = await store.create("pf2e");
    const brief = makeBrief();
    const updated = await store.setBrief(session.id, brief);
    expect(updated?.brief).toMatchObject({ partySize: 4 });
  });

  it("setGraph transitions phase to 'authoring'", async () => {
    const session = await store.create("pf2e");
    const graph = makeGraph();
    const updated = await store.setGraph(session.id, graph);
    expect(updated?.phase).toBe("authoring");
    expect(updated?.graph?.id).toBe(graph.id);
  });

  it("updateGraph merges a patch onto the existing graph", async () => {
    const session = await store.create("pf2e");
    const graph = makeGraph();
    await store.setGraph(session.id, graph);
    const updated = await store.updateGraph(session.id, { updatedAt: "2026-01-01T00:00:00.000Z" });
    expect(updated?.graph?.updatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(updated?.graph?.id).toBe(graph.id);
  });

  it("approve transitions phase to 'approved'", async () => {
    const session = await store.create("pf2e");
    await store.setGraph(session.id, makeGraph());
    const updated = await store.approve(session.id, "// ink compiled");
    expect(updated?.phase).toBe("approved");
    expect(updated?.inkCompiled).toBe("// ink compiled");
  });

  it("tick persists inkState and worldState", async () => {
    const session = await store.create("pf2e");
    await store.setGraph(session.id, makeGraph());
    await store.approve(session.id, "// ink");
    const worldState = {
      ...session.worldState,
      turnCount: 5,
      flags: ["boss-defeated"],
    };
    const updated = await store.tick(session.id, '{"flow":"DEFAULT"}', worldState);
    expect(updated?.phase).toBe("playing");
    expect(updated?.worldState.turnCount).toBe(5);
    expect(updated?.worldState.flags).toContain("boss-defeated");
  });

  it("_reset clears all sessions", async () => {
    await store.create("pf2e");
    await store.create("pf1e");
    expect(await store.size()).toBe(2);
    await store._reset();
    expect(await store.size()).toBe(0);
  });
});
