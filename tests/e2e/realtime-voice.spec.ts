import { expect, test } from "@playwright/test";

type SentRealtimeEvent = {
  type?: string;
  session?: {
    type?: string;
    input_audio_transcription?: unknown;
    audio?: {
      input?: {
        transcription?: {
          model?: string;
          language?: string;
        };
      };
    };
  };
};

type ReceivedRealtimeEvent = {
  type?: string;
};

type VoiceE2EState = {
  dcMessages: ReceivedRealtimeEvent[];
  dcSends: SentRealtimeEvent[];
  gumCalls: number;
  pcStates: string[];
};

declare global {
  interface Window {
    __voiceE2E: VoiceE2EState;
  }
}

test.describe("realtime voice e2e", () => {
  test.skip(
    process.env.RUN_REALTIME_E2E !== "1",
    "Set RUN_REALTIME_E2E=1 or run npm run test:e2e:realtime.",
  );
  test.skip(!process.env.OPENAI_API_KEY, "OPENAI_API_KEY is required.");

  test("connects to OpenAI Realtime with fake microphone audio", async ({
    baseURL,
    context,
    page,
  }, testInfo) => {
    const networkEvents: Array<{
      kind: "requestfailed" | "response";
      ok?: boolean;
      status?: number;
      url: string;
      failure?: string;
    }> = [];

    await context.grantPermissions(["microphone"], { origin: baseURL });
    await context.addInitScript(() => {
      window.__voiceE2E = {
        dcMessages: [],
        dcSends: [],
        gumCalls: 0,
        pcStates: [],
      };

      const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      navigator.mediaDevices.getUserMedia = async (...args) => {
        window.__voiceE2E.gumCalls += 1;
        return originalGetUserMedia(...args);
      };

      const OriginalRTCPeerConnection = window.RTCPeerConnection;
      window.RTCPeerConnection = function patchedRTCPeerConnection(...args) {
        const pc = new OriginalRTCPeerConnection(...args);
        pc.addEventListener("connectionstatechange", () => {
          window.__voiceE2E.pcStates.push(pc.connectionState);
        });

        const originalCreateDataChannel = pc.createDataChannel.bind(pc);
        pc.createDataChannel = (...dcArgs) => {
          const dc = originalCreateDataChannel(...dcArgs);
          const originalSend = dc.send.bind(dc);

          dc.send = (data) => {
            try {
              window.__voiceE2E.dcSends.push(JSON.parse(String(data)));
            } catch {
              window.__voiceE2E.dcSends.push({ type: String(data) });
            }
            originalSend(data);
          };

          dc.addEventListener("message", (event) => {
            try {
              window.__voiceE2E.dcMessages.push(JSON.parse(event.data));
            } catch {
              window.__voiceE2E.dcMessages.push({ type: String(event.data) });
            }
          });

          return dc;
        };

        return pc;
      } as typeof RTCPeerConnection;
      window.RTCPeerConnection.prototype = OriginalRTCPeerConnection.prototype;
    });

    page.on("response", (response) => {
      const url = response.url();
      if (url.includes("/api/session") || url.includes("api.openai.com/v1/realtime")) {
        networkEvents.push({
          kind: "response",
          ok: response.ok(),
          status: response.status(),
          url,
        });
      }
    });
    page.on("requestfailed", (request) => {
      const url = request.url();
      if (url.includes("/api/session") || url.includes("api.openai.com/v1/realtime")) {
        networkEvents.push({
          kind: "requestfailed",
          failure: request.failure()?.errorText,
          url,
        });
      }
    });

    await page.goto("/");
    await expect(page.getByRole("button", { name: "Start talking" })).toBeEnabled();

    await page.getByRole("button", { name: "Start talking" }).click();
    await expect(page.getByText("Status: connected", { exact: false })).toBeVisible();

    await page.waitForTimeout(5_000);
    const muteButton = page.getByRole("button", { name: "Mute" });
    if (await muteButton.isVisible()) {
      await muteButton.click();
    }

    await expect
      .poll(async () => page.locator("main").innerText(), {
        timeout: 60_000,
        message: "user and assistant transcripts should appear",
      })
      .toMatch(/You:[\s\S]*Agent:|Agent:[\s\S]*You:/);

    const finalText = await page.locator("main").innerText();
    const e2eState = await page.evaluate(() => window.__voiceE2E);
    const sessionUpdate = e2eState.dcSends.find(
      (event) => event.type === "session.update",
    );
    const receivedTypes = e2eState.dcMessages.map((event) => event.type);

    expect(e2eState.gumCalls).toBe(1);
    expect(e2eState.pcStates).toContain("connected");
    expect(sessionUpdate).toMatchObject({
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: {
            transcription: {
              model: "gpt-realtime-whisper",
              language: "en",
            },
          },
        },
      },
    });
    expect(sessionUpdate?.session).not.toHaveProperty("input_audio_transcription");
    expect(receivedTypes).toContain("session.updated");
    expect(receivedTypes).toContain("conversation.item.input_audio_transcription.completed");
    expect(receivedTypes).toContain("response.output_audio_transcript.done");
    expect(receivedTypes).toContain("response.done");
    expect(finalText).toContain("You:");
    expect(finalText).toContain("Agent:");
    expect(networkEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "response", ok: true, status: 200 }),
        expect.objectContaining({ kind: "response", ok: true, status: 201 }),
      ]),
    );
    expect(networkEvents.filter((event) => event.kind === "requestfailed")).toEqual([]);

    await testInfo.attach("realtime-e2e-state", {
      body: JSON.stringify({ finalText, e2eState, networkEvents }, null, 2),
      contentType: "application/json",
    });
  });
});
