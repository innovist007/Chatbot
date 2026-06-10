import { useEffect, useRef, useState } from "react";

/**
 * Generic hook for async data fetching with:
 * - Automatic cancellation on dep change / unmount
 * - Separate initialLoading (skeleton) vs loading (overlay) states
 * - fetchFn is stored in a ref so it always uses the latest closure
 *   without needing to appear in the dependency array
 */
export function useAsyncData(fetchFn, deps = []) {
  const [data,           setData]           = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error,          setError]          = useState(null);

  const fetchRef   = useRef(fetchFn);
  const isFirstRef = useRef(true);
  fetchRef.current = fetchFn;

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);
    if (isFirstRef.current) setInitialLoading(true);

    fetchRef.current()
      .then((result) => {
        if (!cancelled) {
          setData(result);
          isFirstRef.current = false;
          setLoading(false);
          setInitialLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message ?? "Unknown error");
          setLoading(false);
          setInitialLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading, initialLoading, error };
}
