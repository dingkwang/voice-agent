"use client";

import { useCallback, useRef, useState } from "react";
import { buildSessionUpdateEvent } from "@/lib/realtimeSessionConfig";
import {
  reduceTranscript,
  type RealtimeEvent,
  type TranscriptEntry,
} from "@/lib/transcriptReducer";

export type ConnectionStatus = "idle" | "connecting" | "connected" | "error";
export type Activity = "idle" | "listening" | "responding";
export type { TranscriptEntry } from "@/lib/transcriptReducer";

export function useRealtimeVoice() {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [activity, setActivity] = useState<Activity>("idle");
  const [muted, setMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const manualDisconnectRef = useRef(false);

  const finalizePendingAssistantEntries = useCallback(() => {
    setTranscript((prev) =>
      prev.map((e) => (e.role === "assistant" && !e.final ? { ...e, final: true } : e)),
    );
  }, []);

  const cleanupResources = useCallback(() => {
    dcRef.current?.close();
    dcRef.current = null;

    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.getSenders().forEach((sender) => sender.track?.stop());
      pcRef.current.close();
      pcRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
    }

    setMuted(false);
    setActivity("idle");
  }, []);

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    cleanupResources();
    setStatus("idle");
  }, [cleanupResources]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const tracks = stream.getAudioTracks();
    const wasEnabled = tracks.some((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = !wasEnabled));
    setMuted(wasEnabled);
  }, []);

  const handleServerEvent = useCallback(
    (event: RealtimeEvent) => {
      setTranscript((prev) => reduceTranscript(prev, event));

      switch (event.type) {
        case "input_audio_buffer.speech_started":
          finalizePendingAssistantEntries();
          setActivity("listening");
          break;
        case "input_audio_buffer.speech_stopped":
          setActivity("idle");
          break;
        case "response.output_audio_transcript.delta":
          setActivity("responding");
          break;
        case "response.cancelled":
          finalizePendingAssistantEntries();
          setActivity("idle");
          break;
        case "response.done":
          setActivity("idle");
          break;
        case "error":
          setError(event.error?.message ?? "Unknown realtime error");
          break;
        default:
          break;
      }
    },
    [finalizePendingAssistantEntries],
  );

  const connect = useCallback(async () => {
    setError(null);
    setStatus("connecting");
    manualDisconnectRef.current = false;

    try {
      const tokenRes = await fetch("/api/session");
      if (!tokenRes.ok) {
        throw new Error(`Failed to fetch session token (${tokenRes.status})`);
      }
      const tokenData = await tokenRes.json();
      const ephemeralKey: string | undefined = tokenData?.value;
      if (!ephemeralKey) {
        throw new Error("No ephemeral key returned from /api/session");
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      pc.ontrack = (event) => {
        if (audioElRef.current) {
          audioElRef.current.srcObject = event.streams[0];
        }
      };

      pc.onconnectionstatechange = () => {
        if (manualDisconnectRef.current) return;
        const state = pc.connectionState;
        if (state === "failed" || state === "disconnected" || state === "closed") {
          setError("Realtime connection was lost");
          setStatus("error");
          cleanupResources();
        }
      };

      const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = localStream;
      localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));

      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;

      dc.addEventListener("open", () => {
        dc.send(JSON.stringify(buildSessionUpdateEvent()));
      });

      dc.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(event.data) as RealtimeEvent;
          handleServerEvent(parsed);
        } catch {
          // ignore malformed events
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpRes = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpRes.ok) {
        throw new Error(`Realtime SDP exchange failed (${sdpRes.status})`);
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      setStatus("connected");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
      setStatus("error");
      manualDisconnectRef.current = true;
      cleanupResources();
    }
  }, [cleanupResources, handleServerEvent]);

  return {
    status,
    activity,
    muted,
    transcript,
    error,
    connect,
    disconnect,
    toggleMute,
    audioElRef,
  };
}
