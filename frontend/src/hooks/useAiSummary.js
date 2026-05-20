import { useEffect, useRef, useState } from "react";

/**
 * One-shot AI summary hook.
 * fetchFn is called once on mount (cached on server / localStorage).
 * Returns { summary, date, loading }.
 */
export function useAiSummary(fetchFn) {
  const [summary, setSummary] = useState("Generating AI insights…");
  const [date,    setDate]    = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchRef   = useRef(fetchFn);
  fetchRef.current = fetchFn;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetchRef.current()
      .then((r) => {
        if (!cancelled) {
          setSummary(r?.summary ?? r ?? "—");
          setDate(r?.date ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setSummary("Unable to generate AI summary at this time.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { summary, date, loading };
}
