import { existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const envPath = join(root, ".env.local");

function loadEnvLocal() {
  if (!existsSync(envPath)) return;

  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] ??= value;
  }
}

function commandExists(command) {
  return spawnSync("sh", ["-lc", `command -v ${command}`], {
    stdio: "ignore",
  }).status === 0;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env: process.env,
    ...options,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function ensureFakeMicAudio() {
  const fakeAudioPath =
    process.env.FAKE_AUDIO_PATH ?? join(tmpdir(), "voice-agent-e2e.wav");
  process.env.FAKE_AUDIO_PATH = fakeAudioPath;

  if (existsSync(fakeAudioPath) && process.env.FORCE_FAKE_AUDIO !== "1") {
    return;
  }

  if (!commandExists("say") || !commandExists("ffmpeg")) {
    console.error(
      "Realtime e2e needs either FAKE_AUDIO_PATH or local 'say' and 'ffmpeg' commands.",
    );
    process.exit(1);
  }

  const aiffPath = join(tmpdir(), "voice-agent-e2e.aiff");
  rmSync(aiffPath, { force: true });
  rmSync(fakeAudioPath, { force: true });

  run("say", [
    "-o",
    aiffPath,
    "Hello voice agent. Please say the word validation.",
  ]);
  run("ffmpeg", [
    "-y",
    "-i",
    aiffPath,
    "-ar",
    "48000",
    "-ac",
    "1",
    "-acodec",
    "pcm_s16le",
    fakeAudioPath,
  ]);
}

loadEnvLocal();

if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required for the realtime e2e test.");
  process.exit(1);
}

process.env.RUN_REALTIME_E2E = "1";
process.env.E2E_PORT ??= "3100";
process.env.NEXT_PUBLIC_TRANSCRIPTION_LANGUAGE ??= "en";

ensureFakeMicAudio();

run("npx", [
  "playwright",
  "test",
  "tests/e2e/realtime-voice.spec.ts",
  "--project=chrome-realtime",
]);
