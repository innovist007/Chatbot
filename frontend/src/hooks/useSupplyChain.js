import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";

export function useSupplyChain({ startDate, endDate, compareStart = null, compareEnd = null }) {
  // Trend controls
  const [granularity, setGranularity] = useState("MoM");
  const [segment,     setSegment]     = useState("warehouse");
  const [metric,      setMetric]      = useState("rto");
  const [subFilter,   setSubFilter]   = useState("all");

  const filters = useMemo(
    () => ({ startDate, endDate, compareStart, compareEnd }),
    [startDate, endDate, compareStart, compareEnd]
  );

  // Bundled overview (overview + tables + matrix + pincodes)
  const { data: raw, loading, initialLoading, error } = useAsyncData(
    () => api.supplyChain.overview(filters),
    [startDate, endDate, compareStart, compareEnd]
  );

  // Trend (re-fetches on controls change)
  const { data: trend } = useAsyncData(
    () => api.supplyChain.trend(filters, { segment, metric, granularity, subFilter }),
    [startDate, endDate, compareStart, compareEnd, segment, metric, granularity, subFilter]
  );

  // Segment filter options — one-shot, cached
  const { data: subOptionsRaw } = useAsyncData(
    () => api.supplyChain.segmentOptions(),
    []
  );

  // AI summary — one-shot, cached
  const { summary: aiSummary, date: aiDate, loading: aiLoading } = useAiSummary(
    () => api.supplyChain.aiSummary()
  );

  // Reset sub-filter whenever the segment changes
  useEffect(() => { setSubFilter("all"); }, [segment]);

  return {
    // Data (parsed from bundled response)
    overview:       raw ? {
      overview:                  raw.overview,
      waterfall:                 raw.waterfall,
      ndr_funnel:                raw.ndr_funnel,
      delivery_day_distribution: raw.delivery_day_distribution,
    } : null,
    warehouseTable: raw?.warehouse_table            ?? [],
    courierTable:   raw?.courier_table              ?? [],
    paymentTable:   raw?.payment_table              ?? [],
    matrix:         raw?.courier_wh_matrix          ?? null,
    pincodes:       raw?.top_pincodes               ?? [],
    trend,
    subOptions:     subOptionsRaw                   ?? {},
    // Request state
    loading,
    initialLoading,
    error,
    // AI flash
    aiSummary,
    aiDate,
    aiLoading,
    // Trend controls + setters
    granularity, setGranularity,
    segment,     setSegment,
    metric,      setMetric,
    subFilter,   setSubFilter,
  };
}
