import { z } from "zod";
import { VersionSchema } from "./version";
import { SessionBriefSchema } from "./session-brief";

// ---------------------------------------------------------------------------
// Predicate — recursive discriminated union for entry gates / conditions
// ---------------------------------------------------------------------------

export type Predicate =
  | { op: "flag-set"; flag: string }
  | { op: "flag-unset"; flag: string }
  | { op: "clock-filled"; clockId: string }
  | { op: "clock-gte"; clockId: string; value: number }
  | { op: "var-gte"; path: string; value: number }
  | { op: "and"; children: Predicate[] }
  | { op: "or"; children: Predicate[] }
  | { op: "not"; child: Predicate };

export const PredicateSchema: z.ZodType<Predicate> = z.lazy(() =>
  z.discriminatedUnion("op", [
    z.object({ op: z.literal("flag-set"), flag: z.string() }),
    z.object({ op: z.literal("flag-unset"), flag: z.string() }),
    z.object({ op: z.literal("clock-filled"), clockId: z.string() }),
    z.object({
      op: z.literal("clock-gte"),
      clockId: z.string(),
      value: z.number(),
    }),
    z.object({
      op: z.literal("var-gte"),
      path: z.string(),
      value: z.number(),
    }),
    z.object({ op: z.literal("and"), children: z.array(PredicateSchema) }),
    z.object({ op: z.literal("or"), children: z.array(PredicateSchema) }),
    z.object({ op: z.literal("not"), child: PredicateSchema }),
  ])
);

// ---------------------------------------------------------------------------
// Effect
// ---------------------------------------------------------------------------

export const EffectSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set-flag"), flag: z.string() }),
  z.object({
    op: z.literal("tick-clock"),
    clockId: z.string(),
    segments: z.number().int().min(1).max(8),
  }),
  z.object({
    op: z.literal("set-var"),
    path: z.string(),
    value: z.union([z.number(), z.string(), z.boolean()]),
  }),
  z.object({ op: z.literal("reveal-secret"), secretId: z.string() }),
  z.object({
    op: z.literal("fire-portent"),
    frontId: z.string(),
    portentIndex: z.number().int(),
  }),
  z.object({
    op: z.literal("advance-spotlight"),
    characterName: z.string(),
  }),
]);

export type Effect = z.infer<typeof EffectSchema>;

// ---------------------------------------------------------------------------
// NodeKind
// ---------------------------------------------------------------------------

export const NodeKindSchema = z.enum([
  "strong-start",
  "scene",
  "hub",
  "cutscene",
  "combat-narrative",
  "combat-rolled",
  "exploration",
  "ending",
]);

export type NodeKind = z.infer<typeof NodeKindSchema>;

// ---------------------------------------------------------------------------
// SceneOutcomes — exit consequences by degree of success (Amendment I)
// ---------------------------------------------------------------------------

export const SceneOutcomesSchema = z.object({
  critSuccess: z.string().max(300).optional(),
  success: z.string().max(300).optional(),
  failure: z.string().max(300).optional(),
  critFailure: z.string().max(300).optional(),
});

export type SceneOutcomes = z.infer<typeof SceneOutcomesSchema>;

// ---------------------------------------------------------------------------
// SessionNode
// ---------------------------------------------------------------------------

export const SessionNodeSchema = z.object({
  id: z.string(),
  kind: NodeKindSchema,
  act: z.number().int().min(1).max(3),
  title: z.string().max(120),
  synopsis: z.string().max(400),
  prompt: z.string().max(4000),
  // Amendment I — Director reasoning fields
  objective: z.string().max(200).optional(),
  obstacles: z.array(z.string().max(200)).max(5).default([]),
  outcomes: SceneOutcomesSchema.optional(),
  estimatedMinutes: z.number().int().min(1).max(90).default(20),
  contentWarnings: z.array(z.string()).default([]),
  // --
  npcsPresent: z.array(z.string()).default([]),
  locationId: z.string().optional(),
  tensionLevel: z.number().min(0).max(10).default(3),
  tags: z.array(z.string()).default([]),
  when: PredicateSchema.optional(),
  onEnterEffects: z.array(EffectSchema).default([]),
  repeatable: z.boolean().default(false),
});

export type SessionNode = z.infer<typeof SessionNodeSchema>;

// ---------------------------------------------------------------------------
// SessionEdge
// ---------------------------------------------------------------------------

export const SessionEdgeSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  kind: z.enum(["choice", "auto", "fallback", "clock-trigger"]),
  label: z.string().max(120).optional(),
  condition: PredicateSchema.optional(),
  onTraverseEffects: z.array(EffectSchema).default([]),
  clockId: z.string().optional(),
  priority: z.number().int().default(0),
});

