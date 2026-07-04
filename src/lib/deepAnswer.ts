import type {
  Response as DeepAnswerAPIResponse,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import type { ReasoningEffort } from "openai/resources/shared";

export type AnswerMode = "normal" | "deep" | "research";

export interface AnswerSource {
  title: string;
  url: string;
}

export interface AnswerObject {
  id: string;
  query: string;
  mode: AnswerMode;
  spokenSummary: string;
  fullAnswer: string;
  sources: AnswerSource[];
  createdAt: string;
}

// gpt-5.5 is newer than the pinned SDK's model union (which still accepts
// arbitrary strings); override via env if the API rejects it.
export const DEEP_ANSWER_MODEL = process.env.DEEP_ANSWER_MODEL ?? "gpt-5.5";

const MODE_EFFORT: Record<AnswerMode, ReasoningEffort> = {
  normal: "low",
  deep: "medium",
  research: "high",
};

const ANSWER_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    spoken_summary: {
      type: "string",
      description:
        "2-4 sentences suitable for text-to-speech, in the same language as the user's query.",
    },
    full_answer: {
      type: "string",
      description: "Detailed answer in Markdown with inline citations.",
    },
    sources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          url: { type: "string" },
        },
        required: ["title", "url"],
        additionalProperties: false,
      },
    },
  },
  required: ["spoken_summary", "full_answer", "sources"],
  additionalProperties: false,
};

export function buildDeepAnswerRequest(
  query: string,
  mode: AnswerMode,
  needWeb: boolean,
): ResponseCreateParamsNonStreaming {
  return {
    model: DEEP_ANSWER_MODEL,
    reasoning: { effort: MODE_EFFORT[mode] },
    tools: needWeb
      ? [
          {
            type: "web_search",
            ...(mode === "research" ? { search_context_size: "high" as const } : {}),
          },
        ]
      : [],
    text: {
      format: {
        type: "json_schema",
        name: "deep_answer",
        schema: ANSWER_SCHEMA,
        strict: true,
      },
    },
    input: [
      "You are the background reasoner for a realtime voice agent.",
      "The user is in a live voice conversation; a lightweight realtime model handles",
      "the chit-chat and has told the user a researched answer is coming.",
      needWeb
        ? "Search the web for current information before answering; cite your sources."
        : "Answer from your own knowledge.",
      "",
      "User asked:",
      query,
      "",
      "Return spoken_summary (2-4 sentences, voice-friendly, same language as the user),",
      "full_answer (detailed Markdown with citations), and sources (title + url of the",
      "important cited pages).",
    ].join("\n"),
  };
}

interface ParsedAnswerPayload {
  spoken_summary?: unknown;
  full_answer?: unknown;
  sources?: unknown;
}

// The raw Responses API JSON: answer text (our JSON payload) lives in
// message output items; web_search citations arrive as url_citation
// annotations on the same output_text parts.
export function parseDeepAnswerResponse(
  response: DeepAnswerAPIResponse,
  query: string,
  mode: AnswerMode,
): AnswerObject {
  let text = "";
  const citedSources: AnswerSource[] = [];
  for (const item of response.output ?? []) {
    if (item.type !== "message") continue;
    for (const part of item.content) {
      if (part.type !== "output_text") continue;
      text += part.text;
      for (const annotation of part.annotations ?? []) {
        if (annotation.type === "url_citation") {
          citedSources.push({ title: annotation.title, url: annotation.url });
        }
      }
    }
  }

  let payload: ParsedAnswerPayload;
  try {
    payload = JSON.parse(text) as ParsedAnswerPayload;
  } catch {
    throw new Error("Deep answer output was not valid JSON");
  }
  if (typeof payload.spoken_summary !== "string" || typeof payload.full_answer !== "string") {
    throw new Error("Deep answer output is missing spoken_summary or full_answer");
  }

  const modelSources = Array.isArray(payload.sources)
    ? payload.sources.filter(
        (s): s is AnswerSource =>
          typeof (s as AnswerSource)?.url === "string" &&
          typeof (s as AnswerSource)?.title === "string",
      )
    : [];
  const seen = new Set<string>();
  const sources = [...modelSources, ...citedSources].filter((s) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });

  return {
    id: response.id,
    query,
    mode,
    spokenSummary: payload.spoken_summary,
    fullAnswer: payload.full_answer,
    sources,
    createdAt: new Date().toISOString(),
  };
}

const RESEARCH_TRIGGERS = ["deep research", "深入研究", "调研", "research"];
const DEEP_TRIGGERS = [
  "查一下",
  "查查",
  "查询",
  "搜一下",
  "搜索",
  "搜一搜",
  "最新",
  "详细",
  "有没有产品",
  "deep",
  "search",
  "look up",
];

// Route A trigger: run on each finalized user transcript. Keyword-based v1;
// replaced by realtime tool calling (Route B) later.
export function detectDeepAnswerTrigger(text: string): { mode: AnswerMode } | null {
  const lower = text.toLowerCase();
  if (RESEARCH_TRIGGERS.some((k) => lower.includes(k))) return { mode: "research" };
  if (DEEP_TRIGGERS.some((k) => lower.includes(k))) return { mode: "deep" };
  return null;
}
