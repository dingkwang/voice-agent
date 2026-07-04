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

// Route A: the realtime model doesn't know a backend deep-answer layer exists,
// so instructions are what keep it from long-answering research questions.
export const REALTIME_INSTRUCTIONS = [
  "你是一个语音助手，回答要简短、口语化，一般不超过三句话。",
  "当用户要求查询、搜索、最新信息、详细资料或深入研究时，不要凭记忆长篇回答，",
  "只需简短回应类似“我来查一下，完整答案会显示在屏幕上”，后台系统会完成检索。",
  "当收到以 [deep answer] 开头的消息时，自然流畅地把其中的摘要朗读给用户。",
].join("");

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
    instructions: REALTIME_INSTRUCTIONS,
    audio: {
      input: {
        transcription: { model: TRANSCRIPTION_MODEL, language: TRANSCRIPTION_LANGUAGE },
      },
    },
  };
  return { type: "session.update", session };
}
