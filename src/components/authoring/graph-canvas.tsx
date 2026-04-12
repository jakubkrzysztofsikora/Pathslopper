"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  MarkerType,
  Position,
  Handle,
  useReactFlow,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";
import type { SessionGraph, SessionNode } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// Node kind color map
// ---------------------------------------------------------------------------

const KIND_COLOR: Record<string, string> = {
  "strong-start": "#d97706", // amber
  scene: "#6366f1",           // indigo
  hub: "#7c3aed",             // violet
  cutscene: "#475569",        // slate
  "combat-narrative": "#dc2626", // red
  "combat-rolled": "#b91c1c",    // dark red
  exploration: "#059669",        // emerald
  ending: "#0891b2",             // cyan
};

const ACT_LABELS: Record<number, string> = {
  1: "Akt I",
  2: "Akt II",
  3: "Akt III",
};

const NODE_WIDTH = 200;
const NODE_HEIGHT = 90;
const GROUP_PADDING = 40;

// ---------------------------------------------------------------------------
// Custom node component
// ---------------------------------------------------------------------------

interface SessionNodeData {
  node: SessionNode;
  selected: boolean;
}

const SessionNodeComponent = memo(function SessionNodeComponent({
  data,
}: {
  data: SessionNodeData;
}) {
  const { node } = data;
  const color = KIND_COLOR[node.kind] ?? "#52525b";

  return (
    <div
      style={{ borderColor: color }}
      className="min-w-[160px] max-w-[200px] rounded border-2 bg-zinc-800 px-3 py-2 shadow-lg"
    >
      <Handle type="target" position={Position.Left} className="!bg-zinc-500" />
      <div className="mb-1 flex items-center gap-1">
        <span
          className="rounded px-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ backgroundColor: color + "33", color }}
        >
          {node.kind}
        </span>
        <span className="ml-auto text-[10px] text-zinc-500">Akt {node.act}</span>
      </div>
      <p className="truncate text-xs font-medium text-zinc-100">{node.title}</p>
      {node.synopsis && (
        <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-400">{node.synopsis}</p>
      )}
      {node.tensionLevel >= 8 && (
        <span className="mt-1 inline-block rounded bg-red-900/50 px-1 text-[9px] text-red-400">
          Napięcie {node.tensionLevel}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-zinc-500" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// Group node — act swim lane
// ---------------------------------------------------------------------------

const ActGroupNode = memo(function ActGroupNode({
  data,
}: {
  data: { label: string };
}) {
  return (
    <div className="h-full w-full rounded-lg border border-dashed border-zinc-600 bg-zinc-900/30">
      <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
        {data.label}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ELKjs layout with group-by-act swim lanes (Amendment T + V)
// Falls back to dagre if ELKjs throws.
// ---------------------------------------------------------------------------

async function layoutGraphElk(
  graph: SessionGraph
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Build group nodes for each act present in the graph
  const actSet = new Set(graph.nodes.map((n) => n.act));
  const actsPresent = Array.from(actSet).sort();

  try {
    const ELK = (await import("elkjs/lib/elk.bundled.js")).default;
    const elk = new ELK();

    // Build ELK children per group (act)
    const groupChildren: Record<
      number,
      { id: string; width: number; height: number }[]
    > = {};
    for (const act of actsPresent) {
      groupChildren[act] = [];
    }
    for (const node of graph.nodes) {
      groupChildren[node.act] = groupChildren[node.act] ?? [];
      groupChildren[node.act].push({
        id: node.id,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
      });
    }

    const elkGraph = {
      id: "root",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.hierarchyHandling": "INCLUDE_CHILDREN",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.spacing.nodeNode": "60",
        "elk.layered.spacing.nodeNodeBetweenLayers": "80",
      },
      children: actsPresent.map((act) => ({
        id: `group-act-${act}`,
        layoutOptions: {
          "elk.algorithm": "layered",
          "elk.direction": "DOWN",
          "elk.padding": `[top=${GROUP_PADDING},left=${GROUP_PADDING},bottom=${GROUP_PADDING},right=${GROUP_PADDING}]`,
        },
        children: groupChildren[act],
      })),
      edges: graph.edges.map((e) => ({
        id: e.id,
        sources: [e.from],
        targets: [e.to],
      })),
    };

    const layout = await elk.layout(elkGraph);

    // Extract group node positions and sizes
    const rfNodes: Node[] = [];

    for (const groupLayout of layout.children ?? []) {
      const act = parseInt(groupLayout.id.replace("group-act-", ""), 10);
      rfNodes.push({
        id: groupLayout.id,
        type: "actGroup",
        position: {
          x: groupLayout.x ?? 0,
          y: groupLayout.y ?? 0,
        },
        style: {
          width: groupLayout.width ?? 400,
          height: groupLayout.height ?? 300,
        },
        data: { label: ACT_LABELS[act] ?? `Akt ${act}` },
        selectable: false,
        draggable: false,
      });

      for (const childLayout of groupLayout.children ?? []) {
        const sessionNode = graph.nodes.find((n) => n.id === childLayout.id);
        if (!sessionNode) continue;
        rfNodes.push({
          id: childLayout.id,
          type: "sessionNode",
          position: {
            x: (childLayout.x ?? 0) + GROUP_PADDING,
            y: (childLayout.y ?? 0) + GROUP_PADDING,
          },
          parentNode: groupLayout.id,
          extent: "parent",
          data: { node: sessionNode, selected: false },
        });
      }
    }

    const rfEdges: Edge[] = graph.edges.map((edge) => {
      const isDashed = edge.kind === "fallback" || edge.kind === "clock-trigger";
      return {
        id: edge.id,
        source: edge.from,
        target: edge.to,
        label: edge.label,
        animated: edge.kind === "clock-trigger",
        style: {
          strokeDasharray: isDashed ? "5,5" : undefined,
          stroke: edge.kind === "choice" ? "#d97706" : "#6b7280",
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: edge.kind === "choice" ? "#d97706" : "#6b7280",
        },
        labelStyle: { fill: "#a1a1aa", fontSize: 10 },
      };
    });

    return { nodes: rfNodes, edges: rfEdges };
  } catch (elkError) {
    // ELKjs failed — fall back to dagre for crossing minimization
    console.warn("[GraphCanvas] ELKjs layout failed, falling back to dagre:", elkError);
    return layoutGraphDagre(graph);
  }
}

async function layoutGraphDagre(
  graph: SessionGraph
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  const dagre = await import("dagre");
  const g = new dagre.default.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 50 });

  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }
  for (const edge of graph.edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.default.layout(g);

  const rfNodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: "sessionNode",
      position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      data: { node, selected: false },
    };
  });

  const rfEdges: Edge[] = graph.edges.map((edge) => {
    const isDashed = edge.kind === "fallback" || edge.kind === "clock-trigger";
    return {
      id: edge.id,
      source: edge.from,
      target: edge.to,
      label: edge.label,
      animated: edge.kind === "clock-trigger",
      style: {
        strokeDasharray: isDashed ? "5,5" : undefined,
        stroke: edge.kind === "choice" ? "#d97706" : "#6b7280",
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: edge.kind === "choice" ? "#d97706" : "#6b7280",
      },
      labelStyle: { fill: "#a1a1aa", fontSize: 10 },
    };
  });

  return { nodes: rfNodes, edges: rfEdges };
}

// ---------------------------------------------------------------------------
// GraphCanvasInner — uses useReactFlow hook, must be inside ReactFlowProvider
// ---------------------------------------------------------------------------

const nodeTypes: NodeTypes = {
  sessionNode: SessionNodeComponent,
  actGroup: ActGroupNode,
};

interface GraphCanvasInnerProps {
  graph: SessionGraph;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function GraphCanvasInner({ graph, selectedNodeId, onSelectNode }: GraphCanvasInnerProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();

  // Stable graph version reference — avoid re-layout on every render
  const graphVersion = useMemo(() => graph.updatedAt, [graph.updatedAt]);

  useEffect(() => {
    layoutGraphElk(graph).then(({ nodes: n, edges: e }) => {
      setNodes(n);
      setEdges(e);
      setTimeout(() => fitView({ padding: 0.1 }), 50);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphVersion, fitView]);

  // Update selected node styling — stable via useMemo
  const nodesWithSelection = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: { ...n.data, selected: n.id === selectedNodeId },
        style:
          n.id === selectedNodeId
            ? { ...n.style, filter: "brightness(1.3)" }
            : n.style,
      })),
    [nodes, selectedNodeId]
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      // Don't select group nodes
      if (node.type === "actGroup") return;
      onSelectNode(node.id === selectedNodeId ? null : node.id);
    },
    [onSelectNode, selectedNodeId]
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodesWithSelection}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onlyRenderVisibleElements
        fitView
        proOptions={{ hideAttribution: true }}
        className="bg-zinc-950"
      >
        <Background color="#27272a" gap={24} />
        <Controls className="[&_button]:border-zinc-700 [&_button]:bg-zinc-800 [&_button]:text-zinc-300" />
        <MiniMap
          nodeColor={(n) => {
            if (n.type === "actGroup") return "#27272a";
            return KIND_COLOR[(n.data as SessionNodeData).node?.kind] ?? "#52525b";
          }}
          className="border border-zinc-700 bg-zinc-900"
          maskColor="rgba(9,9,11,0.7)"
        />
      </ReactFlow>
    </div>
  );
}

// ---------------------------------------------------------------------------
// GraphCanvas — public export wraps with ReactFlowProvider
// ---------------------------------------------------------------------------

export interface GraphCanvasProps {
  graph: SessionGraph;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

export function GraphCanvas({ graph, selectedNodeId, onSelectNode }: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <GraphCanvasInner
        graph={graph}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    </ReactFlowProvider>
  );
}
