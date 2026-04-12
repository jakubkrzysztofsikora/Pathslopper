import type { SessionGraph } from "@/lib/schemas/session-graph";
import type { Effect, Predicate, SessionEdge } from "@/lib/schemas/session-graph";

// ---------------------------------------------------------------------------
// Ink identifier sanitizer
// Ink identifiers must match [a-zA-Z_][a-zA-Z0-9_]*
// ---------------------------------------------------------------------------
function sanitizeId(id: string): string {
  const sanitized = id.replace(/[^a-zA-Z0-9_]/g, "_").replace(/^([0-9])/, "_$1");
  // If the result is empty (e.g. all special chars), generate a fallback
  return sanitized || "_node";
}

function knotName(nodeId: string): string {
  return `knot_${sanitizeId(nodeId)}`;
}

// ---------------------------------------------------------------------------
// Ink reserved char escaping for prose text
//
// Ink reserves in prose / narrative text (not identifiers):
//   \        — escape char itself (must be first)
//   ~        — logic line marker (at any position)
//   { }      — conditionals / sequences
//   |        — sequence separator inside { }
//   #        — tag (at start of line)
//   ->       — divert (anywhere in line, e.g. "drużyna -> port" would divert)
//   <> / <>  — glue markers
//   ===      — knot separator (whole-line pattern, guard at line start)
//   *  +     — choice markers (at start of line)
//   //       — comment (at start of line or after whitespace)
// ---------------------------------------------------------------------------
function escapeInk(text: string): string {
  return text
    // 1. Backslash first (must precede all other replacements)
    .replace(/\\/g, "\\\\")
    // 2. Tilde (logic line — anywhere)
    .replace(/~/g, "\\~")
    // 3. Braces (conditionals)
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    // 4. Pipe (sequence separator inside braces, but safe to escape globally)
    .replace(/\|/g, "\\|")
    // 5. Divert arrow — -> anywhere in a line becomes prose text mid-sentence
    .replace(/->/g, "\\-\\>")
    // 6. Glue markers
    .replace(/<>/g, "\\<\\>")
    // 7. Hash — tag marker only when at start of line (after optional whitespace)
    .replace(/^(\s*)(#)/gm, "$1\\#")
    // 8. Choice markers at start of line (after optional whitespace)
    .replace(/^(\s*)(\*)/gm, "$1\\*")
    .replace(/^(\s*)(\+)/gm, "$1\\+")
    // 9. Comment double-slash at start of line (after optional whitespace)
    .replace(/^(\s*)(\/\/)/gm, "$1\\/\\/")
    // 10. Knot separator === at start of line
    .replace(/^(\s*)(={3,})/gm, "$1\\$2");
}

// ---------------------------------------------------------------------------
// Predicate → Ink conditional expression
// clockSegments: lookup map clockId → segments count for clock-filled
// ---------------------------------------------------------------------------
function renderPredicate(
  pred: Predicate,
  clockSegments: Map<string, number>
): string {
  switch (pred.op) {
    case "flag-set":
      return `flag_${sanitizeId(pred.flag)}`;
    case "flag-unset":
      return `not flag_${sanitizeId(pred.flag)}`;
    case "clock-filled": {
      const segs = clockSegments.get(pred.clockId) ?? 4;
      return `clock_${sanitizeId(pred.clockId)} >= ${segs}`;
    }
    case "clock-gte":
      return `clock_${sanitizeId(pred.clockId)} >= ${pred.value}`;
    case "var-gte":
      return `var_${sanitizeId(pred.path)} >= ${pred.value}`;
    case "and":
      return pred.children
        .map((c) => renderPredicate(c, clockSegments))
        .join(" && ");
    case "or":
      return pred.children
        .map((c) => `(${renderPredicate(c, clockSegments)})`)
        .join(" || ");
    case "not":
      return `!(${renderPredicate(pred.child, clockSegments)})`;
  }
}

// ---------------------------------------------------------------------------
// Effect → Ink tilde statement
// ---------------------------------------------------------------------------
function renderEffect(eff: Effect): string {
  switch (eff.op) {
    case "set-flag":
      return `~ flag_${sanitizeId(eff.flag)} = true`;
    case "tick-clock":
      return `~ clock_${sanitizeId(eff.clockId)} = clock_${sanitizeId(eff.clockId)} + ${eff.segments}`;
    case "set-var":
      return `~ var_${sanitizeId(eff.path)} = ${JSON.stringify(eff.value)}`;
    case "reveal-secret":
      return `~ secret_${sanitizeId(eff.secretId)}_discovered = true`;
    case "fire-portent":
      return `~ front_${sanitizeId(eff.frontId)}_portents = front_${sanitizeId(eff.frontId)}_portents + 1`;
    case "advance-spotlight":
      return `~ advance_spotlight("${eff.characterName}")`;
  }
}

// ---------------------------------------------------------------------------
// Collect all VAR declarations referenced in graph
// ---------------------------------------------------------------------------
function collectVarDeclarations(
  graph: SessionGraph,
  clockSegments: Map<string, number>
): string[] {
  const flags = new Set<string>();
  const clocks = new Set<string>();
  const secrets = new Set<string>();
  const fronts = new Set<string>();

  function scanPredicate(pred: Predicate): void {
    switch (pred.op) {
      case "flag-set":
      case "flag-unset":
        flags.add(pred.flag);
        break;
      case "clock-filled":
        clocks.add(pred.clockId);
        break;
      case "clock-gte":
        clocks.add(pred.clockId);
        break;
      case "var-gte":
        break;
      case "and":
        pred.children.forEach(scanPredicate);
        break;
      case "or":
        pred.children.forEach(scanPredicate);
        break;
      case "not":
        scanPredicate(pred.child);
        break;
    }
  }

  function scanEffect(eff: Effect): void {
    switch (eff.op) {
      case "set-flag":
        flags.add(eff.flag);
        break;
      case "tick-clock":
        clocks.add(eff.clockId);
        break;
      case "reveal-secret":
        secrets.add(eff.secretId);
        break;
      case "fire-portent":
        fronts.add(eff.frontId);
        break;
      default:
        break;
    }
  }

  for (const node of graph.nodes) {
    if (node.when) scanPredicate(node.when);
    node.onEnterEffects.forEach(scanEffect);
  }
  for (const edge of graph.edges) {
    if (edge.condition) scanPredicate(edge.condition);
    edge.onTraverseEffects.forEach(scanEffect);
  }
  // Ensure all graph-level clocks, secrets, fronts are always declared
  graph.clocks.forEach((c) => clocks.add(c.id));
  graph.secrets.forEach((s) => secrets.add(s.id));
  graph.fronts.forEach((f) => fronts.add(f.id));

  const lines: string[] = [];
  for (const flag of Array.from(flags).sort()) {
    lines.push(`VAR flag_${sanitizeId(flag)} = false`);
  }
  for (const clock of Array.from(clocks).sort()) {
    // Also declare a _max VAR so Director can tick-check at runtime
    const segs = clockSegments.get(clock) ?? 4;
    lines.push(`VAR clock_${sanitizeId(clock)} = 0`);
    lines.push(`VAR clock_${sanitizeId(clock)}_max = ${segs}`);
  }
  for (const secret of Array.from(secrets).sort()) {
    lines.push(`VAR secret_${sanitizeId(secret)}_discovered = false`);
  }
  for (const front of Array.from(fronts).sort()) {
    lines.push(`VAR front_${sanitizeId(front)}_portents = 0`);
  }

  return lines;
}

// ---------------------------------------------------------------------------
// renderInkSource — pure SessionGraph → .ink source text
// ---------------------------------------------------------------------------
export function renderInkSource(graph: SessionGraph): string {
  const lines: string[] = [];

  // Build clock segments lookup
  const clockSegments = new Map<string, number>(
    graph.clocks.map((c) => [c.id, c.segments])
  );

  // VAR declarations
  const varLines = collectVarDeclarations(graph, clockSegments);
  lines.push(...varLines);
  if (varLines.length > 0) lines.push("");

  // EXTERNAL function declarations
  lines.push("EXTERNAL roll_skill(skill, dc)");
  lines.push("EXTERNAL roll_attack(npc_id, target_ac)");
  lines.push("EXTERNAL pick_character()");
  lines.push("EXTERNAL advance_spotlight(name)");
  lines.push("");

  // Entry point
  lines.push(`-> ${knotName(graph.startNodeId)}`);
  lines.push("");

  // Build edge lookup by source node
  const edgesByFrom = new Map<string, SessionEdge[]>();
  for (const edge of graph.edges) {
    const bucket = edgesByFrom.get(edge.from) ?? [];
    bucket.push(edge);
    edgesByFrom.set(edge.from, bucket);
  }

  // Emit each node as a knot
  for (const node of graph.nodes) {
    lines.push(`=== ${knotName(node.id)} ===`);

    // On-enter effects
    for (const eff of node.onEnterEffects) {
      lines.push(renderEffect(eff));
    }

    // Node body — the prompt text
    // Guard: empty/undefined prompt would create an empty knot body which can
    // cause Ink compilation errors. Fall back to a placeholder.
    const promptText = (node.prompt ?? "").trim();
    lines.push(escapeInk(promptText || "(brak opisu)"));
    lines.push("");

    const outEdges = (edgesByFrom.get(node.id) ?? [])
      .filter((e) => e.kind !== "clock-trigger")
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

    const choiceEdges = outEdges.filter((e) => e.kind === "choice");
    const autoEdges = outEdges.filter((e) => e.kind === "auto");
    const fallbackEdges = outEdges.filter((e) => e.kind === "fallback");

    // Choice edges
    for (const edge of choiceEdges) {
      // Guard: empty/undefined label on a choice edge would emit an unlabelled choice
      // which Ink may not handle well. Provide a default.
      const rawLabel = (edge.label ?? "").trim();
      const label = rawLabel ? escapeInk(rawLabel) : "Kontynuuj";
      const traverse = edge.onTraverseEffects.map(renderEffect).join("\n");
      if (edge.condition) {
        const cond = renderPredicate(edge.condition, clockSegments);
        if (label) {
          lines.push(`* {${cond}} [${label}]`);
        } else {
          lines.push(`* {${cond}}`);
        }
      } else {
        if (label) {
          lines.push(`* [${label}]`);
        } else {
          lines.push("*");
        }
      }
      if (traverse) lines.push(traverse);
      lines.push(`  -> ${knotName(edge.to)}`);
    }

    // Auto edge (unconditional divert)
    for (const edge of autoEdges) {
      const traverse = edge.onTraverseEffects.map(renderEffect).join("\n");
      if (traverse) lines.push(traverse);
      lines.push(`-> ${knotName(edge.to)}`);
    }

    // Fallback edge (Ink fallback choice — no label)
    for (const edge of fallbackEdges) {
      const traverse = edge.onTraverseEffects.map(renderEffect).join("\n");
      lines.push("* ->");
      if (traverse) lines.push(traverse);
      lines.push(`  -> ${knotName(edge.to)}`);
    }

    lines.push("");
  }

  // Terminal divert — Ink requires a reachable END or all paths must terminate
  lines.push("-> END");
  lines.push("");

  return lines.join("\n");
}
