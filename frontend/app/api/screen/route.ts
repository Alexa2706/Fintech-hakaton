import { NextResponse, type NextRequest } from "next/server";
import { mapLiveResponse, screenMock } from "@/lib/screen/bridge";
import type { LiveScreenResponse, ScreenPayload } from "@/lib/screen/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENGINE_URL = process.env.ENGINE_URL ?? "http://127.0.0.1:8000";
const BACKEND = process.env.SCREEN_BACKEND ?? "auto"; // auto | live | mock
const TIMEOUT_MS = 4000;

async function callLive(payload: ScreenPayload): Promise<LiveScreenResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ENGINE_URL}/screen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        scenario: payload.scenario,
        amount: payload.amount ?? "0",
        asset: payload.asset ?? null,
        currency: payload.currency ?? null,
        originator: payload.originator,
        beneficiary: payload.beneficiary,
        ownership_node: payload.ownershipNode ?? null,
        request_id: payload.requestId ?? null,
      }),
    });
    if (!res.ok) throw new Error(`engine ${res.status}`);
    return (await res.json()) as LiveScreenResponse;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  let payload: ScreenPayload;
  try {
    payload = (await req.json()) as ScreenPayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!payload?.scenario) {
    return NextResponse.json({ error: "scenario required" }, { status: 400 });
  }

  if (BACKEND === "mock") {
    return NextResponse.json({ case: screenMock(payload), via: "mock" });
  }

  try {
    const live = await callLive(payload);
    return NextResponse.json({ case: mapLiveResponse(live, "live"), via: "live" });
  } catch (e) {
    if (BACKEND === "live") {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "engine unreachable" },
        { status: 502 },
      );
    }
    // auto: degrade to the offline mock so the demo never breaks
    return NextResponse.json({ case: screenMock(payload), via: "mock" });
  }
}