export type SessionEdge = z.infer<typeof SessionEdgeSchema>;

// ---------------------------------------------------------------------------
// Clock (Amendment J — polarity + tickSources)
// ---------------------------------------------------------------------------

export const ClockSchema = z.object({
  id: z.string(),
  label: z.string().max(120),
  segments: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  filled: z.number().int().min(0).default(0),
  onFillNodeId: z.string().optional(),
  frontId: z.string().optional(),
  // Amendment J — polarity for correct narration tone
  polarity: z.enum(["danger", "opportunity", "neutral"]).default("danger"),
  tickSources: z
    .array(z.enum(["hard-move", "fail", "time-skip", "scene-enter", "manual"]))
    .max(5) // Cap to prevent LLM degenerate repetition (CI found hundreds of "scene-enter" repeats)
    .default(["hard-move", "fail"]),
  lastTickSource: z
    .enum(["hard-move", "fail", "time-skip", "scene-enter", "manual"])
    .optional(),
});

export type Clock = z.infer<typeof ClockSchema>;

// ---------------------------------------------------------------------------
// Front (Dungeon World)
// ---------------------------------------------------------------------------

export const FrontSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  // Dungeon World Fronts require at least one stakes question — it's
  // the axis the Director plays to find out. An empty stakes array
  // means there's nothing for the Front to resolve.
  stakes: z.array(z.string()).min(1).max(5),
  dangers: z
    .array(
      z.object({
        name: z.string().max(120),
        impulse: z.string().max(200),
      })
    )
    .max(5),
  grimPortents: z.array(z.string()).min(3).max(5),
  impendingDoom: z.string().max(400),
  firedPortents: z.number().int().default(0),
});

export type Front = z.infer<typeof FrontSchema>;

// ---------------------------------------------------------------------------
// Secret (Amendment K — delivery vector)
// ---------------------------------------------------------------------------

export const SecretSchema = z.object({
  id: z.string(),
  text: z.string().max(400),
  conclusionTag: z.string(),
  discovered: z.boolean().default(false),
  delivery: z
    .enum([
      "npc-dialog",
      "environmental",
      "document",
      "overheard",
      "pc-backstory",
      "skill-check",
    ])
    .default("npc-dialog"),
  requires: z.array(z.string()).default([]),
});

export type Secret = z.infer<typeof SecretSchema>;

// ---------------------------------------------------------------------------
// NPC stat blocks (Amendment L — PF2e-correct)
// ---------------------------------------------------------------------------

export const SimpleStatBlockSchema = z.object({
  tier: z.literal("simple"),
  hp: z.number().int(),
  threat: z.enum(["trivial", "low", "moderate", "severe"]),
});

export type SimpleStatBlock = z.infer<typeof SimpleStatBlockSchema>;

export const Pf2eStrikeSchema = z.object({
  name: z.string().max(60),
  toHit: z.number().int(),
  damage: z.string(),
  traits: z.array(z.string()).default([]),
});

export type Pf2eStrike = z.infer<typeof Pf2eStrikeSchema>;

export const Pf2eStatBlockSchema = z.object({
  tier: z.literal("pf2e"),
  level: z.number().int().min(-1).max(25),
  ac: z.number().int(),
  hp: z.number().int(),
  perception: z.number().int(),
  saves: z.object({
    fort: z.number().int(),
    ref: z.number().int(),
    will: z.number().int(),
  }),
  strikes: z.array(Pf2eStrikeSchema).min(1).max(4),
  resistances: z
    .array(z.object({ type: z.string(), value: z.number().int() }))
    .default([]),
  weaknesses: z
    .array(z.object({ type: z.string(), value: z.number().int() }))
    .default([]),
  immunities: z.array(z.string()).default([]),
  specialAbilities: z.array(z.string()).max(6).default([]),
  reactions: z.array(z.string()).max(3).default([]),
  spellSlots: z
    .record(
      z.string(),
      z.object({
        slots: z.number().int().min(0),
        dc: z.number().int(),
        attack: z.number().int().optional(),
        list: z.array(z.string()).default([]),
      })
    )
    .optional(),
});

export type Pf2eStatBlock = z.infer<typeof Pf2eStatBlockSchema>;

export const NpcStatBlockSchema = z.discriminatedUnion("tier", [
  SimpleStatBlockSchema,
  Pf2eStatBlockSchema,
]);

export type NpcStatBlock = z.infer<typeof NpcStatBlockSchema>;

