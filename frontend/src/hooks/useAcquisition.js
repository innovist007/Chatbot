import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";
import { api } from "@/lib/api";

export function useAcquisition({ startDate, endDate }) {
  const { data, loading, initialLoading, error } = useAsyncData(
    () => api.acquisition.overview({ startDate, endDate }),
    [startDate, endDate]
  );

  const { data: filterOpts } = useAsyncData(
    () => api.acquisition.filterOptions(),
    []
  );

  const { summary: aiSummary, date: aiDate, loading: aiLoading } = useAiSummary(
    () => api.acquisition.aiSummary(endDate)
  );

  return {
    data,
    loading,
    initialLoading,
    error,
    aiSummary,
    aiDate,
    aiLoading,
    filterOpts: filterOpts ?? {
      campaigns: [], stages: [], creative_types: [], brands: [], languages: [], ad_names: [],
    },
  };
}
