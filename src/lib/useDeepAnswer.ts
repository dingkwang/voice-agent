"use client";

import { useCallback, useRef, useState } from "react";
import type { AnswerMode, AnswerObject } from "@/lib/deepAnswer";

export type DeepAnswerStatus = "idle" | "searching" | "ready" | "error";

export function useDeepAnswer() {
  const [status, setStatus] = useState<DeepAnswerStatus>("idle");
  const [answer, setAnswer] = useState<AnswerObject | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (query: string, mode: AnswerMode): Promise<AnswerObject | null> => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus("searching");
      setError(null);
      try {
        const res = await fetch("/api/deep-answer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode, needWeb: true }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            typeof data?.error === "string" ? data.error : `deep-answer failed (${res.status})`,
          );
        }
        const result = data as AnswerObject;
        setAnswer(result);
        setStatus("ready");
        return result;
      } catch (err) {
        if (controller.signal.aborted) return null;
        setError(err instanceof Error ? err.message : "Deep answer failed");
        setStatus("error");
        return null;
      }
    },
    [],
  );

  return { status, answer, error, ask };
}
