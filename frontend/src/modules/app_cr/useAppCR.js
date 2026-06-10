import { api } from "@/lib/api";
import { useAsyncData } from "@/shared/hooks/useAsyncData";
import { useAiSummary } from "@/shared/hooks/useAiSummary";

export function useAppCR({ startDate, endDate, compareStart = null, compareEnd = null }) {
  const { data, loading, initialLoading, error } = useAsyncData(
    () =>
      api.appCr.overview({
        startDate,
        endDate,
        compareStart,
        compareEnd,
      }),
    [startDate, endDate, compareStart, compareEnd],
  );

  const { summary: aiSummary, pending: aiPending } = useAiSummary(
    () => api.appCr.aiSummaryStreamUrl(),
  );

  return { data, loading, initialLoading, error, aiSummary, aiPending };
}
