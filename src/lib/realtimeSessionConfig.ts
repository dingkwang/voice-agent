export const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL ?? "gpt-realtime-2";
export const REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE ?? "marin";

export function buildClientSecretRequestBody() {
  return {
    session: {
      type: "realtime" as const,
      model: REALTIME_MODEL,
      audio: {
        output: {
          voice: REALTIME_VOICE,
        },
      },
    },
  };
}

export function buildSessionUpdateEvent() {
  return {
    type: "session.update" as const,
    session: {
      type: "realtime" as const,
      input_audio_transcription: { model: "gpt-realtime-whisper" },
    },
  };
}
