import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";
import { api } from "@/lib/api";

export function useAcquisition({ startDate, endDate, compareStart = null, compareEnd = null, hasComparison = false }) {
  const { data, loading, initialLoading, error } = useAsyncData(
    () => api.acquisition.overview({
      startDate,
      endDate,
      // Only send compare dates when comparison is actually active
      compareStart: hasComparison ? compareStart : null,
      compareEnd:   hasComparison ? compareEnd   : null,
    }),
    // Re-fetch whenever dates OR comparison config changes
    [startDate, endDate, hasComparison ? compareStart : null, hasComparison ? compareEnd : null]
  );

  const { data: filterOpts } = useAsyncData(
    () => api.acquisition.filterOptions(),
    []
  );

  const { summary: aiSummary, date: aiDate, loading: aiLoading } = useAiSummary(
    () => api.acquisition.aiSummary(endDate)
  );

  // When comparison is off, zero out deltas so no component renders delta badges
  const cleanedData = data && !hasComparison
    ? { ...data, kpis: data.kpis ? { ...data.kpis, deltas: {} } : data.kpis }
    : data;

  return {
    data: cleanedData,
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
