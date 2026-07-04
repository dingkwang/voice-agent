import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";

const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = `http://127.0.0.1:${port}`;
const fakeAudioPath = process.env.FAKE_AUDIO_PATH ?? join(tmpdir(), "voice-agent-e2e.wav");

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL,
    permissions: ["microphone"],
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    launchOptions: {
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
        `--use-file-for-fake-audio-capture=${fakeAudioPath}`,
        "--autoplay-policy=no-user-gesture-required",
      ],
    },
  },
  webServer: {
    command: `npm run build && npm run start -- -H 127.0.0.1 -p ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_TRANSCRIPTION_LANGUAGE:
        process.env.NEXT_PUBLIC_TRANSCRIPTION_LANGUAGE ?? "en",
    },
  },
  projects: [
    {
      name: "chrome-realtime",
      use: {
        ...devices["Desktop Chrome"],
        channel: process.env.PLAYWRIGHT_CHANNEL ?? "chrome",
      },
    },
  ],
});
