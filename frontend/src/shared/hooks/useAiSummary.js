import { useCallback, useEffect, useRef, useState } from "react";
import { clearAiSummaryCache } from "@/lib/api";
import { getAuthToken } from "@/lib/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "";

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h

/**
 * Open an SSE connection with auth headers (native EventSource doesn't
 * support custom headers, so we use fetch + ReadableStream manually).
 *
 * Calls onMessage({summary, date}) on the first data event, then stops.
 * Calls onError(err) on network/parse failure (AbortError is silently ignored).
 */
async function connectSSE(url, { signal, onMessage, onError }) {
  const token = getAuthToken();
  let response;
  try {
    response = await fetch(`${API_BASE}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal,
      cache: "no-store",   // prevent If-None-Match / 304 on SSE streams
    });
  } catch (err) {
    if (err.name !== "AbortError") onError(err);
    return;
  }

  if (!response.ok) {
    onError(new Error(`SSE ${response.status} ${response.statusText}`));
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // sse-starlette v3 uses \r\n separators → normalise to \n before splitting
      // SSE events are separated by a blank line (\n\n after normalisation)
      const normalised = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const parts = normalised.split("\n\n");
      buffer = parts.pop(); // keep the incomplete trailing chunk

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              onMessage(data);
            } catch { /* ignore malformed JSON */ }
          }
        }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") onError(err);
  } finally {
    reader.releaseLock();
  }
}

/**
 * Non-blocking AI summary hook using SSE (Server-Sent Events).
 *
 * streamUrlFn: () => string
 *   Called once per mount/refresh — returns the /ai-summary/stream URL.
 *   One persistent HTTP connection is opened; the server pushes a single
 *   JSON event when generation finishes. No polling, no repeated requests.
 *
 * Returns { summary, date, loading, pending, refresh }
 */
export function useAiSummary(streamUrlFn) {
  const [summary, setSummary] = useState(null);
  const [date,    setDate]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [tick,    setTick]    = useState(0);

  const fnRef = useRef(streamUrlFn);
  fnRef.current = streamUrlFn;

  useEffect(() => {
    const url = fnRef.current();
    const cacheKey = `ai-summary:${url}`;

    // ── localStorage hit → return immediately, no HTTP at all ─────────────────
    try {
      const raw = localStorage.getItem(cacheKey);
      if (raw) {
        const { value, expiresAt } = JSON.parse(raw);
        if (typeof expiresAt === "number" && expiresAt > Date.now()) {
          setSummary(value.summary ?? "—");
          setDate(value.date ?? null);
          setLoading(false);
          setPending(false);
          return; // no cleanup needed
        }
      }
    } catch { /* corrupted entry — treat as miss */ }

    // ── open one SSE connection ───────────────────────────────────────────────
    const ctrl = new AbortController();
    let settled = false;

    setPending(true);
    setLoading(true);

    connectSSE(url, {
      signal: ctrl.signal,

      onMessage(data) {
        if (settled) return;
        settled = true;

        if (data.error) {
          setSummary("Unable to generate AI summary at this time.");
        } else if (data.summary) {
          setSummary(data.summary);
          setDate(data.date ?? null);
          // Persist to localStorage so next page load is instant
          try {
            localStorage.setItem(cacheKey, JSON.stringify({
              value:     { summary: data.summary, date: data.date },
              expiresAt: Date.now() + CACHE_TTL_MS,
            }));
          } catch { /* storage full or unavailable */ }
        }

        setPending(false);
        setLoading(false);
      },

      onError() {
        if (settled) return;
        settled = true;
        setSummary("Unable to generate AI summary at this time.");
        setPending(false);
        setLoading(false);
      },
    }); // fire-and-forget; abort signal handles cleanup

    return () => ctrl.abort();
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const refresh = useCallback(() => {
    clearAiSummaryCache();
    setSummary(null);
    setLoading(true);
    setPending(false);
    setTick((t) => t + 1);
  }, []);

  return { summary, date, loading, pending, refresh };
}
