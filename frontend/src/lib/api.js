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
    window.location.href = "/login";
    throw new Error("Session expired. Please login again.");
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json();
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
      return request(`/web-cr?${params}`);
    },
    filterOptions() {
      return request("/web-cr/filter-options");
    },
   aiSummary() {
  return request("/web-cr/ai-summary");
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
    return request("/app-cr/ai-summary");  // No params!
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
    return request("/d2c-rto/ai-summary");
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
    return request("/promo/ai-summary");
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
    return request("/retention/ai-summary");
  },
},
};