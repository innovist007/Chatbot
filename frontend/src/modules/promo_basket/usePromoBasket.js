import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "@/shared/hooks/useAsyncData";
import { useAiSummary } from "@/shared/hooks/useAiSummary";

export function usePromoBasket({ startDate, endDate, compareStart = null, compareEnd = null }) {
  const [offerType, setOfferType] = useState("All offers");

  const { data, loading, error } = useAsyncData(
    () => api.promo.overview({ startDate, endDate, offerType, compareStart, compareEnd }),
    [startDate, endDate, compareStart, compareEnd, offerType]
  );

  const { summary: aiSummary, pending: aiPending } = useAiSummary(() => api.promo.aiSummaryStreamUrl());

  return {
    data, loading, error,
    aiSummary,
    aiPending,
    offerType, setOfferType,
  };
}
