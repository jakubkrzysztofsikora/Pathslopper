"use client";

import * as React from "react";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { cn } from "@/lib/utils/cn";
import type { CharacterSheetParsed } from "@/lib/schemas/character-sheet";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "success"; data: CharacterSheetParsed; warnings: string[] };

const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

type AcceptedMime = (typeof ACCEPTED_TYPES)[number];

function isAcceptedMime(mime: string): mime is AcceptedMime {
  return (ACCEPTED_TYPES as readonly string[]).includes(mime);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader error"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("FileReader returned non-string result"));
        return;
      }
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

export interface CharacterSheetUploaderProps {
  className?: string;
}

export function CharacterSheetUploader({
  className,
}: CharacterSheetUploaderProps) {
  const version = useStoryDNAStore((s) => s.version);
  const [state, setState] = React.useState<State>({ status: "idle" });
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!isAcceptedMime(file.type)) {
      setState({
        status: "error",
        message: `Unsupported file type: ${file.type || "unknown"}.`,
      });
      return;
    }
    setState({ status: "loading" });
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/character-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: file.type,
          version,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setState({
          status: "error",
          message:
            typeof json.error === "string"
              ? json.error
              : "Character sheet parsing failed.",
        });
        return;
      }
      setState({
        status: "success",
        data: json.data as CharacterSheetParsed,
        warnings: Array.isArray(json.warnings) ? json.warnings : [],
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed.",
      });
    }
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-zinc-700 bg-zinc-900 p-6",
        className
      )}
      aria-labelledby="character-sheet-uploader-heading"
    >
      <div className="mb-4">
        <h2
          id="character-sheet-uploader-heading"
          className="text-lg font-semibold text-zinc-100"
        >
          Character Sheet — Vision Ingest
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Upload a photo or scan of a paper sheet. The VLM parses layout-aware
          data for {version === "pf1e" ? "Pathfinder 1e" : "Pathfinder 2e"}.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          data-testid="character-sheet-file-input"
          className="block w-full text-sm text-zinc-300 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-amber-600 file:text-zinc-950 file:font-medium hover:file:bg-amber-500 file:cursor-pointer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {state.status === "loading" && (
          <p className="text-sm text-amber-400" role="status">
            Parsing sheet with vision model...
          </p>
        )}

        {state.status === "error" && (
          <p className="text-sm text-red-400" role="alert">
            {state.message}
          </p>
        )}

        {state.status === "success" && (
          <div
            className="rounded-md border border-zinc-700 bg-zinc-950 p-4"
            data-testid="character-sheet-result"
          >
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-base font-semibold text-amber-400">
                {state.data.name}
              </h3>
              <span className="text-xs uppercase tracking-wide text-zinc-500">
                {state.data.version}
              </span>
            </div>
            <pre className="text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(state.data, null, 2)}
            </pre>
            {state.warnings.length > 0 && (
              <ul className="mt-3 border-t border-zinc-800 pt-2 text-xs text-amber-400">
                {state.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
