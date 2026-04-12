import { http, HttpResponse, passthrough } from "msw";
import { makeSession } from "@/tests/factories/session-factory";
import { makeGraph } from "@/tests/factories/graph-factory";

// ---------------------------------------------------------------------------
// Handlers for all 6 session API routes + passthroughs
// ---------------------------------------------------------------------------

export const handlers = [
  // GET /api/sessions/:id
  http.get("/api/sessions/:id", ({ params }) => {
    const session = makeSession("authoring", { id: params.id as string });
    return HttpResponse.json({ ok: true, session });
  }),

  // POST /api/sessions — create session
  http.post("/api/sessions", async () => {
    const session = makeSession("brief");
    return HttpResponse.json({ ok: true, session }, { status: 201 });
  }),

  // POST /api/sessions/:id/generate
  http.post("/api/sessions/:id/generate", ({ params }) => {
    const session = makeSession("authoring", {
      id: params.id as string,
      graph: makeGraph(),
    });
    return HttpResponse.json({ ok: true, session });
  }),

  // POST /api/sessions/:id/graph (PATCH)
  http.patch("/api/sessions/:id/graph", ({ params }) => {
    const session = makeSession("authoring", { id: params.id as string });
    return HttpResponse.json({ ok: true, session });
  }),

  // POST /api/sessions/:id/validate
  http.post("/api/sessions/:id/validate", () => {
    return HttpResponse.json({ ok: true, issues: [] });
  }),

  // POST /api/sessions/:id/approve
  http.post("/api/sessions/:id/approve", ({ params }) => {
    const session = makeSession("approved", { id: params.id as string });
    return HttpResponse.json({ ok: true, session });
  }),

  // POST /api/sessions/:id/nodes/:nodeId/regenerate
  http.post("/api/sessions/:id/nodes/:nodeId/regenerate", ({ params }) => {
    const session = makeSession("authoring", { id: params.id as string });
    return HttpResponse.json({ ok: true, session });
  }),

  // POST /api/director
  http.post("/api/director", () => {
    return HttpResponse.json({
      ok: true,
      narration: "Stub narration from MSW.",
      choices: [],
      phase: "narrating",
      lastMove: "cutscene",
      worldState: {
        clocks: {},
        flags: [],
        vars: {},
        spotlightDebt: {},
        turnCount: 1,
        lastDirectorMove: "cutscene",
        stallTicks: 0,
        elapsedMinutes: 20,
        ephemeralNpcs: [],
      },
      ended: false,
    });
  }),

  // Passthrough Next.js internals and static assets
  http.get("/_next/*", () => passthrough()),
  http.get("/favicon.ico", () => passthrough()),
];
