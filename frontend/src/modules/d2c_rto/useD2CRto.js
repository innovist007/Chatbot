import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "@/shared/hooks/useAsyncData";
import { useAiSummary } from "@/shared/hooks/useAiSummary";

export function useD2CRto({ startDate, endDate, compareStart = null, compareEnd = null }) {
  const [payment,  setPayment]  = useState("All");
  const [customer, setCustomer] = useState("All");

  const { data, loading, error } = useAsyncData(
    () => api.d2cRto.overview({ startDate, endDate, payment, customer, compareStart, compareEnd }),
    [startDate, endDate, compareStart, compareEnd, payment, customer]
  );

  const { summary: aiSummary, pending: aiPending } = useAiSummary(() => api.d2cRto.aiSummaryStreamUrl());

  return {
    data, loading, error,
    aiSummary,
    aiPending,
    payment,  setPayment,
    customer, setCustomer,
  };
}
