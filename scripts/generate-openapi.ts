/**
 * Generates an OpenAPI 3.0 specification from all route schemas using
 * @asteasolutions/zod-to-openapi and writes it to `openapi.yaml`.
 *
 * Usage:
 *   npx tsx scripts/generate-openapi.ts
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OpenAPIRegistry,
  OpenApiGeneratorV3,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { SessionBriefSchema } from "../src/lib/schemas/session-brief";
import { SessionGraphSchema } from "../src/lib/schemas/session-graph";
import { SessionStateSchema } from "../src/lib/schemas/session";

const registry = new OpenAPIRegistry();

// Register schemas
registry.register("SessionBrief", SessionBriefSchema);
registry.register("SessionGraph", SessionGraphSchema);
registry.register("SessionState", SessionStateSchema);

// POST /api/sessions — create session
registry.registerPath({
  method: "post",
  path: "/api/sessions",
  summary: "Create a new session",
  request: {
    body: {
      content: {
        "application/json": {
          schema: z.object({
            version: z.enum(["pf1e", "pf2e"]),
            brief: SessionBriefSchema,
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Session created",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true), session: SessionStateSchema }),
        },
      },
    },
  },
});

// GET /api/sessions/{id}
registry.registerPath({
  method: "get",
  path: "/api/sessions/{id}",
  summary: "Get session by ID",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Session found",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true), session: SessionStateSchema }),
        },
      },
    },
    404: { description: "Session not found" },
  },
});

// POST /api/sessions/{id}/generate
registry.registerPath({
  method: "post",
  path: "/api/sessions/{id}/generate",
  summary: "Trigger graph generation for a session",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Graph generation started",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true), session: SessionStateSchema }),
        },
      },
    },
  },
});

// POST /api/sessions/{id}/validate
registry.registerPath({
  method: "post",
  path: "/api/sessions/{id}/validate",
  summary: "Validate the session graph",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Validation result",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.boolean(),
            issues: z.array(z.object({ message: z.string(), path: z.string() })),
          }),
        },
      },
    },
  },
});

// POST /api/sessions/{id}/approve
registry.registerPath({
  method: "post",
  path: "/api/sessions/{id}/approve",
  summary: "Approve the session graph and compile ink",
  request: {
    params: z.object({ id: z.string() }),
  },
  responses: {
    200: {
      description: "Session approved",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true), session: SessionStateSchema }),
        },
      },
    },
  },
});

// POST /api/sessions/{id}/director
registry.registerPath({
  method: "post",
  path: "/api/sessions/{id}/director",
  summary: "Run a Director tick",
  request: {
    params: z.object({ id: z.string() }),
    body: {
      content: {
        "application/json": {
          schema: z.object({
            type: z.enum(["start", "continue", "choice", "player-input", "skip"]),
            choiceIndex: z.number().optional(),
            playerInput: z.string().optional(),
            characterName: z.string().optional(),
          }),
        },
      },
    },
  },
  responses: {
    200: {
      description: "Director tick result",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true) }),
        },
      },
    },
  },
});

// POST /api/sessions/{id}/nodes/{nodeId}/regenerate
registry.registerPath({
  method: "post",
  path: "/api/sessions/{id}/nodes/{nodeId}/regenerate",
  summary: "Regenerate a single graph node",
  request: {
    params: z.object({ id: z.string(), nodeId: z.string() }),
  },
  responses: {
    200: {
      description: "Node regenerated",
      content: {
        "application/json": {
          schema: z.object({ ok: z.literal(true), session: SessionStateSchema }),
        },
      },
    },
  },
});

const generator = new OpenApiGeneratorV3(registry.definitions);
const document = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    title: "Pathfinder Nexus API",
    version: "0.1.0",
    description: "AI-driven Game Master backend API",
  },
  servers: [{ url: "/", description: "Current host" }],
});

// Convert to YAML using JSON.stringify (simple manual YAML isn't worth a dep)
// Output as JSON-formatted YAML-compatible structure, then convert
function toYaml(obj: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (obj === null || obj === undefined) return `${pad}null\n`;
  if (typeof obj === "boolean") return `${pad}${obj}\n`;
  if (typeof obj === "number") return `${pad}${obj}\n`;
  if (typeof obj === "string") {
    const escaped = obj.replace(/'/g, "''");
    if (obj.includes("\n") || obj.includes(":") || obj.includes("#") || obj.startsWith(" ")) {
      return `${pad}'${escaped}'\n`;
    }
    return `${pad}${obj}\n`;
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return `${pad}[]\n`;
    return obj
      .map((item) => {
        const rendered = toYaml(item, indent + 1).trimStart();
        return `${pad}- ${rendered}`;
      })
      .join("");
  }
  if (typeof obj === "object") {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) return `${pad}{}\n`;
    return entries
      .map(([k, v]) => {
        const vRendered = toYaml(v, indent + 1);
        if (
          typeof v === "object" &&
          v !== null &&
          !Array.isArray(v) &&
          Object.keys(v).length > 0
        ) {
          return `${pad}${k}:\n${vRendered}`;
        }
        if (Array.isArray(v) && v.length > 0) {
          return `${pad}${k}:\n${vRendered}`;
        }
        return `${pad}${k}: ${vRendered.trimStart()}`;
      })
      .join("");
  }
  return `${pad}${String(obj)}\n`;
}

const yaml = `# Auto-generated by scripts/generate-openapi.ts — do not edit manually.\n${toYaml(document)}`;
const outPath = resolve(process.cwd(), "openapi.yaml");
writeFileSync(outPath, yaml, "utf-8");
console.log(`OpenAPI spec written to ${outPath}`);
