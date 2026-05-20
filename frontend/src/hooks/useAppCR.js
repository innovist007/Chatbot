import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";

export function useAppCR({ startDate, endDate, compareMode }) {
  const [platform, setPlatform] = useState("All");
  const [user,     setUser]     = useState("All");

  const { data, loading, initialLoading, error } = useAsyncData(
    () => api.appCr.overview({
      startDate, endDate, compareMode,
      platforms: platform === "All" ? null : [platform],
      users:     user     === "All" ? null : [user],
    }),
    [startDate, endDate, platform, user, compareMode]
  );

  const { summary: aiSummary } = useAiSummary(() => api.appCr.aiSummary());

  return {
    data, loading, initialLoading, error,
    aiSummary,
    platform, setPlatform,
    user,     setUser,
  };
}
