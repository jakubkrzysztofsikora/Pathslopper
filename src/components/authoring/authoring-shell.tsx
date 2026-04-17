"use client";

import { useState, useCallback, useEffect } from "react";
import type { SessionState } from "@/lib/schemas/session";
import type { SessionGraph, SessionNode, Npc, Secret } from "@/lib/schemas/session-graph";
import { GraphCanvas } from "./graph-canvas";
import { NodeInspector } from "./node-inspector";
import { GraphEditorToolbar } from "./graph-editor-toolbar";
import { ClockTracker } from "./clock-tracker";
import { clearSynthesizedPath } from "./synthesized-badge";
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
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem("pfnexus:authoring-onboarding-dismissed");
    if (!dismissed) setShowOnboarding(true);
  }, []);

  const selectedNode = graph.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const handleUpdateNode = useCallback((nodeId: string, patch: Partial<SessionNode>) => {
    setGraph((prev) => {
      let nextProvenance = prev.provenance ?? { synthesized: {} };
      for (const field of Object.keys(patch)) {
        nextProvenance = clearSynthesizedPath(nextProvenance, nodeId, field);
      }
      return {
        ...prev,
        nodes: prev.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
        provenance: Object.keys(nextProvenance.synthesized).length > 0 ? nextProvenance : undefined,
      };
    });
  }, []);

  async function handleSaveDraft() {
    const res = await fetch(`/api/sessions/${session.id}/graph`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patch: { nodes: graph.nodes, provenance: graph.provenance } }),
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

      {/* Onboarding banner */}
      {showOnboarding && (
        <div className="border-b border-amber-700/40 bg-amber-950/20 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="font-display text-sm font-semibold text-amber-300">
                {t("authoring.onboardingTitle")}
              </p>
              <p className="mt-1 text-xs text-zinc-300">{t("authoring.onboardingBody")}</p>
              <ol className="mt-2 list-inside list-decimal space-y-0.5 text-xs text-zinc-400">
                <li>{t("authoring.onboardingStep1")}</li>
                <li>{t("authoring.onboardingStep2")}</li>
                <li>{t("authoring.onboardingStep3")}</li>
              </ol>
              <p className="mt-2 text-[11px] text-zinc-500">{t("authoring.onboardingNote")}</p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md border border-amber-700/40 bg-amber-900/30 px-3 py-1 text-xs text-amber-300 transition-colors hover:bg-amber-900/50"
              onClick={() => {
                setShowOnboarding(false);
                localStorage.setItem("pfnexus:authoring-onboarding-dismissed", "1");
              }}
            >
              {t("authoring.onboardingDismiss")}
            </button>
          </div>
        </div>
      )}

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
              <ul className="space-y-1.5">
                {graph.npcs.map((npc: Npc) => (
                  <li key={npc.id} className="flex items-center gap-2 text-xs">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-900/30 text-[10px] font-bold text-amber-400">
                      {npc.name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <span className="font-medium text-zinc-200">{npc.name}</span>
                      <span className="ml-1 text-zinc-500">{npc.role}</span>
                    </div>
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
              <ClockTracker clocks={graph.clocks} />
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
              <ul className="space-y-1.5">
                {graph.secrets.map((s: Secret) => (
                  <li key={s.id} className="flex items-start gap-1.5 text-xs text-zinc-400">
                    <span className="mt-0.5 shrink-0 text-zinc-600">🔒</span>
                    <span className="line-clamp-2 hover:line-clamp-none transition-all cursor-help">
                      {s.text}
                    </span>
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
            provenance={graph.provenance}
            onUpdate={handleUpdateNode}
            onRegen={handleRegenNode}
          />
        </aside>
      </div>
    </div>
  );
}
