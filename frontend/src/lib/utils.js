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
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
export function daysAgoISO(d) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString().slice(0, 10);
}