import { describe, expect, it } from "vitest";
import { buildClientSecretRequestBody, buildSessionUpdateEvent } from "./realtimeSessionConfig";

describe("realtimeSessionConfig", () => {
  it("includes session.type on the client secret request body", () => {
    const body = buildClientSecretRequestBody();
    expect(body.session?.type).toBe("realtime");
  });

  it("nests transcription config under session.audio.input on the session.update event", () => {
    const event = buildSessionUpdateEvent();
    expect(event.type).toBe("session.update");
    expect(event.session.type).toBe("realtime");
    // GA API shape: session.audio.input.transcription — the flat
    // session.input_audio_transcription field is rejected with
    // "Unknown parameter: 'session.input_audio_transcription'."
    expect(event.session.audio?.input?.transcription?.model).toBe("gpt-realtime-whisper");
    expect(event.session).not.toHaveProperty("input_audio_transcription");
  });
});
