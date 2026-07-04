import { NextResponse } from "next/server";
import type { Response as DeepAnswerAPIResponse } from "openai/resources/responses/responses";
import {
  buildDeepAnswerRequest,
  parseDeepAnswerResponse,
  type AnswerMode,
} from "@/lib/deepAnswer";

export const dynamic = "force-dynamic";
// research mode (high reasoning effort + web search) can take minutes
export const maxDuration = 300;

const MODES: AnswerMode[] = ["normal", "deep", "research"];

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY is not set on the server" },
      { status: 500 },
    );
  }

  let body: { query?: unknown; mode?: unknown; needWeb?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (!query) {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }
  const mode = MODES.includes(body.mode as AnswerMode) ? (body.mode as AnswerMode) : "deep";
  const needWeb = body.needWeb !== false;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildDeepAnswerRequest(query, mode, needWeb)),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error(`deep-answer upstream error (${response.status}):`, detail);
    return NextResponse.json(
      { error: `Responses API request failed (${response.status})` },
      { status: 502 },
    );
  }

  try {
    const data = (await response.json()) as DeepAnswerAPIResponse;
    return NextResponse.json(parseDeepAnswerResponse(data, query, mode));
  } catch (err) {
    console.error("deep-answer parse error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to parse deep answer" },
      { status: 502 },
    );
  }
}
