import type {
  RealtimeSessionCreateRequest,
  SessionUpdateEvent,
} from "openai/resources/realtime/realtime";
import type { ClientSecretCreateParams } from "openai/resources/realtime/client-secrets";

export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2";
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";
export const TRANSCRIPTION_MODEL = "gpt-realtime-whisper";
// ISO-639-1 hint for the transcription side-job; without it, short utterances
// get auto-detected as random languages. NEXT_PUBLIC_ because this runs in the
// browser (inlined at build time).
export const TRANSCRIPTION_LANGUAGE =
  process.env.NEXT_PUBLIC_TRANSCRIPTION_LANGUAGE ?? "zh";

export function buildClientSecretRequestBody(): ClientSecretCreateParams {
  return {
    session: {
      type: "realtime",
      model: REALTIME_MODEL,
      audio: {
        output: {
          voice: REALTIME_VOICE,
        },
      },
    },
  };
}

export function buildSessionUpdateEvent(): SessionUpdateEvent {
  const session: RealtimeSessionCreateRequest = {
    type: "realtime",
    audio: {
      input: {
        transcription: { model: TRANSCRIPTION_MODEL, language: TRANSCRIPTION_LANGUAGE },
      },
    },
  };
  return { type: "session.update", session };
}
