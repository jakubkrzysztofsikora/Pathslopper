import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractJsonBlock } from "@/lib/llm/structured-output";

const MinSchema = z.object({
  name: z.string().min(1),
  count: z.number().int().nonnegative(),
});

describe("extractJsonBlock", () => {
  it("returns ok=false with error when no fenced block exists", () => {
    const result = extractJsonBlock("The corridor reeks of damp stone.", MinSchema);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toContain("No ```json");
  });

  it("extracts a single valid fenced block", () => {
    const md = `Intro.\n\n\`\`\`json\n${JSON.stringify({ name: "Kyra", count: 3 })}\n\`\`\``;
    const result = extractJsonBlock(md, MinSchema);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ name: "Kyra", count: 3 });
  });

  it("when multiple fenced blocks are present, the LAST one is extracted", () => {
    const md = `Example block:\n\n\`\`\`json\n${JSON.stringify({ name: "Example", count: 1 })}\n\`\`\`\n\nActual result:\n\n\`\`\`json\n${JSON.stringify({ name: "Real", count: 2 })}\n\`\`\`\n`;
    const result = extractJsonBlock(md, MinSchema);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ name: "Real", count: 2 });
  });

  it("returns ok=false and preserves raw when JSON is syntactically invalid", () => {
    const md = `Description.\n\n\`\`\`json\n{ name: "Kyra", count: 3,, }\n\`\`\``;
    const result = extractJsonBlock(md, MinSchema);
    expect(result.ok).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.error).toMatch(/JSON parse error/);
    expect(result.raw).toContain("Kyra");
  });

  it("returns ok=false with schema validation error when JSON is valid but schema-invalid", () => {
    const md = `\`\`\`json\n${JSON.stringify({ name: "", count: -5 })}\n\`\`\``;
    const result = extractJsonBlock(md, MinSchema);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Schema validation error/);
    expect(result.raw).toContain("\"name\"");
  });

  it("case-insensitive on the json tag", () => {
    const md = "```JSON\n{\"name\":\"Kyra\",\"count\":1}\n```";
    const result = extractJsonBlock(md, MinSchema);
    expect(result.ok).toBe(true);
    expect(result.data?.name).toBe("Kyra");
  });
});
