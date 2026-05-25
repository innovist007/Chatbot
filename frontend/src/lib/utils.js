import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

// ---------- Formatters ----------
export const fmt = {
  inr(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
    if (abs >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
    if (abs >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "K";
    return "₹" + Math.round(n).toLocaleString("en-IN");
  },
  num(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const abs = Math.abs(n);
    if (abs >= 1e7) return (n / 1e7).toFixed(2) + " Cr";
    if (abs >= 1e5) return (n / 1e5).toFixed(2) + " L";
    if (abs >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return n.toLocaleString("en-IN");
  },
  pct(n, dp = 1) {
    if (n == null || Number.isNaN(n)) return "—";
    return (n * 100).toFixed(dp) + "%";
  },
  delta(n) {
    if (n == null || Number.isNaN(n)) return "—";
    const v = n * 100;
    return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
  },
};

// ---------- Date helpers ----------

/** Format a Date object as YYYY-MM-DD using LOCAL date components (no UTC shift). */
function localISO(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return localISO(new Date());
}
export function daysAgoISO(d) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return localISO(dt);
}

/** Shift an ISO date string back by `days` days. */
export function shiftDateISO(isoDate, days) {
  const dt = new Date(isoDate + "T00:00:00");
  dt.setDate(dt.getDate() - days);
  return localISO(dt);
}

/** Shift an ISO date string back exactly one year. */
export function yearAgoISO(isoDate) {
  const dt = new Date(isoDate + "T00:00:00");
  dt.setFullYear(dt.getFullYear() - 1);
  return localISO(dt);
}

/**
 * Given a main date range and a compare mode, return the comparison
 * start/end ISO strings (or null when mode is "none").
 */
export function computeCompareDates(mode, startDate, endDate, customStart, customEnd) {
  if (!mode || mode === "none") return null;
  if (mode === "custom") {
    if (customStart && customEnd) return { start: customStart, end: customEnd };
    return null;
  }
  const days = Math.round(
    (new Date(endDate + "T00:00:00") - new Date(startDate + "T00:00:00")) / 86400000
  ) + 1;
  if (mode === "previous_period") {
    return { start: shiftDateISO(startDate, days), end: shiftDateISO(endDate, days) };
  }
  if (mode === "previous_year") {
    return { start: yearAgoISO(startDate), end: yearAgoISO(endDate) };
  }
  return null;
}