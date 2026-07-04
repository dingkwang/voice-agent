import { describe, expect, it } from "vitest";
import {
  FAILED_TRANSCRIPT_TEXT,
  PENDING_TRANSCRIPT_TEXT,
  reduceTranscript,
  type RealtimeEvent,
  type TranscriptEntry,
} from "./transcriptReducer";

function play(events: RealtimeEvent[], initial: TranscriptEntry[] = []): TranscriptEntry[] {
  return events.reduce(reduceTranscript, initial);
}

describe("reduceTranscript", () => {
  it("keeps the user entry before the assistant answer even when transcription arrives last", () => {
    // Real-world arrival order: the user item is added, the assistant streams
    // and finishes its whole answer, and only then does the async input
    // transcription complete.
    const entries = play([
      { type: "conversation.item.added", item: { id: "item_1", role: "user" } },
      { type: "response.output_audio_transcript.delta", response_id: "resp_1", delta: "她今年" },
      { type: "response.output_audio_transcript.delta", response_id: "resp_1", delta: "三十八岁。" },
      { type: "response.output_audio_transcript.done", response_id: "resp_1", transcript: "她今年三十八岁。" },
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item_1",
        transcript: "她今年多大了?",
      },
    ]);

    expect(entries.map((e) => e.role)).toEqual(["user", "assistant"]);
    expect(entries[0]).toEqual({
      id: "item_1",
      role: "user",
      text: "她今年多大了?",
      final: true,
    });
    expect(entries[1].text).toBe("她今年三十八岁。");
    expect(entries[1].final).toBe(true);
  });

  it("shows a pending placeholder until transcription completes", () => {
    const entries = play([
      { type: "conversation.item.added", item: { id: "item_1", role: "user" } },
    ]);
    expect(entries).toEqual([
      { id: "item_1", role: "user", text: PENDING_TRANSCRIPT_TEXT, final: false },
    ]);
  });

  it("finalizes the placeholder with a failure marker when transcription fails", () => {
    const entries = play([
      { type: "conversation.item.added", item: { id: "item_1", role: "user" } },
      { type: "conversation.item.input_audio_transcription.failed", item_id: "item_1" },
    ]);
    expect(entries).toEqual([
      { id: "item_1", role: "user", text: FAILED_TRANSCRIPT_TEXT, final: true },
    ]);
  });

  it("skips app-injected input_text items (no transcription ever fills them)", () => {
    const entries = play([
      {
        type: "conversation.item.added",
        item: { id: "item_txt", role: "user", content: [{ type: "input_text" }] },
      },
    ]);
    expect(entries).toEqual([]);

    // Audio items carry input_audio content and must still get a placeholder.
    const audioEntries = play([
      {
        type: "conversation.item.added",
        item: { id: "item_1", role: "user", content: [{ type: "input_audio" }] },
      },
    ]);
    expect(audioEntries).toEqual([
      { id: "item_1", role: "user", text: PENDING_TRANSCRIPT_TEXT, final: false },
    ]);
  });

  it("ignores assistant and duplicate item.added events", () => {
    const afterAssistant = play([
      { type: "conversation.item.added", item: { id: "item_a", role: "assistant" } },
    ]);
    expect(afterAssistant).toEqual([]);

    const once = play([
      { type: "conversation.item.added", item: { id: "item_1", role: "user" } },
      { type: "conversation.item.added", item: { id: "item_1", role: "user" } },
    ]);
    expect(once).toHaveLength(1);
  });

  it("still creates the user entry if item.added was missed", () => {
    const entries = play([
      {
        type: "conversation.item.input_audio_transcription.completed",
        item_id: "item_1",
        transcript: "你好",
      },
    ]);
    expect(entries).toEqual([{ id: "item_1", role: "user", text: "你好", final: true }]);
  });

  it("returns the same array reference for irrelevant events", () => {
    const prev: TranscriptEntry[] = [];
    expect(reduceTranscript(prev, { type: "session.updated" })).toBe(prev);
  });
});
