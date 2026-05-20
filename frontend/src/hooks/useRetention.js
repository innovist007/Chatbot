import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";

export function useRetention({ startDate, endDate, compareMode }) {
  const [brand,           setBrand]           = useState("All");
  const [retentionWindow, setRetentionWindow] = useState("30d");

  const { data, loading, error } = useAsyncData(
    () => api.retention.overview({ startDate, endDate, brand, retentionWindow, compareMode }),
    [startDate, endDate, brand, retentionWindow, compareMode]
  );

  const { summary: aiSummary } = useAiSummary(() => api.retention.aiSummary());

  return {
    data, loading, error,
    aiSummary,
    brand,           setBrand,
    retentionWindow, setRetentionWindow,
  };
}
