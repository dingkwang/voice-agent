import { describe, expect, it } from "vitest";
import { buildClientSecretRequestBody, buildSessionUpdateEvent } from "./realtimeSessionConfig";

describe("realtimeSessionConfig", () => {
  it("includes session.type on the client secret request body", () => {
    const body = buildClientSecretRequestBody();
    expect(body.session.type).toBe("realtime");
  });

  it("includes session.type on the session.update event", () => {
    const event = buildSessionUpdateEvent();
    expect(event.type).toBe("session.update");
    expect(event.session.type).toBe("realtime");
    expect(event.session.input_audio_transcription.model).toBe("gpt-realtime-whisper");
  });
});
