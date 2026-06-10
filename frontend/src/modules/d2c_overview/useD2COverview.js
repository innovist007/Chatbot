import { api } from "@/lib/api";
import { useAsyncData } from "@/shared/hooks/useAsyncData";
import { useAiSummary } from "@/shared/hooks/useAiSummary";

/**
 * Fetches D2C Overview data across 4 parallel endpoints so each section
 * renders as soon as its data arrives — same pattern as all other tabs.
 *
 *  /kpis              → Business Health + Unit Economics + Waterfall  (fastest)
 *  /meta-summary      → Meta trend + acquisition charts
 *  /retention-summary → Retention + cohort + P&L new/repeat chart
 *  /supply-summary    → Supply chain + Web/App CR
 */
export function useD2COverview({ startDate, endDate, compareStart, compareEnd }) {
  const filters = { startDate, endDate, compareStart, compareEnd };
  const deps    = [startDate, endDate, compareStart, compareEnd];

  const { data: kpis,      loading: kpisLoading,      error: kpisError }      = useAsyncData(() => api.d2cOverview.kpis(filters),            deps);
  const { data: metaData,  loading: metaLoading }                              = useAsyncData(() => api.d2cOverview.metaSummary(filters),      deps);
  const { data: retData,   loading: retLoading }                               = useAsyncData(() => api.d2cOverview.retentionSummary(filters), deps);
  const { data: supData,   loading: supLoading }                               = useAsyncData(() => api.d2cOverview.supplySummary(filters),    deps);

  const { summary: aiSummary, pending: aiPending } = useAiSummary(
    () => api.d2cOverview.aiSummaryStreamUrl(),
  );

  return {
    // Sales-ads KPIs (Business Health, Unit Economics, Waterfall)
    salesAds:    kpis        ?? null,
    kpisLoading,

    // Meta — page expects flat current KPIs + trend array separately
    meta:        metaData?.meta?.current  ?? {},
    metaTrend:   metaData?.meta?.trend    ?? [],
    waterfall:   metaData?.waterfall      ?? null,
    metaLoading,

    // Retention
    retKm:       retData?.key_metrics    ?? {},
    ltvcac:      retData?.ltv_cac        ?? [],
    cohortHm:    retData?.cohort_heatmap ?? [],
    pnlTrend:    retData?.pnl_trend      ?? [],
    retLoading,

    // Supply chain + CR trends
    sc:          supData?.supply_chain  ?? {},
    scRtoTrend:  supData?.sc_rto_trend  ?? null,
    courier:     supData?.courier_split ?? [],
    webCrTrend:  supData?.web_cr_trend  ?? [],
    appCrTrend:  supData?.app_cr_trend  ?? [],
    supLoading,

    // AI summary
    aiSummary,
    aiPending,

    // True initial loading = kpis not yet arrived (first paint)
    loading: kpisLoading,
    error:   kpisError,
  };
}
