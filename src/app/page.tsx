"use client";

import { useRealtimeVoice } from "@/lib/useRealtimeVoice";

const ACTIVITY_LABEL: Record<string, string> = {
  idle: "",
  listening: "Listening…",
  responding: "Responding…",
};

export default function Home() {
  const {
    status,
    activity,
    muted,
    transcript,
    error,
    connect,
    disconnect,
    toggleMute,
    audioElRef,
  } = useRealtimeVoice();

  const isConnected = status === "connected";
  const isConnecting = status === "connecting";

  return (
    <div className="flex min-h-screen flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Voice Agent
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            A minimal OpenAI Realtime + WebRTC voice chat, built on Next.js.
          </p>
        </header>

        <section className="flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-base font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {isConnecting ? "Connecting…" : isConnected ? "Stop" : "Start talking"}
          </button>

          {isConnected && (
            <button
              type="button"
              onClick={toggleMute}
              className="flex h-12 items-center justify-center rounded-full border border-black/[.08] px-6 text-base font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
            >
              {muted ? "Unmute" : "Mute"}
            </button>
          )}

          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            Status: {status}
            {isConnected && ACTIVITY_LABEL[activity] ? ` — ${ACTIVITY_LABEL[activity]}` : ""}
          </span>
        </section>

        {error && (
          <p className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {error}
          </p>
        )}

        <section className="flex flex-1 flex-col gap-3 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]">
          <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
            Transcript
          </h2>
          {transcript.length === 0 ? (
            <p className="text-sm text-zinc-400">Nothing yet — press Start talking.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {transcript.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <span className="font-medium text-zinc-900 dark:text-zinc-100">
                    {entry.role === "user" ? "You: " : "Agent: "}
                  </span>
                  <span className="text-zinc-700 dark:text-zinc-300">{entry.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <audio ref={audioElRef} autoPlay className="hidden" />
      </main>
    </div>
  );
}
