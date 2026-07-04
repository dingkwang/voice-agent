import { describe, expect, it } from "vitest";
import type { Response as DeepAnswerAPIResponse } from "openai/resources/responses/responses";
import {
  buildDeepAnswerRequest,
  detectDeepAnswerTrigger,
  parseDeepAnswerResponse,
} from "./deepAnswer";

describe("detectDeepAnswerTrigger", () => {
  it("maps Chinese and English search keywords to deep mode", () => {
    expect(detectDeepAnswerTrigger("帮我查一下 Thinking Machines 有没有产品")).toEqual({
      mode: "deep",
    });
    expect(detectDeepAnswerTrigger("搜索最新的 GPT 新闻")).toEqual({ mode: "deep" });
    expect(detectDeepAnswerTrigger("Please search for the latest release")).toEqual({
      mode: "deep",
    });
    expect(detectDeepAnswerTrigger("用 Deep mode 回答")).toEqual({ mode: "deep" });
  });

  it("maps research keywords to research mode", () => {
    expect(detectDeepAnswerTrigger("帮我深入研究一下这个方向")).toEqual({
      mode: "research",
    });
    expect(detectDeepAnswerTrigger("do a deep research on this")).toEqual({
      mode: "research",
    });
  });

  it("does not trigger on plain chat", () => {
    expect(detectDeepAnswerTrigger("你好，今天天气怎么样")).toBeNull();
    expect(detectDeepAnswerTrigger("给我讲个笑话")).toBeNull();
  });
});

describe("buildDeepAnswerRequest", () => {
  it("maps mode to reasoning effort", () => {
    expect(buildDeepAnswerRequest("q", "normal", true).reasoning?.effort).toBe("low");
    expect(buildDeepAnswerRequest("q", "deep", true).reasoning?.effort).toBe("medium");
    expect(buildDeepAnswerRequest("q", "research", true).reasoning?.effort).toBe("high");
  });

  it("includes the web_search tool only when needWeb is set", () => {
    expect(buildDeepAnswerRequest("q", "deep", true).tools).toEqual([
      { type: "web_search" },
    ]);
    expect(buildDeepAnswerRequest("q", "research", true).tools).toEqual([
      { type: "web_search", search_context_size: "high" },
    ]);
    expect(buildDeepAnswerRequest("q", "deep", false).tools).toEqual([]);
  });

  it("requests strict JSON-schema output with the answer fields", () => {
    const format = buildDeepAnswerRequest("q", "deep", true).text?.format;
    expect(format?.type).toBe("json_schema");
    if (format?.type !== "json_schema") throw new Error("expected json_schema format");
    expect(format.strict).toBe(true);
    expect(Object.keys(format.schema.properties as Record<string, unknown>)).toEqual([
      "spoken_summary",
      "full_answer",
      "sources",
    ]);
    expect(buildDeepAnswerRequest("最新进展?", "deep", true).input).toContain("最新进展?");
  });
});

function apiResponse(text: string, annotations: unknown[] = []): DeepAnswerAPIResponse {
  return {
    id: "resp_1",
    output: [
      {
        type: "message",
        id: "msg_1",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text, annotations, logprobs: [] }],
      },
    ],
  } as unknown as DeepAnswerAPIResponse;
}

describe("parseDeepAnswerResponse", () => {
  const payload = {
    spoken_summary: "简短摘要。",
    full_answer: "完整答案，带引用。",
    sources: [{ title: "Official docs", url: "https://example.com/docs" }],
  };

  it("extracts the three answer fields", () => {
    const answer = parseDeepAnswerResponse(apiResponse(JSON.stringify(payload)), "q", "deep");
    expect(answer.id).toBe("resp_1");
    expect(answer.spokenSummary).toBe("简短摘要。");
    expect(answer.fullAnswer).toBe("完整答案，带引用。");
    expect(answer.sources).toEqual(payload.sources);
    expect(answer.mode).toBe("deep");
    expect(answer.query).toBe("q");
  });

  it("merges url_citation annotations into sources and dedupes by URL", () => {
    const answer = parseDeepAnswerResponse(
      apiResponse(JSON.stringify(payload), [
        { type: "url_citation", title: "Official docs", url: "https://example.com/docs", start_index: 0, end_index: 1 },
        { type: "url_citation", title: "News", url: "https://example.com/news", start_index: 0, end_index: 1 },
      ]),
      "q",
      "deep",
    );
    expect(answer.sources).toEqual([
      { title: "Official docs", url: "https://example.com/docs" },
      { title: "News", url: "https://example.com/news" },
    ]);
  });

  it("throws on non-JSON or incomplete output", () => {
    expect(() => parseDeepAnswerResponse(apiResponse("not json"), "q", "deep")).toThrow(
      /not valid JSON/,
    );
    expect(() =>
      parseDeepAnswerResponse(apiResponse(JSON.stringify({ spoken_summary: "x" })), "q", "deep"),
    ).toThrow(/missing/);
  });
});
