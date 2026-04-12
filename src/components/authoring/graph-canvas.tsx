"use client";

import { memo, useCallback, useEffect, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeTypes,
  type EdgeTypes,
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
// Build React Flow nodes + edges from SessionGraph using dagre layout
// ---------------------------------------------------------------------------

async function layoutGraph(
  graph: SessionGraph
): Promise<{ nodes: Node[]; edges: Edge[] }> {
  // Dagre fallback layout (ELKjs requires web worker, skip for now)
  const dagre = await import("dagre");
  const g = new dagre.default.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 50 });

  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 90;

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

const nodeTypes: NodeTypes = { sessionNode: SessionNodeComponent };

interface GraphCanvasInnerProps {
  graph: SessionGraph;
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

function GraphCanvasInner({ graph, selectedNodeId, onSelectNode }: GraphCanvasInnerProps) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const { fitView } = useReactFlow();

  useEffect(() => {
    layoutGraph(graph).then(({ nodes: n, edges: e }) => {
      setNodes(n);
      setEdges(e);
      // Fit after layout
      setTimeout(() => fitView({ padding: 0.1 }), 50);
    });
  }, [graph, fitView]);

  // Update selected node styling
  const nodesWithSelection = nodes.map((n) => ({
    ...n,
    data: { ...n.data, selected: n.id === selectedNodeId },
    style: n.id === selectedNodeId ? { filter: "brightness(1.3)" } : {},
  }));

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
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
          nodeColor={(n) => KIND_COLOR[(n.data as SessionNodeData).node.kind] ?? "#52525b"}
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
