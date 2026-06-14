import { NextResponse, type NextRequest } from "next/server";
import type OpenAI from "openai";
import { ds, DEEPSEEK_MODEL } from "@/lib/agent/deepseek";
import { systemPrompt } from "@/lib/agent/system";
import { TOOLS, runTool } from "@/lib/agent/tools";
import { engineForCase } from "@/lib/screen/caseEngine";
import type { ScreenedCase } from "@/lib/screen/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  caseId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  stream?: boolean;
  // present for live/screened cases — the static engine can't see them, so the
  // client ships the case bundle and we serve tools from it.
  caseData?: ScreenedCase;
}

const MAX_TOOL_ROUNDS = 6;

type Param = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export async function POST(req: NextRequest) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return NextResponse.json(
      { error: "DEEPSEEK_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { caseId, messages } = body;
  if (!caseId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "caseId and messages are required" },
      { status: 400 },
    );
  }

  const eng = body.caseData ? engineForCase(body.caseData) : undefined;

  const convo: Param[] = [
    { role: "system", content: systemPrompt(caseId, eng) },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // ---- streaming path (ndjson: {type:"tool"|"text"|"error"}) ----------------
  if (body.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (o: unknown) =>
          controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        try {
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            const completion = await ds.chat.completions.create({
              model: DEEPSEEK_MODEL,
              messages: convo,
              tools: TOOLS,
              tool_choice: "auto",
              temperature: 0.2,
              stream: true,
            });

            let content = "";
            const toolCalls = new Map<
              number,
              { id: string; name: string; args: string }
            >();

            for await (const chunk of completion) {
              const choice = chunk.choices[0];
              const delta = choice?.delta;
              if (delta?.content) {
                content += delta.content;
                send({ type: "text", delta: delta.content });
              }
              for (const tcd of delta?.tool_calls ?? []) {
                const cur = toolCalls.get(tcd.index) ?? {
                  id: "",
                  name: "",
                  args: "",
                };
                if (tcd.id) cur.id = tcd.id;
                if (tcd.function?.name) cur.name = tcd.function.name;
                if (tcd.function?.arguments) cur.args += tcd.function.arguments;
                toolCalls.set(tcd.index, cur);
              }
            }

            if (toolCalls.size > 0) {
              const calls = [...toolCalls.values()];
              convo.push({
                role: "assistant",
                content: content || null,
                tool_calls: calls.map((c) => ({
                  id: c.id,
                  type: "function",
                  function: { name: c.name, arguments: c.args },
                })),
              });
              for (const c of calls) {
                let args: Record<string, unknown> = {};
                try {
                  args = JSON.parse(c.args || "{}");
                } catch {
                  /* tolerate */
                }
                send({ type: "tool", name: c.name });
                convo.push({
                  role: "tool",
                  tool_call_id: c.id,
                  content: runTool(c.name, args, caseId, eng),
                });
              }
              continue; // run another round with the tool results
            }
            break; // no tool calls — final answer already streamed
          }
          controller.close();
        } catch (e) {
          send({ type: "error", error: e instanceof Error ? e.message : "agent error" });
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-cache, no-transform",
      },
    });
  }

  // ---- non-streaming path (JSON; used by smoke tests) -----------------------
  const toolsRead: string[] = [];
  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const resp = await ds.chat.completions.create({
        model: DEEPSEEK_MODEL,
        messages: convo,
        tools: TOOLS,
        tool_choice: "auto",
        temperature: 0.2,
      });
      const msg = resp.choices[0]?.message;
      if (!msg) {
        return NextResponse.json({ error: "empty model response" }, { status: 502 });
      }
      convo.push(msg as Param);
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        return NextResponse.json({ text: msg.content ?? "", toolsRead });
      }
      for (const tc of calls) {
        if (tc.type !== "function") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}");
        } catch {
          /* tolerate */
        }
        toolsRead.push(tc.function.name);
        convo.push({
          role: "tool",
          tool_call_id: tc.id,
          content: runTool(tc.function.name, args, caseId, eng),
        });
      }
    }
    return NextResponse.json({ text: "(reached tool-call limit)", toolsRead });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "agent error" },
      { status: 502 },
    );
  }
}
