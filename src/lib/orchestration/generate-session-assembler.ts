import { randomUUID } from "node:crypto";
import type { SessionBrief } from "@/lib/schemas/session-brief";
import type { SessionGraph, SessionNode } from "@/lib/schemas/session-graph";
import type {
  StageASkeleton,
  StageBScenes,
  StageCWorldKit,
  StageDWiring,
  StageEProse,
  StageFStatBlocks,
} from "@/lib/prompts/session-generator";

/**
 * Reconcile the six stage outputs into a Partial<SessionGraph>. Shared between
 * the generate pipeline and the import pipeline so both produce
 * cross-referentially consistent graphs without duplicating logic.
 *
 * Repairs applied: orphan node → auto edge, bad edge refs dropped, ending
 * nodeIds re-pointed at ending nodes, defeat/TPK ending forced if absent,
 * frontOutcomes keys remapped name→id, clock front/onFill refs fixed,
 * secret requires self-loops dropped.
 */
export function assembleGraph(
  brief: SessionBrief,
  stageA: StageASkeleton,
  stageB: StageBScenes,
  stageC: StageCWorldKit,
  stageD: StageDWiring,
  stageE: StageEProse,
  stageF: StageFStatBlocks
): Omit<SessionGraph, "provenance" | "validatedAt"> {
  const now = new Date().toISOString();

  const nodes: SessionNode[] = stageB.scenes.map((scene) => ({
    id: scene.id,
    kind: scene.kind,
    act: scene.act,
    title: scene.title,
    synopsis: scene.synopsis,
    prompt: stageE.nodePrompts[scene.id] ?? "",
    estimatedMinutes: scene.estimatedMinutes,
    tensionLevel: scene.tensionLevel,
    npcsPresent: scene.npcsPresent ?? [],
    locationId: scene.locationRef,
    obstacles: [],
    contentWarnings: [],
    tags: [],
    onEnterEffects: [],
    repeatable: false,
  }));

  const npcs = stageC.npcs.map((npc) => {
    const statBlock = stageF.statBlocks[npc.id];
    if (statBlock) return { ...npc, statBlock };
    return npc;
  });

  const fronts = stageA.fronts.map((f, idx) => ({
    id: `front-${idx + 1}`,
    name: f.name,
    stakes: f.stakes,
    dangers: f.dangers,
    grimPortents: f.grimPortents,
    impendingDoom: f.impendingDoom,
    firedPortents: 0,
  }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const frontIds = new Set(fronts.map((f) => f.id));
  const clockIds = new Set(stageC.clocks.map((c) => c.id));
  const secretIds = new Set(stageC.secrets.map((s) => s.id));

  let startNodeId = stageD.startNodeId;
  if (!nodeIds.has(startNodeId)) {
    const strongStart = nodes.find((n) => n.kind === "strong-start");
    startNodeId = strongStart?.id ?? nodes[0]?.id ?? startNodeId;
  }

  const validEdges = stageD.edges.filter((e) => {
    const fromOk = nodeIds.has(e.from);
    const toOk = nodeIds.has(e.to);
    if (e.kind === "clock-trigger" && (!e.clockId || !clockIds.has(e.clockId))) {
      return false;
    }
    return fromOk && toOk;
  });

  const endingNodes = nodes.filter((n) => n.kind === "ending");
  const reconcileEndings = stageD.endings.map((ending, idx) => {
    if (nodeIds.has(ending.nodeId) && nodes.find((n) => n.id === ending.nodeId)?.kind === "ending") {
      return ending;
    }
    const fallback = endingNodes[idx % endingNodes.length];
    return fallback ? { ...ending, nodeId: fallback.id } : ending;
  });

  const hasDefeat = reconcileEndings.some(
    (e) => e.category === "defeat" || e.category === "tpk"
  );
  if (!hasDefeat && endingNodes.length > 0 && reconcileEndings.length > 0) {
    reconcileEndings[reconcileEndings.length - 1] = {
      ...reconcileEndings[reconcileEndings.length - 1],
      category: "defeat",
    };
  }

  const frontNameToId = new Map(fronts.map((f) => [f.name, f.id]));
  for (const ending of reconcileEndings) {
    if (ending.frontOutcomes && typeof ending.frontOutcomes === "object") {
      const fixed: Record<string, "neutralized" | "delayed" | "escalated" | "triumphed"> = {};
      for (const [key, value] of Object.entries(ending.frontOutcomes)) {
        if (frontIds.has(key)) {
          fixed[key] = value;
        } else if (frontNameToId.has(key)) {
          fixed[frontNameToId.get(key)!] = value;
        }
      }
      ending.frontOutcomes = fixed;
    }
  }

  const reconciledClocks = stageC.clocks.map((clock) => {
    const fixed = { ...clock };
    if (fixed.frontId && !frontIds.has(fixed.frontId)) {
      fixed.frontId = fronts[0]?.id;
    }
    if (fixed.onFillNodeId && !nodeIds.has(fixed.onFillNodeId)) {
      fixed.onFillNodeId = undefined;
    }
    return fixed;
  });

  const reconciledSecrets = stageC.secrets.map((secret) => ({
    ...secret,
    requires: secret.requires.filter((r) => secretIds.has(r) && r !== secret.id),
  }));

  const nodesWithIncoming = new Set(validEdges.map((e) => e.to));
  const orphanedNodes = nodes.filter(
    (n) => n.id !== startNodeId && n.kind !== "ending" && !nodesWithIncoming.has(n.id) && !n.when
  );
  const autoFixEdges = orphanedNodes.map((orphan) => {
    const sameActNodes = nodes.filter((n) => n.act === orphan.act && n.id !== orphan.id);
    const prevNode = sameActNodes[sameActNodes.length - 1] ?? nodes[0];
    return {
      id: `auto-fix-${orphan.id}`,
      from: prevNode.id,
      to: orphan.id,
      kind: "auto" as const,
      onTraverseEffects: [],
      priority: 0,
    };
  });

  return {
    id: randomUUID(),
    version: brief.version,
    brief,
    startNodeId,
    nodes,
    edges: [...validEdges, ...autoFixEdges],
    clocks: reconciledClocks,
    fronts,
    secrets: reconciledSecrets,
    npcs,
    locations: stageC.locations,
    endings: reconcileEndings,
    createdAt: now,
    updatedAt: now,
  };
}
