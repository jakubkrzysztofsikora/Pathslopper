"use client";

import { useState } from "react";
import type { SessionNode, Npc, Location } from "@/lib/schemas/session-graph";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface NodeInspectorProps {
  node: SessionNode | null;
  npcs: Npc[];
  locations: Location[];
  editMode: boolean;
  onUpdate: (nodeId: string, patch: Partial<SessionNode>) => void;
  onRegen: (nodeId: string) => Promise<void>;
}

export function NodeInspector({ node, npcs, locations, editMode, onUpdate, onRegen }: NodeInspectorProps) {
  const [regenning, setRegenning] = useState(false);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-zinc-500">
        {t("authoring.inspectorNoSelection")}
      </div>
    );
  }

  async function handleRegen() {
    if (!node) return;
    setRegenning(true);
    try { await onRegen(node.id); } finally { setRegenning(false); }
  }

  function field(label: string, children: React.ReactNode) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-400">{label}</label>
        {children}
      </div>
    );
  }

  const inputClass =
    "w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 " +
    "placeholder-zinc-500 focus:border-amber-500 focus:outline-none disabled:opacity-60";

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-amber-400 uppercase tracking-wide">{node.kind}</span>
        <span className="text-xs text-zinc-500">Akt {node.act}</span>
      </div>

      {field(t("authoring.inspectorTitleLabel"),
        <input
          className={inputClass}
          value={node.title}
          disabled={!editMode}
          onChange={(e) => onUpdate(node.id, { title: e.target.value })}
        />
      )}

      {field(t("authoring.inspectorSynopsisLabel"),
        <textarea
          className={inputClass}
          rows={3}
          value={node.synopsis}
          disabled={!editMode}
          onChange={(e) => onUpdate(node.id, { synopsis: e.target.value })}
        />
      )}

      {field(t("authoring.inspectorPromptLabel"),
        <textarea
          className={inputClass}
          rows={5}
          value={node.prompt}
          disabled={!editMode}
          onChange={(e) => onUpdate(node.id, { prompt: e.target.value })}
        />
      )}

      {field(t("authoring.inspectorTensionLabel"),
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={10}
            value={node.tensionLevel}
            disabled={!editMode}
            onChange={(e) => onUpdate(node.id, { tensionLevel: Number(e.target.value) })}
            className="flex-1 accent-amber-500"
          />
          <span className="w-6 text-right text-sm text-zinc-300">{node.tensionLevel}</span>
        </div>
      )}

      {field(t("authoring.inspectorNpcsLabel"),
        <div className="flex flex-wrap gap-1">
          {npcs.map((npc) => {
            const selected = node.npcsPresent.includes(npc.id);
            return (
              <button
                key={npc.id}
                type="button"
                disabled={!editMode}
                onClick={() => {
                  const next = selected
                    ? node.npcsPresent.filter((id) => id !== npc.id)
                    : [...node.npcsPresent, npc.id];
                  onUpdate(node.id, { npcsPresent: next });
                }}
                className={
                  "rounded px-2 py-0.5 text-xs " +
                  (selected
                    ? "bg-amber-700 text-zinc-100"
                    : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600") +
                  (editMode ? "" : " opacity-60 cursor-default")
                }
              >
                {npc.name}
              </button>
            );
          })}
        </div>
      )}

      {field(t("authoring.inspectorLocationLabel"),
        <select
          className={inputClass}
          value={node.locationId ?? ""}
          disabled={!editMode}
          onChange={(e) => onUpdate(node.id, { locationId: e.target.value || undefined })}
        >
          <option value="">—</option>
          {locations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
        </select>
      )}

      {field(t("authoring.inspectorTagsLabel"),
        <input
          className={inputClass}
          value={node.tags.join(", ")}
          disabled={!editMode}
          placeholder="tag1, tag2"
          onChange={(e) =>
            onUpdate(node.id, {
              tags: e.target.value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      )}

      <div className="pt-2">
        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          disabled={regenning || !editMode}
          onClick={handleRegen}
        >
          {regenning ? t("authoring.inspectorRegenerating") : t("authoring.inspectorRegenButton")}
        </Button>
      </div>

      {/* Raw predicate display (Amendment note: full predicate-builder is post-MVP) */}
      {node.when && (
        <div className="rounded border border-zinc-700 bg-zinc-800/50 p-2">
          <p className="mb-1 text-xs font-medium text-zinc-500">Warunek wejścia (when)</p>
          <pre className="whitespace-pre-wrap break-all text-xs text-zinc-400">
            {JSON.stringify(node.when, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
