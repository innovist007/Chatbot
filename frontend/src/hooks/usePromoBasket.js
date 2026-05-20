import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";

export function usePromoBasket({ startDate, endDate, compareMode }) {
  const [offerType, setOfferType] = useState("All offers");

  const { data, loading, error } = useAsyncData(
    () => api.promo.overview({ startDate, endDate, offerType, compareMode }),
    [startDate, endDate, offerType, compareMode]
  );

  const { summary: aiSummary } = useAiSummary(() => api.promo.aiSummary());

  return {
    data, loading, error,
    aiSummary,
    offerType, setOfferType,
  };
}
