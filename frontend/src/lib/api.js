import { getAuthToken } from "./AuthContext";

const API_BASE = import.meta.env.VITE_API_URL || "";

async function request(url, options = {}) {
  // Add API base URL for production, leave empty for dev (uses proxy)
  const fullUrl = url.startsWith("http") ? url : `${API_BASE}${url}`;
  
  const token = getAuthToken();
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(fullUrl, {
    ...options,
    headers,
  });

  if (res.status === 401) {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    clearAiSummaryCache();
    window.location.href = "/login";
    throw new Error("Session expired. Please login again.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
}

// localStorage-backed cache for endpoints whose response barely changes within a day
// (e.g. AI daily summaries). Returns the cached value immediately if fresh,
// otherwise fetches, stores, and returns.
const AI_CACHE_PREFIX = "ai-summary:";

export function clearAiSummaryCache() {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(AI_CACHE_PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // storage unavailable — nothing to do
  }
}

function cachedGet(url, cacheKey, ttlMs) {
  try {
    const raw = localStorage.getItem(cacheKey);
    if (raw) {
      const { value, expiresAt } = JSON.parse(raw);
      if (typeof expiresAt === "number" && expiresAt > Date.now()) {
        return Promise.resolve(value);
      }
    }
  } catch {
    // ignore corrupted cache entries; treat as miss
  }
  return request(url).then((value) => {
    // Never cache a pending response — it would freeze the UI on reload
    if (value?.status === "pending") return value;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
    } catch {
      // quota or disabled storage — still return the fresh value
    }
    return value;
  });
}

export const api = {
  d2cOverview: {
    _params(filters) {
      const p = new URLSearchParams({ start_date: filters.startDate, end_date: filters.endDate });
      if (filters.compareStart) p.set("compare_start", filters.compareStart);
      if (filters.compareEnd)   p.set("compare_end",   filters.compareEnd);
      return p;
    },
    data(filters) {
      return request(`/d2c-overview/data?${this._params(filters)}`);
    },
    kpis(filters) {
      return request(`/d2c-overview/kpis?${this._params(filters)}`);
    },
    metaSummary(filters) {
      return request(`/d2c-overview/meta-summary?${this._params(filters)}`);
    },
    retentionSummary(filters) {
      return request(`/d2c-overview/retention-summary?${this._params(filters)}`);
    },
    supplySummary(filters) {
      return request(`/d2c-overview/supply-summary?${this._params(filters)}`);
    },
    pnlTrend(filters) {
      const p = new URLSearchParams({
        start_date:  filters.startDate,
        end_date:    filters.endDate,
        granularity: filters.granularity || "month",
      });
      return request(`/d2c-overview/pnl-trend?${p}`);
    },
    aiSummaryStreamUrl() {
      return "/d2c-overview/ai-summary/stream";
    },
  },

  webCr: {
    overview(filters) {
      const params = new URLSearchParams({
        start_date: filters.startDate,
        end_date: filters.endDate,
      });
      if (filters.compareStart) params.set("compare_start", filters.compareStart);
      if (filters.compareEnd)   params.set("compare_end",   filters.compareEnd);
      (filters.channels || []).forEach((v) => params.append("channel_groups", v));
      (filters.devices || []).forEach((v) => params.append("devices", v));
      (filters.campaigns || []).forEach((v) => params.append("campaigns", v));
      (filters.contentGroups || []).forEach((v) => params.append("content_groups", v));
      (filters.landingPages || []).forEach((v) => params.append("landing_pages", v));
      (filters.sessionTypes || []).forEach((v) => params.append("session_types", v));
      return request(`/web-cr?${params}`);
    },
    filterOptions() {
      return cachedGet("/web-cr/filter-options", "filter-opts:web-cr", 4 * 60 * 60 * 1000);
    },
    latestDate() {
      return cachedGet("/web-cr/latest-date", "web-cr:latest-date", 60 * 60 * 1000);
    },
    aiSummaryStreamUrl() {
      return "/web-cr/ai-summary/stream";
    },
  },
  
  d2c: {
    overview(filters) {
      const params = new URLSearchParams({
        start_date: filters.startDate,
        end_date: filters.endDate,
      });
      (filters.brands || []).forEach((v) => params.append("brands", v));
      (filters.platforms || []).forEach((v) => params.append("platforms", v));
      (filters.customers || []).forEach((v) => params.append("customers", v));
      return request(`/d2c/overview?${params}`);
    },
    filterOptions() {
      return cachedGet("/d2c/filter-options", "filter-opts:d2c", 4 * 60 * 60 * 1000);
    },
  },
  
  appCr: {
    overview(filters) {
      const params = new URLSearchParams({
        start_date: filters.startDate,
        end_date:   filters.endDate,
      });
      if (filters.compareStart) params.set("compare_start", filters.compareStart);
      if (filters.compareEnd)   params.set("compare_end",   filters.compareEnd);
      if (filters.compareMode)  params.set("compare_mode",  filters.compareMode);
      return request(`/app-cr/overview?${params}`);
    },
    trend(filters) {
      const params = new URLSearchParams({
        start_date:   filters.startDate,
        end_date:     filters.endDate,
        granularity:  filters.granularity  || "day",
        os:           filters.os           || "All",
        install_type: filters.installType  || "All",
      });
      return request(`/app-cr/trend?${params}`);
    },
    aiSummaryStreamUrl() {
      return "/app-cr/ai-summary/stream";
    },
  },

  d2cRto: {
  overview(filters) {
    const params = new URLSearchParams({
      start_date: filters.startDate,
      end_date: filters.endDate,
    });
    if (filters.payment && filters.payment !== "All") {
      params.append("payment", filters.payment);
    }
    if (filters.customer && filters.customer !== "All") {
      params.append("customer", filters.customer);
    }
    if (filters.compareStart) params.set("compare_start", filters.compareStart);
    if (filters.compareEnd)   params.set("compare_end",   filters.compareEnd);
    return request(`/d2c-rto/overview?${params}`);
  },
  aiSummaryStreamUrl() {
    return "/d2c-rto/ai-summary/stream";
  },
},

promo: {
  overview(filters) {
    const params = new URLSearchParams({
      start_date: filters.startDate,
      end_date: filters.endDate,
    });
    if (filters.offerType && filters.offerType !== "All offers") {
      params.append("offer_type", filters.offerType);
    }
    if (filters.compareStart) params.set("compare_start", filters.compareStart);
    if (filters.compareEnd)   params.set("compare_end",   filters.compareEnd);
    return request(`/promo/overview?${params}`);
  },
  aiSummaryStreamUrl() {
    return "/promo/ai-summary/stream";
  },
},

retention: {
  _p(filters) {
    const p = new URLSearchParams({ start_date: filters.startDate, end_date: filters.endDate });
    (filters.brands || []).forEach((v) => p.append("brands", v));
    return p;
  },
  // Tab 1 — Overview (all panels)
  overview(filters) { return request(`/retention/overview?${this._p(filters)}`); },
  keyMetrics(filters) { return request(`/retention/key-metrics?${this._p(filters)}`); },
  keyMetricsCompare(filters) { return request(`/retention/key-metrics?${this._p(filters)}`); },
  retentionWindows(filters) { return request(`/retention/retention-windows?${this._p(filters)}`); },
  cohortHeatmap(filters) { return request(`/retention/cohort-heatmap?${this._p(filters)}`); },
  composition(filters) { return request(`/retention/composition?${this._p(filters)}`); },
  // Tab 2 — Retention trend
  trend(filters, segment = "brand", window = "30d", granularity = "WoW") {
    const p = this._p(filters);
    p.set("segment", segment); p.set("window", window); p.set("granularity", granularity);
    return request(`/retention/trend?${p}`);
  },
  ltvCac(filters) { return request(`/retention/ltv-cac?${this._p(filters)}`); },
  brandMix(filters) { return request(`/retention/brand-mix?${this._p(filters)}`); },
  brandOverlap(filters) { return request(`/retention/brand-overlap?${this._p(filters)}`); },
  // Tab 3 — Product
  productTable(filters) { return request(`/retention/product-table?${this._p(filters)}`); },
  crossSell(filters, window = "30d", foProduct = null) {
    const p = this._p(filters); p.set("window", window);
    if (foProduct) p.set("fo_product", foProduct);
    return request(`/retention/cross-sell?${p}`);
  },
  foSoGap(filters) { return request(`/retention/fo-so-gap?${this._p(filters)}`); },
  affinityMatrix(filters) { return request(`/retention/affinity-matrix?${this._p(filters)}`); },
  returnRate(filters) { return request(`/retention/return-rate?${this._p(filters)}`); },
  // Tab 4 — Acquisition quality
  channelQuality(filters, window = "30d") {
    const p = this._p(filters); p.set("window", window);
    return request(`/retention/channel-quality?${p}`);
  },
  discountRepeat(filters) { return request(`/retention/discount-repeat?${this._p(filters)}`); },
  paymentSplit(filters) { return request(`/retention/payment-split?${this._p(filters)}`); },
  cityTier(filters) { return request(`/retention/city-tier?${this._p(filters)}`); },
  aovByOrder(filters) { return request(`/retention/aov-by-order?${this._p(filters)}`); },
  // Tab 5 — Unit economics
  contributionMargin(filters) { return request(`/retention/contribution-margin?${this._p(filters)}`); },
  aiSummaryStreamUrl() { return "/retention/ai-summary/stream"; },
},

acquisition: {
  _buildParams({ startDate, endDate, campaigns, stages, creativeTypes, brands, languages, adNames, adsetNames } = {}) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    (campaigns    || []).forEach((v) => params.append("campaigns",     v));
    (stages       || []).forEach((v) => params.append("stages",        v));
    (creativeTypes|| []).forEach((v) => params.append("creative_types",v));
    (brands       || []).forEach((v) => params.append("brands",        v));
    (languages    || []).forEach((v) => params.append("languages",     v));
    (adNames      || []).forEach((v) => params.append("ad_names",      v));
    (adsetNames   || []).forEach((v) => params.append("adset_names",   v));
    return params;
  },
  overview(filters = {}) {
    const params = this._buildParams(filters);
    if (filters.compareStart) params.set("compare_start", filters.compareStart);
    if (filters.compareEnd)   params.set("compare_end",   filters.compareEnd);
    return request(`/acquisition/overview?${params}`);
  },
  trend(filters = {}, granularity = "day") {
    const params = this._buildParams(filters);
    params.set("granularity", granularity);
    return request(`/acquisition/trend?${params}`);
  },
  table(filters = {}, level = "campaign", compareStart = null, compareEnd = null) {
    const params = this._buildParams(filters);
    params.set("level", level);
    if (compareStart) params.set("compare_start", compareStart);
    if (compareEnd)   params.set("compare_end",   compareEnd);
    return request(`/acquisition/table?${params}`);
  },
  waterfall(filters = {}) {
    return request(`/acquisition/waterfall?${this._buildParams(filters)}`);
  },
  pivotTable(filters = {}, pivotBy = "brand") {
    const params = this._buildParams(filters);
    params.set("pivot_by", pivotBy);
    return request(`/acquisition/pivot-table?${params}`);
  },
  gainersDecliners(filters = {}, level = "campaign", sortBy = "roas_delta") {
    const params = this._buildParams(filters);
    params.set("level", level);
    params.set("sort_by", sortBy);
    if (filters.compareStart) params.set("compare_start", filters.compareStart);
    if (filters.compareEnd)   params.set("compare_end",   filters.compareEnd);
    return request(`/acquisition/gainers-decliners?${params}`);
  },
  filterOptions() {
    return cachedGet("/acquisition/filter-options", "filter-opts:acquisition-v2", 4 * 60 * 60 * 1000);
  },
  aiSummaryStreamUrl(endDate) {
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const defaultDate = yesterday.toISOString().slice(0, 10);
    // Cap to yesterday — pipeline only has data through yesterday
    const resolvedDate = (!endDate || endDate >= defaultDate) ? defaultDate : endDate;
    return `/acquisition/ai-summary/stream?end_date=${resolvedDate}`;
  },
  partnership({ startDate, endDate, compareStart = null, compareEnd = null } = {}) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (compareStart) params.set("compare_start", compareStart);
    if (compareEnd)   params.set("compare_end",   compareEnd);
    return request(`/acquisition/partnership?${params}`);
  },
  geo({ startDate, endDate, groupBy = "pincode", campaigns = [] } = {}) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate, group_by: groupBy });
    (campaigns || []).forEach((v) => params.append("campaigns", v));
    return request(`/acquisition/geo?${params}`);
  },
},

