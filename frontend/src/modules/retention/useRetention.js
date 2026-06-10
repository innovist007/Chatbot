import { api } from "@/lib/api";
import { useAsyncData } from "@/shared/hooks/useAsyncData";

function buildFilters(startDate, endDate) {
  return { startDate, endDate, brands: [] };
}

// Overview tab — current period
export function useRetentionOverview({ startDate, endDate }) {
  return useAsyncData(
    () => api.retention.overview(buildFilters(startDate, endDate)),
    [startDate, endDate]
  );
}

// Overview comparison — previous period
export function useRetentionOverviewCompare({ startDate, endDate, compareStart, compareEnd, hasComparison }) {
  return useAsyncData(
    () => hasComparison && compareStart && compareEnd
      ? api.retention.keyMetrics(buildFilters(compareStart, compareEnd))
      : Promise.resolve(null),
    [compareStart, compareEnd, hasComparison]
  );
}

// Retention trend tab
export function useRetentionTrend({ startDate, endDate, segment, window: win, granularity }) {
  return useAsyncData(
    () => api.retention.trend(buildFilters(startDate, endDate), segment, win, granularity),
    [startDate, endDate, segment, win, granularity]
  );
}
export function useLtvCac({ startDate, endDate }) {
  return useAsyncData(() => api.retention.ltvCac(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useBrandMix({ startDate, endDate }) {
  return useAsyncData(() => api.retention.brandMix(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useBrandOverlap({ startDate, endDate }) {
  return useAsyncData(() => api.retention.brandOverlap(buildFilters(startDate, endDate)), [startDate, endDate]);
}

// Product tab
export function useProductTable({ startDate, endDate }) {
  return useAsyncData(() => api.retention.productTable(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useFoSoGap({ startDate, endDate }) {
  return useAsyncData(() => api.retention.foSoGap(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useCrossSell({ startDate, endDate, window: win, foProduct }) {
  return useAsyncData(
    () => api.retention.crossSell(buildFilters(startDate, endDate), win, foProduct),
    [startDate, endDate, win, foProduct]
  );
}
export function useAffinityMatrix({ startDate, endDate }) {
  return useAsyncData(() => api.retention.affinityMatrix(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useReturnRate({ startDate, endDate }) {
  return useAsyncData(() => api.retention.returnRate(buildFilters(startDate, endDate)), [startDate, endDate]);
}

// Acquisition quality tab
export function useChannelQuality({ startDate, endDate, window: win }) {
  return useAsyncData(
    () => api.retention.channelQuality(buildFilters(startDate, endDate), win),
    [startDate, endDate, win]
  );
}
export function useDiscountRepeat({ startDate, endDate }) {
  return useAsyncData(() => api.retention.discountRepeat(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function usePaymentSplit({ startDate, endDate }) {
  return useAsyncData(() => api.retention.paymentSplit(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useCityTier({ startDate, endDate }) {
  return useAsyncData(() => api.retention.cityTier(buildFilters(startDate, endDate)), [startDate, endDate]);
}
export function useAovByOrder({ startDate, endDate }) {
  return useAsyncData(() => api.retention.aovByOrder(buildFilters(startDate, endDate)), [startDate, endDate]);
}

// Unit economics tab
export function useContributionMargin({ startDate, endDate }) {
  return useAsyncData(() => api.retention.contributionMargin(buildFilters(startDate, endDate)), [startDate, endDate]);
}

// Legacy compat
export function useRetention({ startDate, endDate, compareStart, compareEnd }) {
  return useRetentionOverview({ startDate, endDate });
}
