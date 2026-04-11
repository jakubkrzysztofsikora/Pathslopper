"use client";

import * as React from "react";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { cn } from "@/lib/utils/cn";
import { t, format } from "@/lib/i18n";
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

// ~5 MB raw file cap. Server enforces ~6 MB decoded via the zod schema;
// this client-side guard rejects oversize before we spend time base64-encoding.
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

function isAcceptedMime(mime: string): mime is AcceptedMime {
  return (ACCEPTED_TYPES as readonly string[]).includes(mime);
}

function formatApiError(error: unknown, fallback: string): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const flat = error as { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
    const form = flat.formErrors?.join(", ");
    const fields = flat.fieldErrors
      ? Object.entries(flat.fieldErrors)
          .map(([k, v]) => `${k}: ${v.join(", ")}`)
          .join("; ")
      : "";
    const combined = [form, fields].filter((s) => s && s.length > 0).join(" | ");
    if (combined) return combined;
  }
  return fallback;
}

async function uploadViaPresignedUrl(
  file: File,
  version: string
): Promise<CharacterSheetParsed> {
  // Step 1: Get presigned PUT URL from server
  const urlRes = await fetch(
    `/api/character-sheet/upload-url?mimeType=${encodeURIComponent(file.type)}`
  );
  const urlJson = await urlRes.json();
  if (!urlRes.ok || !urlJson.ok)
    throw new Error(urlJson.error || "Failed to get upload URL");

  // Step 2: PUT raw binary directly to Object Storage (no base64 overhead)
  const putRes = await fetch(urlJson.putUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) throw new Error(`Upload failed: ${putRes.status}`);

  // Step 3: POST objectKey to VLM route so server generates a GET URL
  const vlmRes = await fetch("/api/character-sheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ objectKey: urlJson.objectKey, version }),
  });
  const vlmJson = await vlmRes.json();
  if (!vlmRes.ok || !vlmJson.ok)
    throw new Error(vlmJson.error || "VLM parsing failed");
  return vlmJson.data as CharacterSheetParsed;
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
  const resultRef = React.useRef<HTMLDivElement>(null);
  const inFlightRef = React.useRef(false);

  // Move focus to the result panel once parsing finishes so keyboard and
  // screen-reader users don't lose context after an async success.
  React.useEffect(() => {
    if (state.status === "success" && resultRef.current) {
      resultRef.current.focus();
    }
  }, [state.status]);

  async function handleFile(file: File) {
    if (inFlightRef.current) return;
    if (!isAcceptedMime(file.type)) {
      setState({
        status: "error",
        message: format(t("characterSheet.unsupportedMime"), {
          mime: file.type || "nieznany",
        }),
      });
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setState({
        status: "error",
        message: format(t("characterSheet.fileTooLarge"), {
          sizeMb: (file.size / 1024 / 1024).toFixed(1),
          maxMb: (MAX_FILE_BYTES / 1024 / 1024).toFixed(0),
        }),
      });
      return;
    }
    inFlightRef.current = true;
    setState({ status: "loading" });
    try {
      let parsed: CharacterSheetParsed;
      let warnings: string[] = [];

      try {
        // Preferred path: presigned PUT URL avoids base64 encoding overhead
        // and keeps large binaries out of the JSON POST body.
        parsed = await uploadViaPresignedUrl(file, version);
      } catch {
        // Fall back to legacy base64 path (e.g., Object Storage not configured,
        // CORS misconfiguration, or local dev without SCW credentials).
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
            message: formatApiError(json.error, t("characterSheet.genericError")),
          });
          return;
        }
        parsed = json.data as CharacterSheetParsed;
        warnings = Array.isArray(json.warnings) ? json.warnings : [];
      }

      setState({
        status: "success",
        data: parsed,
        warnings,
      });
      // Best-effort: persist parsed character to the server session if one exists.
      const sessionId = window.sessionStorage.getItem("pathfinder-nexus:sessionId");
      if (sessionId) {
        fetch(`/api/sessions/${sessionId}/characters`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed),
        }).catch(() => {}); // best-effort, don't block the UI
      }
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : t("characterSheet.genericError"),
      });
    } finally {
      inFlightRef.current = false;
      // Reset the file input value so re-selecting the same file
      // (e.g., to retry after an error) triggers onChange again.
      // Browsers otherwise swallow identical consecutive selections.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const fileInputId = "character-sheet-file-input-id";

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
          {t("characterSheet.heading")}
        </h2>
        <p className="text-sm text-zinc-300 mt-1">
          {format(t("characterSheet.lead"), {
            versionLabel: version === "pf1e" ? "Pathfinder 1e" : "Pathfinder 2e",
          })}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <label
          htmlFor={fileInputId}
          className="text-sm font-medium text-zinc-200"
        >
          {t("characterSheet.uploadLabel")}
        </label>
        <input
          id={fileInputId}
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          data-testid="character-sheet-file-input"
          className="block w-full text-sm text-zinc-200 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-amber-600 file:text-zinc-950 file:font-medium hover:file:bg-amber-500 file:cursor-pointer"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />

        {state.status === "loading" && (
          <p className="text-sm text-amber-400" role="status">
            {t("characterSheet.parsing")}
          </p>
        )}

        {state.status === "error" && (
          <p className="text-sm text-red-400" role="alert">
            {state.message}
          </p>
        )}

        {state.status === "success" && (
          <div
            ref={resultRef}
            tabIndex={-1}
            aria-live="polite"
            className="rounded-md border border-zinc-700 bg-zinc-950 p-4 focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="character-sheet-result"
          >
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-base font-semibold text-amber-400">
                {state.data.name}
              </h3>
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                {state.data.version}
              </span>
            </div>
            <pre className="text-xs text-zinc-200 overflow-x-auto whitespace-pre-wrap">
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
