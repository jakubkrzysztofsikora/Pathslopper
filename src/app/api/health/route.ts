import { NextResponse } from "next/server";

// Self-contained liveness probe for Scaleway Serverless Container health
// checks. MUST NOT touch LLM_API_KEY, the LLM client, Redis, or any
// other external dependency — a failing upstream must not take the
// container offline. Returns 200 as long as the Node process is running.

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "pathfinder-nexus",
    uptime: Math.round(process.uptime()),
  });
}
