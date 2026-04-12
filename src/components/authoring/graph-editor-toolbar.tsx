"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfidenceBadge } from "./confidence-badge";
import { t } from "@/lib/i18n";

interface GraphEditorToolbarProps {
  sessionId: string;
  editMode: boolean;
  onToggleMode: () => void;
  selectedNodeId: string | null;
  warningCount: number;
  statBlockClamps?: number;
  threeClueViolations?: number;
  onSaveDraft: () => Promise<void>;
  onValidate: () => Promise<void>;
  onApprove: () => Promise<void>;
  onRegenNode: () => Promise<void>;
  onRegenAll: () => Promise<void>;
}

export function GraphEditorToolbar({
  editMode,
  onToggleMode,
  selectedNodeId,
  warningCount,
  statBlockClamps = 0,
  threeClueViolations = 0,
  onSaveDraft,
  onValidate,
  onApprove,
  onRegenNode,
  onRegenAll,
}: GraphEditorToolbarProps) {
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [approving, setApproving] = useState(false);
  const [regenning, setRegenning] = useState(false);

  async function handleSave() {
    setSaving(true);
    try { await onSaveDraft(); } finally { setSaving(false); }
  }

  async function handleValidate() {
    setValidating(true);
    try { await onValidate(); } finally { setValidating(false); }
  }

  async function handleApprove() {
    setApproving(true);
    try { await onApprove(); } finally { setApproving(false); }
  }

  async function handleRegenNode() {
    if (!selectedNodeId) return;
    setRegenning(true);
    try { await onRegenNode(); } finally { setRegenning(false); }
  }

  async function handleRegenAll() {
    setRegenning(true);
    try { await onRegenAll(); } finally { setRegenning(false); }
  }

  return (
    <div className="flex items-center gap-2 border-b border-zinc-700 bg-zinc-900 px-4 py-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={onToggleMode}
      >
        {editMode ? t("authoring.toolbarReadMode") : t("authoring.toolbarEditMode")}
      </Button>

      <div className="flex-1" />

      <ConfidenceBadge
        warningCount={warningCount}
        statBlockClamps={statBlockClamps}
        threeClueViolations={threeClueViolations}
      />

      {/* Amendment S — Regen-at-level buttons */}
      <Button
        variant="ghost"
        size="sm"
        disabled={regenning || !editMode}
        title={t("authoring.toolbarRegenFront")}
        onClick={() => {
          // TODO: POST to /api/sessions/[id]/generate with { scope: "front" }
          // when the route supports granular regen. For now, stub is visible.
        }}
      >
        {t("authoring.toolbarRegenFront")}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={regenning || !editMode}
        title={t("authoring.toolbarRegenClock")}
        onClick={() => {
          // TODO: POST to /api/sessions/[id]/generate with { scope: "clock" }
        }}
      >
        {t("authoring.toolbarRegenClock")}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        disabled={regenning || !editMode}
        title={t("authoring.toolbarRegenNpc")}
        onClick={() => {
          // TODO: POST to /api/sessions/[id]/generate with { scope: "npc" }
        }}
      >
        {t("authoring.toolbarRegenNpc")}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRegenNode}
        disabled={!selectedNodeId || regenning || !editMode}
      >
        {regenning ? t("authoring.toolbarRegenerating") : t("authoring.toolbarRegenNode")}
      </Button>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleRegenAll}
        disabled={regenning || !editMode}
      >
        {regenning ? t("authoring.toolbarRegenerating") : t("authoring.toolbarRegenAll")}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleValidate}
        disabled={validating}
      >
        {validating ? t("authoring.toolbarValidating") : t("authoring.toolbarValidate")}
      </Button>

      <Button
        variant="secondary"
        size="sm"
        onClick={handleSave}
        disabled={saving || !editMode}
      >
        {saving ? t("authoring.toolbarSaving") : t("authoring.toolbarSaveDraft")}
      </Button>

      <Button
        variant="primary"
        size="sm"
        onClick={handleApprove}
        disabled={approving}
      >
        {approving ? t("authoring.toolbarApproving") : t("authoring.toolbarApprove")}
      </Button>
    </div>
  );
}