supplyChain: {
  _baseParams(filters) {
    const p = new URLSearchParams({
      start_date: filters.startDate,
      end_date: filters.endDate,
    });
    if (filters.compareStart) p.set("compare_start", filters.compareStart);
    if (filters.compareEnd)   p.set("compare_end",   filters.compareEnd);
    return p;
  },
  overview(filters) { return request(`/supply-chain/overview?${this._baseParams(filters)}`); },
  waterfall(filters) { return request(`/supply-chain/waterfall?${this._baseParams(filters)}`); },
  ndrFunnel(filters) { return request(`/supply-chain/ndr-funnel?${this._baseParams(filters)}`); },
  warehouseTable(filters) { return request(`/supply-chain/warehouse-table?${this._baseParams(filters)}`); },
  courierTable(filters) { return request(`/supply-chain/courier-table?${this._baseParams(filters)}`); },
  paymentTable(filters) { return request(`/supply-chain/payment-table?${this._baseParams(filters)}`); },
  courierWhMatrix(filters) { return request(`/supply-chain/courier-wh-matrix?${this._baseParams(filters)}`); },
  topPincodes(filters, limit = 10) {
    const p = this._baseParams(filters);
    p.append("limit", String(limit));
    return request(`/supply-chain/top-pincodes?${p}`);
  },
  deliveryDayDistribution(filters) {
    return request(`/supply-chain/delivery-day-distribution?${this._baseParams(filters)}`);
  },
  trend(filters, { segment, metric, granularity, subFilter }) {
    const p = this._baseParams(filters);
    if (segment) p.append("segment", segment);
    if (metric) p.append("metric", metric);
    if (granularity) p.append("granularity", granularity);
    if (subFilter) p.append("sub_filter", subFilter);
    return request(`/supply-chain/trend?${p}`);
  },
  segmentOptions(segment) {
    const url = segment
      ? `/supply-chain/segment-options?segment=${encodeURIComponent(segment)}`
      : `/supply-chain/segment-options`;
    return cachedGet(url, `filter-opts:sc-segment:${segment || "all"}`, 4 * 60 * 60 * 1000);
  },
  aiSummaryStreamUrl() { return "/supply-chain/ai-summary/stream"; },
},
};