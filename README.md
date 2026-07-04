# voice-agent

A minimal web ChatGPT-Voice-style client: browser mic → WebRTC → OpenAI Realtime API (`gpt-realtime-2`) → streamed audio + transcript back to the browser.

```
Browser mic
  → RTCPeerConnection (getUserMedia, addTrack)
  → SDP offer POST https://api.openai.com/v1/realtime/calls (ephemeral token)
  → SDP answer, remote audio track
  → "oai-events" data channel (transcript deltas, tool calls, errors)
```

## Setup

1. `cp .env.local.example .env.local` and set `OPENAI_API_KEY` to a standard (server-side) OpenAI API key.
2. `npm run dev`
3. Open http://localhost:3000, click "Start talking", allow mic access.

The server route `src/app/api/session/route.ts` exchanges your `OPENAI_API_KEY` for a short-lived ephemeral
client secret (`POST /v1/realtime/client_secrets`) — the real key never reaches the browser. The client
(`src/lib/useRealtimeVoice.ts`) uses that ephemeral key to open the WebRTC connection directly to OpenAI.

## Notes / next steps

- User-turn transcripts require `input_audio_transcription` enabled via a `session.update` event, which
  the client sends as soon as the data channel opens (see `useRealtimeVoice.ts`).
- No interruption/VAD tuning, tool calling, or multi-agent handoff yet — this is the bare WebRTC round trip.
- Later: a background reasoning-model tier, tool calls, and a router between fast voice responses and
  deeper search/reasoning, per the `openai-realtime-agents` patterns.
