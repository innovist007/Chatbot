async function request(url, options = {}) {
  const res = await fetch(url, options);
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
  },
};