export const NpcSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  role: z.string().max(120),
  goal: z.string().max(200),
  voice: z.string().max(200),
  disposition: z.number().int().min(-3).max(3).default(0),
  statBlock: NpcStatBlockSchema.optional(),
});

export type Npc = z.infer<typeof NpcSchema>;

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------

export const LocationSchema = z.object({
  id: z.string(),
  name: z.string().max(120),
  aspects: z.array(z.string()).min(2).max(5),
  mapRef: z.string().optional(),
});

export type Location = z.infer<typeof LocationSchema>;

// ---------------------------------------------------------------------------
// Ending (Amendment M — category + frontOutcomes + defeat/TPK validator)
// ---------------------------------------------------------------------------

export const EndingSchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  condition: PredicateSchema,
  title: z.string().max(120),
  summary: z.string().max(400),
  category: z.enum([
    "victory",
    "mixed",
    "pyrrhic",
    "defeat",
    "tpk",
    "runaway",
  ]),
  frontOutcomes: z
    .record(
      z.string(),
      z.enum(["neutralized", "delayed", "escalated", "triumphed"])
    )
    .default({}),
});

export type Ending = z.infer<typeof EndingSchema>;

// ---------------------------------------------------------------------------
// Provenance — tracks fields the LLM invented rather than extracted from
// user-supplied import content. Populated by the import pipeline; the editor
// UI renders a "synthesized" badge next to any flagged field so the GM can
// review before approving. `["*"]` marks an entire entity as synthesized.
// Entity ids are free-form (scene id, npc id, secret id, etc.) and field
// paths are dot-delimited relative to the entity root.
// ---------------------------------------------------------------------------

export const ProvenanceSchema = z.object({
  synthesized: z.record(z.string(), z.array(z.string())),
});

export type Provenance = z.infer<typeof ProvenanceSchema>;

// ---------------------------------------------------------------------------
// SessionGraph — top-level authoring format
// ---------------------------------------------------------------------------

