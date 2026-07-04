export interface TranscriptEntry {
  id: string;
  role: "user" | "assistant";
  text: string;
  final: boolean;
}

export interface RealtimeEvent {
  type: string;
  item_id?: string;
  response_id?: string;
  transcript?: string;
  delta?: string;
  item?: { id?: string; role?: string; content?: Array<{ type?: string }> };
  error?: { message?: string };
}

export const PENDING_TRANSCRIPT_TEXT = "…";
export const FAILED_TRANSCRIPT_TEXT = "(转写失败)";

function upsert(
  prev: TranscriptEntry[],
  id: string,
  role: TranscriptEntry["role"],
  textDelta: string,
  final: boolean,
): TranscriptEntry[] {
  const existing = prev.find((e) => e.id === id);
  if (!existing) {
    return [...prev, { id, role, text: textDelta, final }];
  }
  return prev.map((e) =>
    e.id === id ? { ...e, text: final ? textDelta : e.text + textDelta, final } : e,
  );
}

// Input transcription is an async side-job that usually completes after the
// assistant's streamed reply, so entries must be anchored to the transcript at
// conversation.item.added time (true turn order), not at transcription-arrival
// time. The placeholder is filled in when transcription completes.
export function reduceTranscript(
  prev: TranscriptEntry[],
  event: RealtimeEvent,
): TranscriptEntry[] {
  switch (event.type) {
    case "conversation.item.added": {
      const item = event.item;
      // App-injected text turns (sendTextTurn) are input_text-only items; no
      // transcription event will ever fill their placeholder, so skip them.
      const isTextOnly =
        !!item?.content?.length && item.content.every((p) => p.type === "input_text");
      if (item?.role === "user" && item.id && !isTextOnly && !prev.some((e) => e.id === item.id)) {
        return [
          ...prev,
          { id: item.id, role: "user", text: PENDING_TRANSCRIPT_TEXT, final: false },
        ];
      }
      return prev;
    }
    case "conversation.item.input_audio_transcription.completed":
      if (event.item_id && event.transcript) {
        return upsert(prev, event.item_id, "user", event.transcript, true);
      }
      return prev;
    case "conversation.item.input_audio_transcription.failed":
      if (event.item_id) {
        return upsert(prev, event.item_id, "user", FAILED_TRANSCRIPT_TEXT, true);
      }
      return prev;
    case "response.output_audio_transcript.delta":
      if (event.response_id && event.delta) {
        return upsert(prev, event.response_id, "assistant", event.delta, false);
      }
      return prev;
    case "response.output_audio_transcript.done":
      if (event.response_id && event.transcript) {
        return upsert(prev, event.response_id, "assistant", event.transcript, true);
      }
      return prev;
    default:
      return prev;
  }
}
