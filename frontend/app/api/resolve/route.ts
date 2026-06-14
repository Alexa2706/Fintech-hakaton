import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";

// Live fuzzy name-match readout for the screening form. Proxies the Python
// /resolve; on any failure returns a null match so the form degrades quietly.
export async function POST(req: NextRequest) {
  let body: { name?: string; type?: string };
  try {
    body = (await req.json()) as { name?: string; type?: string };
  } catch {
    return NextResponse.json({ matched_entity: null, name_score: 0 });
  }
  if (!body.name || body.name.trim().length < 3) {
    return NextResponse.json({ matched_entity: null, name_score: 0 });
  }

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2500);
  try {
    const res = await fetch(`${ENGINE_URL}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ name: body.name, type: body.type ?? "business" }),
    });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    return NextResponse.json(await res.json());
  } catch {
    return NextResponse.json({ matched_entity: null, name_score: 0, offline: true });
  } finally {
    clearTimeout(t);
  }
}
