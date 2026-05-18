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
const DEFAULT_AI_CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12h
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

function cachedGet(url, cacheKey, ttlMs = DEFAULT_AI_CACHE_TTL_MS) {
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
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ value, expiresAt: Date.now() + ttlMs }));
    } catch {
      // quota or disabled storage — still return the fresh value
    }
    return value;
  });
}

export const api = {
  webCr: {
    overview(filters) {
      const params = new URLSearchParams({
        start_date: filters.startDate,
        end_date: filters.endDate,
      });
      (filters.channels || []).forEach((v) => params.append("channel_groups", v));
      (filters.devices || []).forEach((v) => params.append("devices", v));
      (filters.campaigns || []).forEach((v) => params.append("campaigns", v));
      (filters.contentGroups || []).forEach((v) => params.append("content_groups", v));
      (filters.landingPages || []).forEach((v) => params.append("landing_pages", v));
      (filters.sessionTypes || []).forEach((v) => params.append("session_types", v));
      return request(`/web-cr?${params}`);
    },
    filterOptions() {
      return request("/web-cr/filter-options");
    },
   aiSummary() {
  return cachedGet("/web-cr/ai-summary", "ai-summary:web-cr");
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
      return request("/d2c/filter-options");
    },
  },
  
  appCr: {
    overview(filters) {
      const params = new URLSearchParams({
        start_date: filters.startDate,
        end_date: filters.endDate,
      });
      (filters.platforms || []).forEach((v) => params.append("platforms", v));
      (filters.users || []).forEach((v) => params.append("users", v));
      if (filters.compareMode) {
        params.append("compare_mode", filters.compareMode);
      }
      return request(`/app-cr/overview?${params}`);
    },
    filterOptions() {
      return request("/app-cr/filter-options");
    },
    aiSummary() {
    return cachedGet("/app-cr/ai-summary", "ai-summary:app-cr");
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
    if (filters.compareMode) {
      params.append("compare_mode", filters.compareMode);
    }
    return request(`/d2c-rto/overview?${params}`);
  },
  aiSummary() {
    return cachedGet("/d2c-rto/ai-summary", "ai-summary:d2c-rto");
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
    if (filters.compareMode) {
      params.append("compare_mode", filters.compareMode);
    }
    return request(`/promo/overview?${params}`);
  },
  aiSummary() {
    return cachedGet("/promo/ai-summary", "ai-summary:promo");
  },
},

retention: {
  overview(filters) {
    const params = new URLSearchParams({
      start_date: filters.startDate,
      end_date: filters.endDate,
      retention_window: filters.retentionWindow || "30d",
    });
    if (filters.brand && filters.brand !== "All") {
      params.append("brand", filters.brand);
    }
    if (filters.compareMode) {
      params.append("compare_mode", filters.compareMode);
    }
    return request(`/retention/overview?${params}`);
  },
  aiSummary() {
    return cachedGet("/retention/ai-summary", "ai-summary:retention");
  },
},

acquisition: {
  _buildParams({ startDate, endDate, campaigns, stages, creativeTypes, brands, languages, adNames } = {}) {
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    (campaigns || []).forEach((v) => params.append("campaigns", v));
    (stages || []).forEach((v) => params.append("stages", v));
    (creativeTypes || []).forEach((v) => params.append("creative_types", v));
    (brands || []).forEach((v) => params.append("brands", v));
    (languages || []).forEach((v) => params.append("languages", v));
    (adNames || []).forEach((v) => params.append("ad_names", v));
    return params;
  },
  overview(filters = {}) {
    return request(`/acquisition/overview?${this._buildParams(filters)}`);
  },
  trend(filters = {}, granularity = "day") {
    const params = this._buildParams(filters);
    params.set("granularity", granularity);
    return request(`/acquisition/trend?${params}`);
  },
  table(filters = {}, level = "campaign", compareMode = "MoM") {
    const params = this._buildParams(filters);
    params.set("level", level);
    params.set("compare_mode", compareMode);
    return request(`/acquisition/table?${params}`);
  },
  filterOptions() {
    return request("/acquisition/filter-options");
  },
},

supplyChain: {
  _baseParams(filters) {
    const p = new URLSearchParams({
      start_date: filters.startDate,
      end_date: filters.endDate,
    });
    if (filters.compareMode) p.append("compare_mode", filters.compareMode);
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
    return request(url);
  },
  aiSummary() { return cachedGet("/supply-chain/ai-summary", "ai-summary:supply-chain"); },
},
};