export const SessionGraphSchema = z
  .object({
    id: z.string(),
    version: VersionSchema,
    brief: SessionBriefSchema,
    startNodeId: z.string(),
    nodes: z.array(SessionNodeSchema).min(8).max(40),
    edges: z.array(SessionEdgeSchema),
    clocks: z.array(ClockSchema).min(2).max(8),
    fronts: z.array(FrontSchema).min(1).max(4),
    secrets: z.array(SecretSchema).min(6).max(20),
    npcs: z.array(NpcSchema).min(3).max(12),
    locations: z.array(LocationSchema).min(2).max(10),
    endings: z.array(EndingSchema).min(2).max(5),
    provenance: ProvenanceSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    validatedAt: z.string().datetime().optional(),
  })
  // Referential-integrity + design-invariant validators. These run as a
  // single `superRefine` so one parse pass surfaces all issues (not just
  // the first). Added post review #2 round 2 (TTRPG practitioner RED
  // verdict): without these, an LLM-emitted graph can pass `.parse()`
  // and still crash the Director on missing referents. See plan
  // Amendments I-M and the practitioner review §2 for rationale.
  .superRefine((g, ctx) => {
    const nodeIds = new Set(g.nodes.map((n) => n.id));
    const clockIds = new Set(g.clocks.map((c) => c.id));
    const frontIds = new Set(g.fronts.map((f) => f.id));
    const secretIds = new Set(g.secrets.map((s) => s.id));

    // 1) Amendment M — session must be losable.
    if (
      !g.endings.some((e) => e.category === "defeat" || e.category === "tpk")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endings"],
        message:
          "SessionGraph must contain at least one ending with category 'defeat' or 'tpk' — a session without a defeat path is un-losable.",
      });
    }

    // 2) startNodeId must exist and point at a strong-start node.
    const start = g.nodes.find((n) => n.id === g.startNodeId);
    if (!start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startNodeId"],
        message: `startNodeId '${g.startNodeId}' does not match any node in nodes[].`,
      });
    } else if (start.kind !== "strong-start") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startNodeId"],
        message: `startNodeId must point at a node with kind 'strong-start'; got '${start.kind}'.`,
      });
    }

    // 3) Edges: both endpoints exist; clock-trigger requires clockId.
    g.edges.forEach((e, i) => {
      if (!nodeIds.has(e.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "from"],
          message: `edge.from '${e.from}' does not exist in nodes[].`,
        });
      }
      if (!nodeIds.has(e.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["edges", i, "to"],
          message: `edge.to '${e.to}' does not exist in nodes[].`,
        });
      }
      if (e.kind === "clock-trigger") {
        if (!e.clockId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["edges", i, "clockId"],
            message: "clock-trigger edges must set clockId.",
          });
        } else if (!clockIds.has(e.clockId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["edges", i, "clockId"],
            message: `edge.clockId '${e.clockId}' does not exist in clocks[].`,
          });
        }
      }
    });

    // 4) Orphan-node check: every non-start, non-ending node needs an
    // incoming edge OR a `when` predicate that could pull the cursor in.
    const hasIncoming = new Set<string>();
    g.edges.forEach((e) => hasIncoming.add(e.to));
    g.nodes.forEach((n, i) => {
      if (n.id === g.startNodeId) return;
      if (n.kind === "ending") return;
      if (!hasIncoming.has(n.id) && !n.when) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["nodes", i],
          message: `node '${n.id}' is orphaned (no incoming edge and no when predicate).`,
        });
      }
    });

    // 5) Clock cross-references.
    g.clocks.forEach((c, i) => {
      if (c.onFillNodeId && !nodeIds.has(c.onFillNodeId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clocks", i, "onFillNodeId"],
          message: `clock.onFillNodeId '${c.onFillNodeId}' does not exist in nodes[].`,
        });
      }
      if (c.frontId && !frontIds.has(c.frontId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["clocks", i, "frontId"],
          message: `clock.frontId '${c.frontId}' does not exist in fronts[].`,
        });
      }
    });

    // 6) Ending nodeId must exist and be kind='ending'.
    g.endings.forEach((end, i) => {
      const endNode = g.nodes.find((n) => n.id === end.nodeId);
      if (!endNode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endings", i, "nodeId"],
          message: `ending.nodeId '${end.nodeId}' does not exist in nodes[].`,
        });
      } else if (endNode.kind !== "ending") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endings", i, "nodeId"],
          message: `ending points at node '${end.nodeId}' which has kind '${endNode.kind}', not 'ending'.`,
        });
      }
      // Verify frontOutcomes keys reference existing front ids.
      Object.keys(end.frontOutcomes).forEach((fid) => {
        if (!frontIds.has(fid)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["endings", i, "frontOutcomes", fid],
            message: `ending.frontOutcomes key '${fid}' does not exist in fronts[].`,
          });
        }
      });
    });

    // 7) Secrets: `requires` references known secret ids, no self-loops.
    g.secrets.forEach((s, i) => {
      s.requires.forEach((r, j) => {
        if (r === s.id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["secrets", i, "requires", j],
            message: `secret '${s.id}' cannot require itself.`,
          });
        } else if (!secretIds.has(r)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["secrets", i, "requires", j],
            message: `secret.requires '${r}' does not exist in secrets[].`,
          });
        }
      });
    });

    // 8) Effect cross-references on onEnterEffects + onTraverseEffects.
    const checkEffect = (
      eff: Effect,
      path: (string | number)[]
    ): void => {
      if (eff.op === "tick-clock" && !clockIds.has(eff.clockId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `effect.tick-clock clockId '${eff.clockId}' does not exist in clocks[].`,
        });
      }
      if (eff.op === "reveal-secret" && !secretIds.has(eff.secretId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `effect.reveal-secret secretId '${eff.secretId}' does not exist in secrets[].`,
        });
      }
      if (eff.op === "fire-portent" && !frontIds.has(eff.frontId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `effect.fire-portent frontId '${eff.frontId}' does not exist in fronts[].`,
        });
      }
    };
    g.nodes.forEach((n, i) =>
      n.onEnterEffects.forEach((eff, j) =>
        checkEffect(eff, ["nodes", i, "onEnterEffects", j])
      )
    );
    g.edges.forEach((e, i) =>
      e.onTraverseEffects.forEach((eff, j) =>
        checkEffect(eff, ["edges", i, "onTraverseEffects", j])
      )
    );

    // 9) Three-Clue Rule (design primitive #3): every conclusionTag that appears
    // in secrets must have at least 3 secrets pointing at it. A tag with fewer
    // than 3 clues means the party might be blocked if they miss one — violating
    // the core "Three-Clue Rule" principle from Justin Alexander's node design.
    const secretsByTag = new Map<string, number>();
    for (const s of g.secrets) {
      secretsByTag.set(s.conclusionTag, (secretsByTag.get(s.conclusionTag) ?? 0) + 1);
    }
    secretsByTag.forEach((count, tag) => {
      if (count < 3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["secrets"],
          message: `Three-Clue Rule violation: conclusionTag '${tag}' has only ${count} secret(s) — minimum 3 required so the party cannot be permanently blocked.`,
        });
      }
    });
  });

export type SessionGraph = z.infer<typeof SessionGraphSchema>;
