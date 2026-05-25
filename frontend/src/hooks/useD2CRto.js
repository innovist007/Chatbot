import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "./useAsyncData";
import { useAiSummary } from "./useAiSummary";

export function useD2CRto({ startDate, endDate, compareStart = null, compareEnd = null }) {
  const [payment,  setPayment]  = useState("All");
  const [customer, setCustomer] = useState("All");

  const { data, loading, error } = useAsyncData(
    () => api.d2cRto.overview({ startDate, endDate, payment, customer, compareStart, compareEnd }),
    [startDate, endDate, compareStart, compareEnd, payment, customer]
  );

  const { summary: aiSummary } = useAiSummary(() => api.d2cRto.aiSummary());

  return {
    data, loading, error,
    aiSummary,
    payment,  setPayment,
    customer, setCustomer,
  };
}
