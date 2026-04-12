"use client";

import { useState, useCallback } from "react";
import type { SessionState } from "@/lib/schemas/session";
import type { SessionGraph, SessionNode, Npc, Clock, Secret } from "@/lib/schemas/session-graph";
import { GraphCanvas } from "./graph-canvas";
import { NodeInspector } from "./node-inspector";
import { GraphEditorToolbar } from "./graph-editor-toolbar";
import { t } from "@/lib/i18n";
import { useRouter } from "next/navigation";

interface AuthoringShellProps {
  session: SessionState;
}

export function AuthoringShell({ session }: AuthoringShellProps) {
  const router = useRouter();
  const [graph, setGraph] = useState<SessionGraph>(session.graph!);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [warningCount, setWarningCount] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<SessionNode>) => {
    setGraph((prev) => ({
      ...prev,
      nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }));
  }, []);

  async function handleSaveDraft() {
    const res = await fetch(`/api/sessions/${session.id}/graph`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { nodes: graph.nodes } }),
    });
    const json = await res.json();
    if (json.ok) {
      setStatusMessage(t("common.save") + " OK");
    }
  }

  async function handleValidate() {
    const res = await fetch(`/api/sessions/${session.id}/validate`, { method: "POST" });
    const json = await res.json();
    if (json.ok) {
      setWarningCount(json.issues.length);
      setStatusMessage(
        json.issues.length === 0
          ? t("authoring.validateSuccess")
          : t("authoring.validateErrors").replace("{count}", String(json.issues.length))
      );
    }
  }

  async function handleApprove() {
    const res = await fetch(`/api/sessions/${session.id}/approve`, { method: "POST" });
    const json = await res.json();
    if (json.ok) {
      setStatusMessage(t("authoring.approveSuccess"));
      router.push(`/sesja/${session.id}`);
    } else {
      setStatusMessage(`${t("authoring.approveError")}: ${json.error}`);
    }
  }

  async function handleRegenNode() {
    if (!selectedNodeId) return;
    const res = await fetch(
      `/api/sessions/${session.id}/nodes/${selectedNodeId}/regenerate`,
      { method: "POST" }
    );
    const json = await res.json();
    if (json.ok && json.session?.graph) {
      setGraph(json.session.graph);
    }
  }

  async function handleRegenAll() {
    // Full regenerate — call the generate endpoint
    const res = await fetch(`/api/sessions/${session.id}/generate`, { method: "POST" });
    const json = await res.json();
    if (json.ok && json.session?.graph) {
      setGraph(json.session.graph);
    }
  }

  const brief = graph.brief;

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Top toolbar */}
      <GraphEditorToolbar
        sessionId={session.id}
        editMode={editMode}
        onToggleMode={() => setEditMode((m) => !m)}
        selectedNodeId={selectedNodeId}
        warningCount={warningCount}
        onSaveDraft={handleSaveDraft}
        onValidate={handleValidate}
        onApprove={handleApprove}
        onRegenNode={handleRegenNode}
        onRegenAll={handleRegenAll}
      />

      {/* Status bar */}
      {statusMessage && (
        <div className="border-b border-zinc-700 bg-zinc-800/50 px-4 py-1.5 text-xs text-zinc-300">
          {statusMessage}
          <button
            type="button"
            className="ml-2 text-zinc-500 hover:text-zinc-300"
            onClick={() => setStatusMessage(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Main layout: sidebar | canvas | inspector */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <aside className="flex w-56 flex-col gap-4 overflow-y-auto border-r border-zinc-700 bg-zinc-900 p-3 text-sm">
          {/* Brief summary */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("authoring.sidebarBriefHeading")}
            </h2>
            <p className="text-xs text-zinc-400">{brief.tone}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{brief.setting.slice(0, 80)}</p>
            <p className="mt-1 text-xs text-zinc-500">
              {brief.partySize} graczy, poziom {brief.partyLevel}
            </p>
          </section>

          {/* NPCs */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("authoring.sidebarNpcsHeading")}
            </h2>
            {graph.npcs.length === 0 ? (
              <p className="text-xs text-zinc-600">{t("authoring.sidebarNpcsEmpty")}</p>
            ) : (
              <ul className="space-y-1">
                {graph.npcs.map((npc: Npc) => (
                  <li key={npc.id} className="text-xs text-zinc-300">
                    <span className="font-medium">{npc.name}</span>
                    <span className="ml-1 text-zinc-500">{npc.role}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Clocks */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("authoring.sidebarClocksHeading")}
            </h2>
            {graph.clocks.length === 0 ? (
              <p className="text-xs text-zinc-600">{t("authoring.sidebarClocksEmpty")}</p>
            ) : (
              <ul className="space-y-1.5">
                {graph.clocks.map((clock: Clock) => (
                  <li key={clock.id}>
                    <div className="mb-0.5 flex justify-between text-xs">
                      <span className="text-zinc-300">{clock.label}</span>
                      <span className="text-zinc-500">{clock.filled}/{clock.segments}</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className="h-full bg-amber-500 transition-all"
                        style={{ width: `${(clock.filled / clock.segments) * 100}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Secrets */}
          <section>
            <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("authoring.sidebarSecretsHeading")}
            </h2>
            {graph.secrets.length === 0 ? (
              <p className="text-xs text-zinc-600">{t("authoring.sidebarSecretsEmpty")}</p>
            ) : (
              <ul className="space-y-1">
                {graph.secrets.map((s: Secret) => (
                  <li key={s.id} className="text-xs text-zinc-400">
                    {s.text.slice(0, 60)}{s.text.length > 60 ? "…" : ""}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>

        {/* Center canvas */}
        <div className="flex-1 overflow-hidden">
          <GraphCanvas
            graph={graph}
            selectedNodeId={selectedNodeId}
            onSelectNode={setSelectedNodeId}
          />
        </div>

        {/* Right inspector */}
        <aside className="w-72 overflow-y-auto border-l border-zinc-700 bg-zinc-900">
          <NodeInspector
            node={selectedNode}
            npcs={graph.npcs}
            locations={graph.locations}
            editMode={editMode}
            onUpdate={handleUpdateNode}
            onRegen={handleRegenNode}
          />
        </aside>
      </div>
    </div>
  );
}
