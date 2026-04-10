import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import {
  CharacterSheetUploader,
  fileToBase64,
} from "@/components/character-sheet/uploader";
import { useStoryDNAStore } from "@/lib/state/story-dna-store";
import { VERSION_SLIDER_DEFAULTS } from "@/lib/schemas/story-dna";
import { DEFAULT_BANNED_PHRASES } from "@/lib/prompts/banned-phrases";

function resetStore() {
  useStoryDNAStore.setState({
    version: "pf2e",
    sliders: { ...VERSION_SLIDER_DEFAULTS.pf2e },
    tags: {
      include: ["Dark Fantasy"],
      exclude: [...DEFAULT_BANNED_PHRASES],
    },
  });
}

describe("CharacterSheetUploader", () => {
  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("fileToBase64 converts small binary payload", async () => {
    const file = new File(["hi"], "sheet.png", { type: "image/png" });
    const b64 = await fileToBase64(file);
    expect(b64).toBe("aGk=");
  });

  it("renders the upload control with accepted mime types", () => {
    render(<CharacterSheetUploader />);
    const input = screen.getByTestId(
      "character-sheet-file-input"
    ) as HTMLInputElement;
    expect(input.accept).toContain("image/png");
    expect(input.accept).toContain("image/jpeg");
  });

  it("shows an error for unsupported file types without calling fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<CharacterSheetUploader />);
    const input = screen.getByTestId("character-sheet-file-input");
    const badFile = new File(["x"], "sheet.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Unsupported file type"
      );
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs parsed payload and renders success result (falls back to base64 when presigned URL unavailable)", async () => {
    const mockData = {
      version: "pf2e",
      name: "Kyra",
      ancestry: "Human",
      background: "Acolyte",
      class: "Cleric",
      level: 3,
      actionTags: ["Strike", "Heal"],
      proficiencies: { perception: "trained" },
      abilityScores: { str: 12, dex: 10, con: 14, int: 10, wis: 18, cha: 12 },
    };
    // First call is the presigned URL request — simulate Object Storage not configured
    // so the uploader falls back to the legacy base64 path.
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: "Object Storage not configured" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, data: mockData, warnings: [] }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    render(<CharacterSheetUploader />);
    const input = screen.getByTestId("character-sheet-file-input");
    const file = new File(["png-bytes"], "sheet.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("character-sheet-result")).toBeDefined();
    });

    // 2 calls total: presigned URL attempt (failed) + base64 POST (success)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const [url, init] = fetchSpy.mock.calls[1];
    expect(url).toBe("/api/character-sheet");
    const body = JSON.parse(init.body);
    expect(body.version).toBe("pf2e");
    expect(body.mimeType).toBe("image/png");
    expect(typeof body.imageBase64).toBe("string");
    expect(body.imageBase64.length).toBeGreaterThan(0);

    expect(screen.getByText("Kyra")).toBeDefined();
  });

  it("uses presigned URL path when Object Storage is available", async () => {
    const mockData = {
      version: "pf2e",
      name: "Seoni",
      ancestry: "Human",
      background: "Acolyte",
      class: "Sorcerer",
      level: 5,
      actionTags: ["Cast a Spell"],
      proficiencies: { perception: "trained" },
      abilityScores: { str: 8, dex: 14, con: 12, int: 10, wis: 10, cha: 18 },
    };

    const fetchSpy = vi
      .fn()
      // Step 1: presigned URL endpoint returns objectKey + putUrl
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          objectKey: "uploads/abc-123.png",
          putUrl: "https://s3.example.com/put-url",
          expiresIn: 300,
        }),
      })
      // Step 2: PUT to S3 succeeds
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      // Step 3: VLM POST with objectKey returns parsed data
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, data: mockData, warnings: [] }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    render(<CharacterSheetUploader />);
    const input = screen.getByTestId("character-sheet-file-input");
    const file = new File(["png-bytes"], "sheet.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("character-sheet-result")).toBeDefined();
    });

    // 3 calls: get presigned URL, PUT to S3, POST objectKey to VLM
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(fetchSpy.mock.calls[0][0]).toContain("/api/character-sheet/upload-url");
    expect(fetchSpy.mock.calls[1][1].method).toBe("PUT");
    const vlmBody = JSON.parse(fetchSpy.mock.calls[2][1].body);
    expect(vlmBody.objectKey).toBe("uploads/abc-123.png");
    expect(vlmBody.version).toBe("pf2e");
    expect(screen.getByText("Seoni")).toBeDefined();
  });

  it("renders API error message when response is not ok", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ ok: false, error: "Invalid sheet format" }),
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<CharacterSheetUploader />);
    const input = screen.getByTestId("character-sheet-file-input");
    const file = new File(["png-bytes"], "sheet.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain(
        "Invalid sheet format"
      );
    });
  });

  it("uses the current store version when posting (via base64 fallback)", async () => {
    // Presigned URL path not available — fall back so we can assert the version
    // is forwarded correctly on the base64 POST.
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ ok: false, error: "Object Storage not configured" }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            version: "pf1e",
            name: "Valeros",
            race: "Human",
            classes: ["Fighter"],
            level: 1,
            feats: ["Power Attack"],
            bab: 1,
            saves: { fortitude: 2, reflex: 0, will: 0 },
            abilityScores: { str: 16, dex: 12, con: 14, int: 10, wis: 10, cha: 8 },
          },
          warnings: [],
        }),
      });
    vi.stubGlobal("fetch", fetchSpy);

    useStoryDNAStore.getState().setVersion("pf1e");

    render(<CharacterSheetUploader />);
    const input = screen.getByTestId("character-sheet-file-input");
    fireEvent.change(input, {
      target: {
        files: [new File(["x"], "s.png", { type: "image/png" })],
      },
    });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
    // Second call is the base64 POST; first was the failed presigned URL attempt
    const body = JSON.parse(fetchSpy.mock.calls[1][1].body);
    expect(body.version).toBe("pf1e");
  });
});
