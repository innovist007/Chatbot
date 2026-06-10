import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useAcquisition } from "@/modules/acquisition/useAcquisition";
import { AcquisitionTabs, ACQUISITION_TABS } from "@/modules/acquisition/components/AcquisitionTabs";
import { PartnershipTab } from "@/modules/acquisition/components/PartnershipTab";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardBody } from "@/shared/ui/Card";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { AIFlash } from "@/shared/components/AIFlash";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { DataTable } from "@/shared/components/DataTable";
import { KpiCard } from "@/shared/components/KpiCard";
import { Pill } from "@/shared/ui/Pill";
import { api } from "@/lib/api";
import { fmt, cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────
const GRANULARITY_OPTIONS = [
  { value: "day",   label: "DoD" },
  { value: "week",  label: "WoW" },
  { value: "month", label: "MoM" },
];

// Metric catalogue used by the multi-metric trend chart picker.
// axis: "bar" → left Y-axis (monetary / count)  |  "line" → right Y-axis (ratios / rates)
// chartVal: transforms raw API row into chart-ready number
// fmtVal:   formats the number for tooltip / axis labels
const ALL_METRICS = [
  { key: "spend",         label: "Spend",             axis: "bar",  color: "#185FA5",
    chartVal: (r) => r.spend        ?? null,
    fmtVal:   (v) => fmt.inr(v) },
  { key: "rev_pre",       label: "Revenue (pre-RTO)",  axis: "bar",  color: "#0F6E56",
    chartVal: (r) => r.rev_pre      ?? null,
    fmtVal:   (v) => fmt.inr(v) },
  { key: "rev_post",      label: "Revenue (post-RTO)", axis: "bar",  color: "#3B6D11",
    chartVal: (r) => r.rev_post     ?? null,
    fmtVal:   (v) => fmt.inr(v) },
  { key: "roas_post",     label: "ROAS (post-RTO)",    axis: "line", color: "#A32D2D",
    chartVal: (r) => r.roas_post != null ? +r.roas_post.toFixed(2) : null,
    fmtVal:   (v) => v != null ? v.toFixed(2) + "×" : "—" },
  { key: "roas_pre",      label: "ROAS (pre-RTO)",     axis: "line", color: "#993C1D",
    chartVal: (r) => r.roas_pre  != null ? +r.roas_pre.toFixed(2)  : null,
    fmtVal:   (v) => v != null ? v.toFixed(2) + "×" : "—" },
  { key: "ctr",           label: "CTR",                axis: "line", color: "#854F0B",
    chartVal: (r) => r.ctr      != null ? +(r.ctr * 100).toFixed(2)     : null,
    fmtVal:   (v) => v != null ? v.toFixed(2) : "—" },
  { key: "cpm",           label: "CPM",                axis: "line", color: "#534AB7",
    chartVal: (r) => r.cpm      != null ? +r.cpm.toFixed(0)             : null,
    fmtVal:   (v) => fmt.inr(v) },
  { key: "cpc",           label: "CPC",                axis: "line", color: "#404040",
    chartVal: (r) => r.cpc      != null ? +r.cpc.toFixed(0)             : null,
    fmtVal:   (v) => fmt.inr(v) },
  { key: "rto_pct",       label: "RTO %",              axis: "line", color: "#7E2222",
    chartVal: (r) => r.rto_pct  != null ? +(r.rto_pct * 100).toFixed(1) : null,
    fmtVal:   (v) => v != null ? v.toFixed(1) + "%" : "—" },
  { key: "orders",        label: "Orders",             axis: "bar",  color: "#785CC0",
    chartVal: (r) => r.orders   ?? null,
    fmtVal:   (v) => fmt.num(v) },
  { key: "cac",           label: "CAC",                axis: "line", color: "#555555",
    chartVal: (r) => r.cac      != null ? +r.cac.toFixed(0)             : null,
    fmtVal:   (v) => fmt.inr(v) },
  { key: "new_customers", label: "New Customers",      axis: "bar",  color: "#2D8F5B",
    chartVal: (r) => r.new_customers ?? null,
    fmtVal:   (v) => fmt.num(v) },
];

const DEFAULT_METRICS = ["rev_pre", "roas_post", "ctr", "cpc"];

const WF_COLORS = {
  shopify: "#0F6E56",
  meta:    "#534AB7",
  ga4:     "#854F0B",
};

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-SELECT DROPDOWN — reusable filter control with search + checkboxes
// ─────────────────────────────────────────────────────────────────────────────
function MultiSelectDropdown({ placeholder, options = [], selected = [], onChange, maxW = "w-52" }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered  = options.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
  const toggle    = (val) => onChange(selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]);
  const selectAll = () => onChange([...options]);
  const clearAll  = () => onChange([]);

  const label =
    selected.length === 0 ? placeholder
    : selected.length === 1 ? selected[0]
    : `${selected.length} selected`;

  return (
    <div ref={ref} className={cn("relative", maxW)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-1",
          "border border-border rounded px-2 py-1 bg-surface text-text text-[11px]",
          "outline-none hover:border-sc-blue transition-colors",
          open && "border-sc-blue",
          selected.length > 0 && "border-sc-blue/60 bg-sc-blue/5",
        )}
      >
        <span className="truncate text-left">{label}</span>
        <svg className={cn("w-3 h-3 shrink-0 text-muted transition-transform", open && "rotate-180")} viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-surface border border-border rounded-lg shadow-lg w-64">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${placeholder.toLowerCase()}…`}
              className="w-full px-2 py-1 text-[11px] border border-border rounded outline-none focus:border-sc-blue bg-surface text-text"
            />
          </div>
          {/* Select all / Clear */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
            <button onClick={selectAll} className="text-[10px] text-sc-blue hover:underline font-medium">Select all</button>
            <button onClick={clearAll}  className="text-[10px] text-muted hover:text-text font-medium">Clear</button>
          </div>
          {/* Options */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted text-center">No results</div>
            ) : filtered.map((o) => (
              <label key={o} className="flex items-center gap-2 px-3 py-1.5 hover:bg-elevated cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => toggle(o)}
                  className="w-3 h-3 accent-sc-blue"
                />
                <span className="text-[11px] text-text truncate" title={o}>{o}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SMALL SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function roasTone(v)     { return v == null ? "neutral" : v >= 1.5 ? "green" : v >= 1.0 ? "accent" : "red"; }
function rtoTone(v)      { return v == null ? "neutral" : v <= 0.10 ? "green" : v <= 0.15 ? "amber" : "red"; }
function prepaidTone(v)  { return v == null ? "neutral" : v >= 0.40 ? "green" : v >= 0.25 ? "amber" : "red"; }
function cm2Tone(v)      { return v == null ? "neutral" : v >= 0 ? "green" : v >= -0.10 ? "amber" : "red"; }
function discTone(v)     { return v == null ? "neutral" : v <= 0.10 ? "green" : v <= 0.15 ? "amber" : "red"; }
function fatigueTone(v)  { return v >= 70 ? "text-danger" : v >= 40 ? "text-sc-amber" : "text-success"; }
function fatigueBar(v)   { return v >= 70 ? "#A32D2D" : v >= 40 ? "#854F0B" : "#3B6D11"; }

function SegGroup({ value, onChange, options, size = "xs" }) {
  return (
    <div className="flex items-center gap-0.5 bg-elevated rounded p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("rounded font-medium transition-colors",
            size === "sm" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text"
          )}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FilterChip({ label, options = [], value, onChange }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-[10px] text-muted font-semibold uppercase tracking-wide shrink-0">{label}</span>
      {["All", ...options].map((opt) => {
        const active = opt === "All" ? value == null : value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt === "All" ? null : opt)}
            className={cn(
              "px-2 py-0.5 rounded-full border text-[10px] font-medium transition-colors whitespace-nowrap",
              active
                ? "bg-sc-blue text-white border-sc-blue"
                : "bg-surface text-text-secondary border-border hover:border-sc-blue hover:text-sc-blue",
            )}>
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function DeltaBadge({ value, positiveIsBad = false }) {
  if (value == null) return <span className="text-muted text-[10px]">—</span>;
  const up   = value > 0;
  const bad  = positiveIsBad ? up : !up;
  const pct  = Math.abs(value * 100).toFixed(1);
  return (
    <span className={cn("text-[10px] font-semibold tnum", bad ? "text-danger" : "text-success")}>
      {up ? "▲" : "▼"} {pct}%
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// METRIC PICKER — checkbox dropdown for the trend chart
// ─────────────────────────────────────────────────────────────────────────────
function MetricPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false);

  const toggle = (key) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  const labelParts = ALL_METRICS.filter((m) => selected.includes(m.key)).map((m) => m.label);
  const summary =
    labelParts.length === 0 ? "No metrics"
    : labelParts.length <= 2 ? labelParts.join(", ")
    : labelParts.slice(0, 2).join(", ") + ` +${labelParts.length - 2}`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border border-border rounded-md px-2.5 py-1 bg-surface text-[11px] text-text hover:border-sc-blue transition-colors"
      >
        <span className="font-bold uppercase tracking-wide text-[10px] text-muted">Metrics:</span>
        <span className="text-text max-w-[200px] truncate">{summary}</span>
        <span className="bg-sc-blue text-white text-[9px] font-bold rounded-full px-1.5 py-0.5 leading-none">{selected.length}</span>
        <span className="text-muted text-[10px]">▾</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1.5 z-40 bg-surface border border-border rounded-lg shadow-lifted w-56 py-1">
            {/* Header */}
            <div className="flex justify-between items-center px-3 py-1.5 border-b border-border">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Select metrics</span>
              <div className="flex gap-2">
                <button className="text-[10px] text-sc-blue font-semibold hover:underline"
                  onClick={() => onChange(ALL_METRICS.map((m) => m.key))}>
                  Select all
                </button>
                <button className="text-[10px] text-danger font-semibold hover:underline"
                  onClick={() => onChange([])}>
                  Clear
                </button>
              </div>
            </div>
            {/* Options */}
            <div className="max-h-72 overflow-y-auto py-1">
              {ALL_METRICS.map((m) => (
                <label key={m.key}
                  className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-elevated cursor-pointer group select-none">
                  <input
                    type="checkbox"
                    checked={selected.includes(m.key)}
                    onChange={() => toggle(m.key)}
                    className="w-3.5 h-3.5 rounded cursor-pointer accent-sc-blue"
                  />
                  <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: m.color }} />
                  <span className="text-[11px] text-text flex-1">{m.label}</span>
                  <span className="text-[9px] text-muted ml-auto">
                    {m.axis === "bar" ? "▊ bar" : "╌ line"}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DIAGNOSTIC BANNER
// ─────────────────────────────────────────────────────────────────────────────
function DiagnosticBanner({ diagnostic, loading, initialLoading }) {
  if (initialLoading) return <div className="skeleton h-40 rounded-xl" />;
  if (!diagnostic) return null;

  const cards = [
    { key: "ctr",        label: "CTR",           bench: "2.3%",  amber: false },
    { key: "lp_load",    label: "LP load rate",  bench: "85%",   amber: true  },
    { key: "atc_rate",   label: "ATC rate",       bench: "18%",   amber: false },
    { key: "cart_order", label: "Cart → order",   bench: "50%",   amber: true  },
  ];

  return (
    <LoadingOverlay loading={loading}>
      <div className="rounded-xl border border-danger/30 bg-gradient-to-br from-red-50 to-red-100/60 p-4">
        <div className="flex items-center gap-3 mb-3">
          <span className="px-2 py-0.5 rounded-full bg-danger text-white text-[10px] font-bold tracking-wider">⚠ DIAGNOSTIC</span>
          <span className="text-sm font-semibold text-danger">Acquisition funnel gaps</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {cards.map(({ key, label, bench, amber }) => {
            const d     = diagnostic[key] || {};
            const val   = d.value ?? 0;
            const gap   = d.gap_pct ?? 0;
            const isBad = gap < 0;
            const pct   = (val * 100).toFixed(key === "ctr" ? 2 : 1) + (key === "ctr" ? "" : "%");
            const fillW = Math.min(100, (val / (amber ? 1 : 1)) * 100);

            return (
              <div key={key} className={cn("bg-white rounded-lg p-3 border-l-4", amber ? "border-l-sc-amber" : "border-l-danger")}>
                <div className="text-[9px] font-bold uppercase tracking-widest text-text-secondary mb-1">{label}</div>
                <div className={cn("text-xl font-bold font-mono", isBad ? (amber ? "text-sc-amber" : "text-danger") : "text-success")}>
                  {pct}
                </div>
                <div className="text-[10px] text-muted mt-0.5">benchmark {bench}</div>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (val / (d.benchmark || 1)) * 100)}%`,
                             background: isBad ? (amber ? "#854F0B" : "#A32D2D") : "#3B6D11" }} />
                </div>
                {isBad && (
                  <div className={cn("text-[10px] font-semibold mt-1", amber ? "text-sc-amber" : "text-danger")}>
                    ▼ {Math.abs(gap * 100).toFixed(0)}% below benchmark
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </LoadingOverlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. KPI ROW (9 cards)
// ─────────────────────────────────────────────────────────────────────────────
function MetaKpiRow({ kpis, loading, initialLoading, hasComparison }) {
  if (initialLoading) {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {Array(9).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-lg" />)}
      </div>
    );
  }
  const c = kpis?.current || {};
  // Suppress deltas entirely when comparison is off so KpiCard hides the badge
  const d = hasComparison ? (kpis?.deltas || {}) : {};

  const cards = [
    {
      label: "Spend",
      value: fmt.inr(c.spend),
      delta: d.spend, positiveIsBad: true, critical: false,
    },
    {
      // Revenue (attr.) = SUM(ga_revenue)
      label: "Revenue (attr.)",
      value: fmt.inr(c.ga_rev),
      delta: d.ga_rev, positiveIsBad: false, critical: false,
      tip: "SUM(ga_revenue) — GA4 last-click attributed revenue",
    },
    {
      // ROAS (attr.) = ga_revenue / spend
      label: "ROAS (attr.)",
      value: c.ga_roas != null ? c.ga_roas.toFixed(2) + "×" : "—",
      delta: d.ga_roas, positiveIsBad: false, critical: (c.ga_roas ?? 99) < 1.0,
      tip: "GA4 revenue ÷ Spend",
    },
    {
      // True ROAS = ga_revenue × (1 − rto_pct) / spend
      label: "True ROAS",
      value: c.ga_true_roas != null ? c.ga_true_roas.toFixed(2) + "×" : "—",
      delta: d.ga_true_roas, positiveIsBad: false, critical: (c.ga_true_roas ?? 99) < 1.0,
      tip: "GA rev × (1 − RTO%) ÷ Spend",
    },
    {
      label: "True CM/order",
      value: c.true_cm_per_order != null ? fmt.inr(c.true_cm_per_order) : "—",
      delta: null, positiveIsBad: false, critical: (c.true_cm_per_order ?? 1) < 0,
    },
    {
      // CPM = SUM(cpm) from BQ
      label: "CPM",
      value: fmt.inr(c.cpm),
      delta: d.cpm, positiveIsBad: true, critical: false,
    },
    {
      // CTR = clicks/impressions ratio → multiply ×100 for display
      label: "CTR",
      value: c.ctr != null ? (c.ctr * 100).toFixed(2) : "—",
      delta: d.ctr, positiveIsBad: false, critical: false,
    },
    {
      // CPC = SUM(cpc) from BQ
      label: "CPC",
      value: fmt.inr(c.cpc),
      delta: d.cpc, positiveIsBad: true, critical: false,
    },
    {
      label: "New Customers",
      value: fmt.num(c.new_customers),
      delta: d.new_customers, positiveIsBad: false, critical: false,
    },
  ];

  return (
    <LoadingOverlay loading={loading}>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {cards.map(({ label, value, delta, positiveIsBad, critical, tip }) => (
          <KpiCard key={label} label={label} value={value} delta={delta}
            positiveIsBad={positiveIsBad} critical={critical} tip={tip} />
        ))}
      </div>
    </LoadingOverlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. WATERFALL P&L
// ─────────────────────────────────────────────────────────────────────────────
function WaterfallSection({ startDate, endDate, filters }) {
  const [source, setSource]   = useState("shopify");
  const [wfData, setWfData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [init, setInit]       = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!wfData) setInit(true); else setLoading(true);
    api.acquisition.waterfall({ startDate, endDate, ...filters })
      .then((d) => { if (!cancelled) setWfData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setLoading(false); setInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, JSON.stringify(filters)]);

  if (init) return <div className="skeleton h-72 rounded-xl" />;

  const src    = wfData?.[source] || {};
  const color  = WF_COLORS[source];
  const maxVal = Math.max(src.gross || 0, src.spends || 0, 1);

  const rows = [
    { label: "Revenue (gross)",   val: src.gross,    type: "start",   color },
    { label: "— RTO loss",        val: src.rto,      type: "deduct",  color: "#A32D2D" },
    { label: "= Revenue after RTO",val: src.post_rto, type: "subtotal",color: "#185FA5" },
    { label: "— COGS",            val: src.cogs,     type: "deduct",  color: "#A32D2D" },
    { label: "— Logistics",       val: src.logistics,type: "deduct",  color: "#993C1D" },
    { label: "= CM1",             val: src.cm1,      type: "cm1",     color: "#534AB7" },
    { label: "— Spends",          val: src.spends,   type: "deduct",  color: "#A32D2D" },
    { label: src.cm2 >= 0 ? "= CM2 ✓" : "= CM2 ✗",
      val: src.cm2, type: src.cm2 >= 0 ? "cm2-pos" : "cm2-neg",
      color: src.cm2 >= 0 ? "#3B6D11" : "#7E2222" },
  ];

  const attrGap  = wfData?.attribution_gap_abs ?? 0;
  const attrGapP = wfData?.attribution_gap_pct;

  return (
    <div className="space-y-2">
      <SectionHeader title="P&L waterfall — where every rupee goes" subtitle="Gross → RTO → COGS → Logistics → CM1 → Spends → CM2" tone="red"
        actions={
          <SegGroup value={source} onChange={setSource}
            options={[{ value: "shopify", label: "Shopify" }, { value: "ga4", label: "GA4" }]} />
        }
      />

      {attrGap !== 0 && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-sc-amber">
          <span className="text-base leading-none">⚠</span>
          <span>
            <strong className="text-text">Meta over-claims {fmt.inr(Math.abs(attrGap))} ({attrGapP != null ? Math.abs(attrGapP * 100).toFixed(0) + "%" : "—"}) vs Shopify.</strong>
            {" "}Default view is Shopify (actual delivered) · switch source above to compare.
          </span>
        </div>
      )}

      <Card>
        <CardBody>
          <LoadingOverlay loading={loading}>
            <div className="text-xs text-muted mb-3 px-0.5">
              Showing <strong className="text-text">{wfData?.[source]?.label}</strong> · {wfData?.[source]?.desc}
            </div>

            <div className="space-y-1.5">
              {rows.map((r) => {
                if (r.val == null) return null;
                const absVal  = Math.abs(r.val);
                const widthPct = Math.min(100, (absVal / maxVal) * 100);
                const isDeduct = r.type === "deduct";
                const labelCls = isDeduct ? "text-danger" : r.type.startsWith("cm2") ? "font-bold text-text" : "text-text-secondary";
                return (
                  <div key={r.label} className="grid items-center gap-3" style={{ gridTemplateColumns: "160px 1fr 180px" }}>
                    <div className={cn("text-xs text-right font-medium", labelCls)}>{r.label}</div>
                    <div className="h-8 bg-elevated rounded relative overflow-hidden">
                      <div className="absolute left-0 top-0 h-full rounded flex items-center px-3 text-white text-[11px] font-bold font-mono transition-all duration-500"
                        style={{ width: `${widthPct}%`, background: r.color, minWidth: widthPct > 5 ? undefined : 0 }}>
                        {widthPct > 12 ? fmt.inr(r.val) : ""}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-text-secondary">
                      <strong className={isDeduct ? "text-danger" : "text-text"}>{fmt.inr(r.val)}</strong>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-dashed border-border">
              {[
                { label: "True ROAS", val: src.true_roas != null ? src.true_roas.toFixed(2) + "×" : "—", danger: (src.true_roas ?? 99) < 1.0, sub: "Post-RTO ÷ Spend · target ≥1.5×" },
                { label: "CM1 margin", val: src.cm1_pct != null ? src.cm1_pct.toFixed(1) + "%" : "—", danger: (src.cm1_pct ?? 99) < 0, sub: "After RTO + COGS + Logistics · target ≥45%" },
                { label: "CM2 margin", val: src.cm2_pct != null ? (src.cm2_pct >= 0 ? "+" : "") + src.cm2_pct.toFixed(1) + "%" : "—", danger: (src.cm2_pct ?? 99) < 0, sub: src.cm2 < 0 ? "Channel is destroying margin" : "Channel is profitable" },
              ].map(({ label, val, danger, sub }) => (
                <div key={label} className={cn("p-3 rounded-lg", danger ? "bg-red-50 border border-danger/20" : "bg-elevated")}>
                  <div className="text-[9px] font-bold uppercase tracking-widest text-muted mb-1">{label}</div>
                  <div className={cn("text-lg font-bold font-mono", danger ? "text-danger" : "text-text")}>{val}</div>
                  <div className="text-[10px] text-muted mt-0.5">{sub}</div>
                </div>
              ))}
            </div>
          </LoadingOverlay>
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4a. TREND CHART — multi-metric, dual Y-axis
// ─────────────────────────────────────────────────────────────────────────────
function TrendChart({ rows, selectedMetrics }) {
  if (!rows?.length) return <div className="py-10 text-center text-muted text-sm">No data</div>;
  if (!selectedMetrics?.length) return (
    <div className="py-10 text-center text-muted text-sm">Select at least one metric above ↗</div>
  );

  const activeDefs = ALL_METRICS.filter((m) => selectedMetrics.includes(m.key));
  const barDefs    = activeDefs.filter((m) => m.axis === "bar");
  const lineDefs   = activeDefs.filter((m) => m.axis === "line");

  // Build chart data — one entry per date point
  const data = rows.map((r) => {
    const pt = { date: r.date?.slice(5) ?? r.date };
    activeDefs.forEach((m) => { pt[m.key] = m.chartVal(r); });
    return pt;
  });

  // Left Y-axis formatter — based on first bar metric
  const fmtLeft = (v) => {
    if (!barDefs.length) return v;
    const k = barDefs[0].key;
    return (k === "orders" || k === "new_customers") ? fmt.num(v) : fmt.inr(v);
  };

  // Right Y-axis formatter — based on first line metric
  const fmtRight = (v) => {
    if (!lineDefs.length) return v;
    const k = lineDefs[0].key;
    if (k === "rto_pct") return v + "%";
    if (k === "ctr") return v;
    if (k === "roas_post" || k === "roas_pre") return v + "×";
    return fmt.inr(v);
  };

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: lineDefs.length ? 52 : 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e5e5" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#737373" }} stroke="#d4d4d4"
            tickLine={false} interval="preserveStartEnd" />
          {barDefs.length > 0 && (
            <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={fmtLeft}
              stroke="transparent" tickLine={false} axisLine={false} width={68} />
          )}
          {lineDefs.length > 0 && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#737373" }}
              tickFormatter={fmtRight} stroke="transparent" tickLine={false} axisLine={false} width={40} />
          )}
          <Tooltip isAnimationActive={false} cursor={{ fill: "rgba(24,95,165,0.06)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]?.payload;
              return (
                <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2.5 text-xs min-w-[160px]"
                  style={{ pointerEvents: "none" }}>
                  <div className="text-muted mb-2 font-semibold">{label}</div>
                  <div className="space-y-1">
                    {activeDefs.map((m) => (
                      <div key={m.key} className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: m.color }} />
                        <span className="text-text-secondary flex-1">{m.label}:</span>
                        <span className="tnum font-semibold text-text">{m.fmtVal(row[m.key])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            }}
          />
          {/* Bars — left axis */}
          {barDefs.map((m) => (
            <Bar key={m.key} yAxisId="left" dataKey={m.key} name={m.label}
              fill={m.color} opacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          ))}
          {/* Lines — right axis */}
          {lineDefs.map((m) => (
            <Line key={m.key} yAxisId="right" dataKey={m.key} name={m.label}
              stroke={m.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center mt-1 px-2">
        {activeDefs.map((m) => (
          <div key={m.key} className="flex items-center gap-1.5 text-[10px] text-text-secondary">
            <span className={cn("w-3 h-3 flex-shrink-0", m.axis === "bar" ? "rounded-sm" : "rounded-full")}
              style={{ background: m.color }} />
            {m.label} {m.axis === "line" ? "(→)" : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4b. PERFORMANCE TABLE — filter bar, multi-metric chart, sortable columns
// ─────────────────────────────────────────────────────────────────────────────
function PerfTableSection({ startDate, endDate, filterOpts, compareStart, compareEnd }) {
  // ── Window / metric selection ──────────────────────────────────────────────
  const [granularity, setGran]       = useState("week");
  const [selMetrics,  setSelMetrics] = useState(DEFAULT_METRICS);

  // ── Level / Source ─────────────────────────────────────────────────────────
  const [level,  setLevel]  = useState("campaign");
  const [source, setSource] = useState("shopify");

  // ── Pending filter state (UI, not yet applied) — all multi-select arrays ───
  const [pBrands,    setPBrands]    = useState([]);
  const [pCampaigns, setPCampaigns] = useState([]);
  const [pAdNames,   setPAdNames]   = useState([]);
  const [pCreatives, setPCreatives] = useState([]);
  const [pAdsets,    setPAdsets]    = useState([]);

  // ── Applied filter state (triggers API fetches) ────────────────────────────
  const [aFilters, setAFilters] = useState({ brands: [], campaigns: [], adNames: [], creatives: [], adsets: [] });

  // ── Table sort ─────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState("spend");
  const [sortDir, setSortDir] = useState("desc");
  const [search,  setSearch]  = useState("");

  // ── Server data ────────────────────────────────────────────────────────────
  const [tableRows, setTableRows] = useState([]);
  const [trendRows, setTrendRows] = useState([]);
  const [tblLoad,   setTblLoad]   = useState(false);
  const [tblInit,   setTblInit]   = useState(true);
  const [tndLoad,   setTndLoad]   = useState(false);
  const [tndInit,   setTndInit]   = useState(true);

  const apiFilters = useMemo(() => ({
    brands:        aFilters.brands.length    ? aFilters.brands    : undefined,
    campaigns:     aFilters.campaigns.length ? aFilters.campaigns : undefined,
    adNames:       aFilters.adNames.length   ? aFilters.adNames   : undefined,
    creativeTypes: aFilters.creatives.length ? aFilters.creatives : undefined,
    adsetNames:    aFilters.adsets.length    ? aFilters.adsets    : undefined,
  }), [aFilters]);

  // fetch table
  useEffect(() => {
    let cancelled = false;
    if (!tableRows.length) setTblInit(true); else setTblLoad(true);
    api.acquisition.table(
      { startDate, endDate, ...apiFilters },
      level, compareStart, compareEnd,
    ).then((d) => { if (!cancelled) setTableRows(d ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setTblLoad(false); setTblInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, JSON.stringify(apiFilters), level, compareStart, compareEnd]);

  // fetch trend — intentionally NOT filtered by apiFilters (table filters are table-only)
  useEffect(() => {
    let cancelled = false;
    if (!trendRows.length) setTndInit(true); else setTndLoad(true);
    api.acquisition.trend(
      { startDate, endDate }, granularity,
    ).then((d) => { if (!cancelled) setTrendRows(d ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setTndLoad(false); setTndInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, granularity]);

  // ── Filter bar handlers ────────────────────────────────────────────────────
  const handleApply = () =>
    setAFilters({ brands: pBrands, campaigns: pCampaigns, adNames: pAdNames, creatives: pCreatives, adsets: pAdsets });

  const handleReset = () => {
    setPBrands([]); setPCampaigns([]); setPAdNames([]); setPCreatives([]); setPAdsets([]);
    setAFilters({ brands: [], campaigns: [], adNames: [], creatives: [], adsets: [] });
  };

  const hasPendingFilters = pBrands.length > 0 || pCampaigns.length > 0 || pAdNames.length > 0 || pCreatives.length > 0 || pAdsets.length > 0;
  const granLabel = { day: "DoD", week: "WoW", month: "MoM" }[granularity] || granularity;

  // ── Source-aware rev / ROAS ────────────────────────────────────────────────
  const getRevPre   = (r) => source === "meta" ? r.meta_rev : source === "ga4" ? r.ga_rev : r.shopify_rev_pre;
  const getRevPost  = (r) => source === "meta" ? r.meta_rev : source === "ga4" ? r.ga_rev : r.shopify_rev_post;
  const getRoasPre  = (r) => { const v = getRevPre(r);  return r.spend > 0 ? v / r.spend : null; };
  const getRoasPost = (r) => { const v = getRevPost(r); return r.spend > 0 ? v / r.spend : null; };

  // ── Source-aware order-level metrics ──────────────────────────────────────
  const getAov        = (r) => source === "ga4" ? r.aov_ga         : r.aov_shopify;
  const getPrepaidPct = (r) => source === "ga4" ? r.prepaid_pct_ga : r.prepaid_pct_shopify;
  const getRtoPct     = (r) => source === "ga4" ? r.rto_pct_ga     : r.rto_pct_shopify;
  // CM2% denominator changes with source: Shopify = delivered_rev, GA4 = ga_revenue
  const getCm2Pct     = (r) => source === "ga4" ? r.cm2_pct_ga     : r.cm2_pct_shopify;
  // New customer% — shopify: new_customers/shopify_orders · ga4: new_customers/ga_orders
  const getNewPct     = (r) => source === "ga4" ? r.new_pct_ga     : r.new_pct_shopify;

  // ── Sort + search ──────────────────────────────────────────────────────────
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const visibleRows = useMemo(() => {
    let rows = tableRows;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((r) => (r.name || "").toLowerCase().includes(q));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
        const bv = b[sortKey] ?? (sortDir === "desc" ? -Infinity : Infinity);
        if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === "asc" ? av - bv : bv - av;
      });
    }
    return rows;
  }, [tableRows, search, sortKey, sortDir]);

  // ── Totals row — all derived via correct formulas, no direct sum of rates ──
  const totals = useMemo(() => {
    if (!visibleRows.length) return null;
    const S = (k) => visibleRows.reduce((s, r) => s + (r[k] ?? 0), 0);

    const spend            = S("spend");
    const meta_rev         = S("meta_rev");
    const shopify_rev_pre  = S("shopify_rev_pre");
    const shopify_rev_post = S("shopify_rev_post");
    const ga_rev           = S("ga_rev");
    const rto_amount       = S("rto_amount");

    // Implied order counts from AOV (orders_i = rev_i / aov_i)
    const shopify_orders = visibleRows.reduce((s, r) =>
      (r.aov_shopify ?? 0) > 0 ? s + (r.shopify_rev_pre ?? 0) / r.aov_shopify : s, 0);
    const ga_orders = visibleRows.reduce((s, r) =>
      (r.aov_ga ?? 0) > 0 ? s + (r.ga_rev ?? 0) / r.aov_ga : s, 0);

    // AOV = total_rev / total_implied_orders
    const aov_shopify = shopify_orders > 0 ? shopify_rev_pre / shopify_orders : null;
    const aov_ga      = ga_orders      > 0 ? ga_rev          / ga_orders      : null;

    // Disc % = Σ(disc_pct × rev) / Σrev  (revenue-weighted — equals total_discounts / total_rev)
    const disc_pct_shopify = shopify_rev_pre > 0
      ? visibleRows.reduce((s, r) => s + (r.disc_pct_shopify ?? 0) * (r.shopify_rev_pre ?? 0), 0) / shopify_rev_pre
      : null;
    const disc_pct_ga = ga_rev > 0
      ? visibleRows.reduce((s, r) => s + (r.disc_pct_ga ?? 0) * (r.ga_rev ?? 0), 0) / ga_rev
      : null;

    // Prepaid % = Σ(prepaid_pct × orders) / Σorders  (order-weighted)
    const prepaid_pct_shopify = shopify_orders > 0
      ? visibleRows.reduce((s, r) => {
          const ord = (r.aov_shopify ?? 0) > 0 ? (r.shopify_rev_pre ?? 0) / r.aov_shopify : 0;
          return s + (r.prepaid_pct_shopify ?? 0) * ord;
        }, 0) / shopify_orders
      : null;
    const prepaid_pct_ga = ga_orders > 0
      ? visibleRows.reduce((s, r) => {
          const ord = (r.aov_ga ?? 0) > 0 ? (r.ga_rev ?? 0) / r.aov_ga : 0;
          return s + (r.prepaid_pct_ga ?? 0) * ord;
        }, 0) / ga_orders
      : null;

    // RTO % = Σrto_amount / Σrev_post  (actual total RTO / total revenue delivered)
    const rto_pct_shopify = shopify_rev_post > 0 ? rto_amount / shopify_rev_post : null;
    const rto_pct_ga      = ga_rev           > 0 ? rto_amount / ga_rev           : null;

    // New Cust % = Σ(new_pct × orders) / Σorders  (order-weighted)
    const new_pct_shopify = shopify_orders > 0
      ? visibleRows.reduce((s, r) => {
          const ord = (r.aov_shopify ?? 0) > 0 ? (r.shopify_rev_pre ?? 0) / r.aov_shopify : 0;
          return s + (r.new_pct_shopify ?? 0) * ord;
        }, 0) / shopify_orders
      : null;
    const new_pct_ga = ga_orders > 0
      ? visibleRows.reduce((s, r) => {
          const ord = (r.aov_ga ?? 0) > 0 ? (r.ga_rev ?? 0) / r.aov_ga : 0;
          return s + (r.new_pct_ga ?? 0) * ord;
        }, 0) / ga_orders
      : null;

    // CAC = Σspend / Σnew_customers  (new_customers_i = spend_i / cac_i)
    const total_nc = visibleRows.reduce((s, r) =>
      (r.cac ?? 0) > 0 ? s + (r.spend ?? 0) / r.cac : s, 0);
    const cac = total_nc > 0 ? spend / total_nc : null;

    // LTV = Σ(ltv_i × nc_i) / Σnc_i  (new-customer-weighted)
    const ltv_30d_per_customer = total_nc > 0
      ? visibleRows.reduce((s, r) => {
          const nc = (r.cac ?? 0) > 0 ? (r.spend ?? 0) / r.cac : 0;
          return s + (r.ltv_30d_per_customer ?? 0) * nc;
        }, 0) / total_nc
      : null;

    // CM2 % = Σ(cm2_pct × rev) / Σrev  (revenue-weighted)
    // Mathematically equivalent to (Σrev − ΣCOGS − Σlogistics − Σspend) / Σrev
    const cm2_pct_shopify = shopify_rev_pre > 0
      ? visibleRows.reduce((s, r) => s + (r.cm2_pct_shopify ?? 0) * (r.shopify_rev_pre ?? 0), 0) / shopify_rev_pre
      : null;
    const cm2_pct_ga = ga_rev > 0
      ? visibleRows.reduce((s, r) => s + (r.cm2_pct_ga ?? 0) * (r.ga_rev ?? 0), 0) / ga_rev
      : null;

    return {
      spend, meta_rev, rto_amount,
      meta_roas:         spend > 0 ? meta_rev / spend            : null,
      shopify_rev_pre,
      shopify_roas_pre:  spend > 0 ? shopify_rev_pre  / spend    : null,
      shopify_rev_post,
      shopify_roas_post: spend > 0 ? shopify_rev_post / spend    : null,
      ga_rev,
      ga_roas:           spend > 0 ? ga_rev / spend              : null,
      aov_shopify, aov_ga,
      disc_pct_shopify, disc_pct_ga,
      prepaid_pct_shopify, prepaid_pct_ga,
      rto_pct_shopify, rto_pct_ga,
      new_pct_shopify, new_pct_ga,
      cac, ltv_30d_per_customer,
      cm2_pct_shopify, cm2_pct_ga,
    };
  }, [visibleRows]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const aovKey    = source === "ga4" ? "aov_ga"         : "aov_shopify";
    const prepaidKey= source === "ga4" ? "prepaid_pct_ga" : "prepaid_pct_shopify";
    const rtoKey    = source === "ga4" ? "rto_pct_ga"     : "rto_pct_shopify";
    const discKey   = source === "ga4" ? "disc_pct_ga"    : "disc_pct_shopify";
    const cm2Key    = source === "ga4" ? "cm2_pct_ga"     : "cm2_pct_shopify";
    const newPctKey = source === "ga4" ? "new_pct_ga"     : "new_pct_shopify";
    const cols = [
      ["name", "Name"], ["stage", "Stage"], ["spend", "Spend"],
      ["shopify_rev_pre", "Rev (pre-RTO)"], ["shopify_rev_post", "Rev (post-RTO)"],
      ["meta_rev", "Meta Rev"], ["ga_rev", "GA4 Rev"],
      [aovKey, "AOV"], [discKey, "Disc %"], [prepaidKey, "Prepaid %"],
      [rtoKey, "RTO %"], [newPctKey, "New Cust %"], ["cac", "CAC"], ["ltv_30d_per_customer", "LTV 30d"],
      [cm2Key, "CM2 %"], ["fatigue_score", "Fatigue"],
    ];
    const header = cols.map(([, l]) => l).join(",");
    const body = visibleRows.map((r) =>
      cols.map(([k]) => {
        const v = r[k];
        return v == null ? "" : typeof v === "string" ? `"${v}"` : v;
      }).join(",")
    ).join("\n");
    const blob = new Blob([header + "\n" + body], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `meta_${level}_${startDate}_${endDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [visibleRows, level, source, startDate, endDate]);

  // ── Sortable header cell ───────────────────────────────────────────────────
  // stickyLeft: px offset from left edge (undefined = not sticky)
  // lastSticky: adds a divider shadow to mark the frozen / scrollable boundary
  const SortTh = ({ colKey, label, align = "left", stickyLeft, lastSticky, minW }) => (
    <th
      onClick={() => handleSort(colKey)}
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
        "bg-sc-gray-100 text-sc-gray-600 cursor-pointer select-none top-0",
        "hover:bg-sc-blue-light/40 hover:text-sc-blue transition-colors",
        stickyLeft != null ? "sticky z-20" : "sticky z-10",
        align === "right" ? "text-right" : "text-left",
      )}
      style={{
        ...(stickyLeft  != null ? { left: stickyLeft }                              : {}),
        ...(lastSticky          ? { boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" } : {}),
        ...(minW                ? { minWidth: minW, width: minW }                   : {}),
      }}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className="text-[9px]">
          {sortKey === colKey ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕"}
        </span>
      </span>
    </th>
  );

  return (
    <div className="space-y-3">
      <SectionHeader
        title="Performance — filter, chart & table"
        subtitle={`Filters apply to chart and table · Window: ${granLabel}`}
        tone="teal"
      />

      {/* ── 1. Trend chart card ── */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Window toggle */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Window:</span>
              <SegGroup value={granularity} onChange={setGran} options={GRANULARITY_OPTIONS} size="sm" />
            </div>
            {/* Multi-metric picker */}
            <MetricPicker selected={selMetrics} onChange={setSelMetrics} />
          </div>
          {tndInit ? (
            <div className="skeleton h-[280px] rounded" />
          ) : (
            <LoadingOverlay loading={tndLoad}>
              <TrendChart rows={trendRows} selectedMetrics={selMetrics} />
            </LoadingOverlay>
          )}
        </CardBody>
      </Card>

      {/* ── 2. Filter bar ── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 bg-elevated rounded-lg border border-border">
        <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Filter:</span>

        <MultiSelectDropdown
          placeholder="All brands"
          options={filterOpts.brands || []}
          selected={pBrands}
          onChange={setPBrands}
          maxW="w-36"
        />
        <MultiSelectDropdown
          placeholder="All campaigns"
          options={filterOpts.campaigns || []}
          selected={pCampaigns}
          onChange={setPCampaigns}
          maxW="w-48"
        />
        <MultiSelectDropdown
          placeholder="All ad sets"
          options={filterOpts.adset_names || []}
          selected={pAdsets}
          onChange={setPAdsets}
          maxW="w-44"
        />
        <MultiSelectDropdown
          placeholder="All ads"
          options={filterOpts.ad_names || []}
          selected={pAdNames}
          onChange={setPAdNames}
          maxW="w-40"
        />
        <MultiSelectDropdown
          placeholder="All ad types"
          options={filterOpts.creative_types || []}
          selected={pCreatives}
          onChange={setPCreatives}
          maxW="w-36"
        />

        <div className="flex items-center gap-2 ml-auto">
          {hasPendingFilters && (
            <button onClick={handleReset}
              className="px-3 py-1 rounded border border-border text-[11px] text-muted hover:text-text hover:border-border-strong transition-colors">
              Reset
            </button>
          )}
          <button onClick={handleApply}
            className="px-4 py-1 rounded bg-sc-blue text-white text-[11px] font-semibold hover:bg-sc-blue/90 transition-colors">
            Apply
          </button>
        </div>
      </div>

      {/* ── 3. Table card ── */}
      <Card>
        <CardBody className="space-y-3">
          {/* Table controls */}
          <div className="flex items-center justify-between gap-2">
            {/* Left: Level + Source */}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Level:</span>
              {[{ v: "campaign", l: "Campaign" }, { v: "adset", l: "Ad Set" }, { v: "ad", l: "Ad" }].map(({ v, l }) => (
                <button key={v} onClick={() => setLevel(v)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-colors",
                    level === v ? "bg-sc-blue text-white border-sc-blue" : "bg-surface text-text-secondary border-border hover:border-sc-blue hover:text-sc-blue",
                  )}>
                  {l}{!tblInit && level === v && <span className="ml-1 opacity-75">({tableRows.length})</span>}
                </button>
              ))}
              <div className="w-px h-4 bg-border" />
              <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Source:</span>
              {[{ v: "shopify", l: "Shopify" }, { v: "ga4", l: "GA4" }].map(({ v, l }) => (
                <button key={v} onClick={() => setSource(v)}
                  className={cn(
                    "px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-colors",
                    source === v ? "bg-sc-blue text-white border-sc-blue" : "bg-surface text-text-secondary border-border hover:border-sc-blue hover:text-sc-blue",
                  )}>
                  {l}
                </button>
              ))}
            </div>
            {/* Right: Search + Export */}
            <div className="flex items-center gap-2 shrink-0">
              <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search table…"
                className="border border-border rounded px-2 py-0.5 bg-surface text-text text-[11px] outline-none w-36 hover:border-sc-blue focus:border-sc-blue transition-colors" />
              <button onClick={handleExport}
                className="px-3 py-1 rounded border border-border text-[11px] font-semibold text-text-secondary hover:border-sc-blue hover:text-sc-blue transition-colors whitespace-nowrap">
                Export CSV
              </button>
            </div>
          </div>

          {/* Table — sticky: Name(0) · Spend(180) · Meta Rev(272) · Meta ROAS(364) · rest scrolls */}
          {tblInit ? (
            <div className="skeleton h-64 rounded" />
          ) : (
            <LoadingOverlay loading={tblLoad}>
              <div className="overflow-x-auto overflow-y-auto rounded border border-border" style={{ maxHeight: 400 }}>
                <table className="text-sm border-collapse" style={{ minWidth: "max-content", width: "100%" }}>
                  <thead>
                    <tr>
                      {/* ── Sticky cols ── */}
                      <SortTh colKey="name"      label={level === "ad" ? "Ad" : level === "adset" ? "Ad Set" : "Campaign"}
                        stickyLeft={0}   minW={180} />
                      <SortTh colKey="spend"     label="Spend"      align="right" stickyLeft={180} minW={92} />
                      <SortTh colKey="meta_rev"  label="Meta Rev"   align="right" stickyLeft={272} minW={92} />
                      <SortTh colKey="meta_roas" label="Meta ROAS"  align="right" stickyLeft={364} minW={92} lastSticky />
                      {/* ── Scrollable cols ── */}
                      <SortTh colKey="stage"                label="Stage"          />
                      <SortTh colKey="shopify_rev_pre"      label="Rev (pre-RTO)"  align="right" />
                      <SortTh colKey="shopify_roas_pre"     label="ROAS (pre)"     align="right" />
                      <SortTh colKey="shopify_rev_post"     label="Rev (post-RTO)" align="right" />
                      <SortTh colKey="shopify_roas_post"    label="ROAS (post)"    align="right" />
                      <SortTh colKey="ga_rev"               label="GA4 Rev"        align="right" />
                      <SortTh colKey="ga_roas"              label="GA4 ROAS"       align="right" />
                      <SortTh colKey="aov"                  label="AOV"            align="right" />
                      <SortTh colKey="disc_pct"             label="Disc %"         align="right" />
                      <SortTh colKey="prepaid_pct"          label="Prepaid %"      align="right" />
                      <SortTh colKey="rto_pct"              label="RTO %"          align="right" />
                      <SortTh colKey="new_pct"              label="New Cust %"     align="right" />
                      <SortTh colKey="cac"                  label="CAC"            align="right" />
                      <SortTh colKey="ltv_30d_per_customer" label="LTV 30d"        align="right" />
                      <SortTh colKey="cm2_pct"              label="CM2 %"          align="right" />
                      <SortTh colKey="fatigue_score"        label="Fatigue"        align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={20} className="py-10 text-center text-muted text-sm">No data</td>
                      </tr>
                    ) : visibleRows.map((r, i) => {
                      const roasPre  = getRoasPre(r);
                      const roasPost = getRoasPost(r);
                      const discPct  = source === "ga4" ? r.disc_pct_ga : r.disc_pct_shopify;
                      // bg classes shared by all sticky cells — must be opaque and match row hover
                      const sBg = "bg-surface group-hover:bg-sc-gray-50";
                      return (
                        <tr key={`${r.name}_${i}`}
                          className="border-b border-sc-gray-100 last:border-b-0 hover:bg-sc-gray-50 transition-colors group">
                          {/* ── Sticky: Name ── */}
                          <td className={cn("px-3 py-2 sticky z-10 min-w-[180px] max-w-[220px]", sBg)} style={{ left: 0 }}>
                            <div className="font-medium text-[11px] text-sc-blue truncate" title={r.name}>{r.name}</div>
                            {r.brand && <div className="text-[9px] text-muted">{r.brand}</div>}
                          </td>
                          {/* ── Sticky: Spend ── */}
                          <td className={cn("px-3 py-2 sticky z-10 text-right tnum text-xs", sBg)} style={{ left: 180 }}>
                            {fmt.inr(r.spend)}
                          </td>
                          {/* ── Sticky: Meta Rev ── */}
                          <td className={cn("px-3 py-2 sticky z-10 text-right tnum text-xs", sBg)} style={{ left: 272 }}>
                            {fmt.inr(r.meta_rev)}
                          </td>
                          {/* ── Sticky: Meta ROAS — last frozen, shadow divider ── */}
                          <td className={cn("px-3 py-2 sticky z-10 text-right", sBg)}
                            style={{ left: 364, boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" }}>
                            <Pill tone={roasTone(r.meta_roas)} className="text-[10px] tnum">
                              {r.meta_roas != null ? r.meta_roas.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          {/* ── Scrollable cols ── */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.stage ? <Pill tone="neutral" className="text-[9px]">{r.stage}</Pill> : <span className="text-muted text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right tnum text-xs whitespace-nowrap">{fmt.inr(r.shopify_rev_pre)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Pill tone={roasTone(roasPre)} className="text-[10px] tnum">
                              {roasPre != null ? roasPre.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-right tnum text-xs whitespace-nowrap">{fmt.inr(r.shopify_rev_post)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Pill tone={roasTone(roasPost)} className="text-[10px] tnum">
                              {roasPost != null ? roasPost.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-right tnum text-xs whitespace-nowrap">{fmt.inr(r.ga_rev)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Pill tone={roasTone(r.ga_roas)} className="text-[10px] tnum">
                              {r.ga_roas != null ? r.ga_roas.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-right tnum text-xs whitespace-nowrap">{fmt.inr(getAov(r))}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <Pill tone={discTone(discPct)} className="text-[10px] tnum">
                              {discPct != null ? (discPct * 100).toFixed(1) + "%" : "—"}
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {(() => { const v = getPrepaidPct(r); return (
                              <Pill tone={prepaidTone(v)} className="text-[10px] tnum">
                                {v != null ? (v * 100).toFixed(1) + "%" : "—"}
                              </Pill>
                            ); })()}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {(() => { const v = getRtoPct(r); return (
                              <Pill tone={rtoTone(v)} className="text-[10px] tnum">
                                {v != null ? (v * 100).toFixed(1) + "%" : "—"}
                              </Pill>
                            ); })()}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {(() => { const v = getNewPct(r); return (
                              <span className={cn("text-[11px] tnum font-semibold",
                                v == null ? "text-muted" : v >= 0.5 ? "text-success" : v >= 0.3 ? "text-sc-amber" : "text-text")}>
                                {v != null ? (v * 100).toFixed(1) + "%" : "—"}
                              </span>
                            ); })()}
                          </td>
                          <td className="px-3 py-2 text-right tnum text-xs whitespace-nowrap">{fmt.inr(r.cac)}</td>
                          <td className="px-3 py-2 text-right tnum text-xs whitespace-nowrap">{fmt.inr(r.ltv_30d_per_customer)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {(() => {
                              const v = getCm2Pct(r);
                              return (
                                <span className={cn("text-[11px] font-semibold tnum",
                                  v == null ? "text-muted" : v >= 0 ? "text-success" : "text-danger")}>
                                  {v != null ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%" : "—"}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {(() => {
                              const v = r.fatigue_score ?? 0;
                              return (
                                <div className="flex items-center justify-end gap-1.5">
                                  <div className="w-8 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${v}%`, background: fatigueBar(v) }} />
                                  </div>
                                  <span className={cn("text-[10px] font-bold tnum w-5 text-right", fatigueTone(v))}>{v}</span>
                                </div>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    })}
                    {/* ── Totals row — every <td> sticky bottom-0 so it pins while scrolling ── */}
                    {totals && (() => {
                      // Solid colour — opacity-based colours bleed through when the row is sticky
                      const tBg  = "#EBF4FE";
                      // Shared td style builder
                      const sBase = (extra = {}) => ({ background: tBg, bottom: 0, ...extra });
                      return (
                        <tr className="border-t-2 border-sc-blue/25 font-semibold text-[11px]">
                          {/* ── Sticky-left + sticky-bottom corner cells ── */}
                          <td className="px-3 py-2 sticky z-30 min-w-[180px] whitespace-nowrap"
                            style={sBase({ left: 0 })}>
                            <span className="font-bold text-sc-blue">TOTAL · {visibleRows.length}</span>
                          </td>
                          <td className="px-3 py-2 sticky z-30 text-right tnum"
                            style={sBase({ left: 180 })}>
                            {fmt.inr(totals.spend)}
                          </td>
                          <td className="px-3 py-2 sticky z-30 text-right tnum"
                            style={sBase({ left: 272 })}>
                            {fmt.inr(totals.meta_rev)}
                          </td>
                          <td className="px-3 py-2 sticky z-30 text-right"
                            style={sBase({ left: 364, boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" })}>
                            <Pill tone={roasTone(totals.meta_roas)} className="text-[10px] tnum">
                              {totals.meta_roas != null ? totals.meta_roas.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          {/* ── Scrollable cells — sticky-bottom only ── */}
                          {[
                            <span className="text-muted text-xs">—</span>,
                            <span className="tnum text-xs">{fmt.inr(totals.shopify_rev_pre)}</span>,
                            <Pill tone={roasTone(totals.shopify_roas_pre)} className="text-[10px] tnum">{totals.shopify_roas_pre != null ? totals.shopify_roas_pre.toFixed(2)+"×" : "—"}</Pill>,
                            <span className="tnum text-xs">{fmt.inr(totals.shopify_rev_post)}</span>,
                            <Pill tone={roasTone(totals.shopify_roas_post)} className="text-[10px] tnum">{totals.shopify_roas_post != null ? totals.shopify_roas_post.toFixed(2)+"×" : "—"}</Pill>,
                            <span className="tnum text-xs">{fmt.inr(totals.ga_rev)}</span>,
                            <Pill tone={roasTone(totals.ga_roas)} className="text-[10px] tnum">{totals.ga_roas != null ? totals.ga_roas.toFixed(2)+"×" : "—"}</Pill>,
                            <span className="tnum text-xs">{fmt.inr(source === "ga4" ? totals.aov_ga : totals.aov_shopify)}</span>,
                            (() => { const v = source === "ga4" ? totals.disc_pct_ga : totals.disc_pct_shopify; return <Pill tone={discTone(v)} className="text-[10px] tnum">{v != null ? (v*100).toFixed(1)+"%" : "—"}</Pill>; })(),
                            (() => { const v = source === "ga4" ? totals.prepaid_pct_ga : totals.prepaid_pct_shopify; return <Pill tone={prepaidTone(v)} className="text-[10px] tnum">{v != null ? (v*100).toFixed(1)+"%" : "—"}</Pill>; })(),
                            (() => { const v = source === "ga4" ? totals.rto_pct_ga : totals.rto_pct_shopify; return <Pill tone={rtoTone(v)} className="text-[10px] tnum">{v != null ? (v*100).toFixed(1)+"%" : "—"}</Pill>; })(),
                            (() => { const v = source === "ga4" ? totals.new_pct_ga : totals.new_pct_shopify; return <span className={cn("tnum font-semibold", v == null ? "text-muted" : v >= 0.5 ? "text-success" : v >= 0.3 ? "text-sc-amber" : "text-text")}>{v != null ? (v*100).toFixed(1)+"%" : "—"}</span>; })(),
                            <span className="tnum text-xs">{fmt.inr(totals.cac)}</span>,
                            <span className="tnum text-xs">{fmt.inr(totals.ltv_30d_per_customer)}</span>,
                            (() => { const v = source === "ga4" ? totals.cm2_pct_ga : totals.cm2_pct_shopify; return <span className={cn("tnum font-semibold", v == null ? "text-muted" : v >= 0 ? "text-success" : "text-danger")}>{v != null ? (v >= 0 ? "+" : "")+(v*100).toFixed(1)+"%" : "—"}</span>; })(),
                            <span className="text-muted text-xs">—</span>,
                          ].map((cell, idx) => (
                            <td key={idx} className="px-3 py-2 sticky z-[4] whitespace-nowrap text-right"
                              style={sBase()}>
                              {cell}
                            </td>
                          ))}
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="mt-1.5 text-[10px] text-muted px-1 flex justify-between">
                <span>
                  <strong className="text-text">Frozen:</strong> Name · Spend · Meta Rev · Meta ROAS ·
                  <strong className="text-text"> CM2 %</strong> = ({source === "ga4" ? "GA4 rev" : "Delivered rev"} − COGS − Logistics − Spend) ÷ {source === "ga4" ? "GA4 rev" : "Delivered rev"}
                </span>
                <span>{visibleRows.length} rows</span>
              </div>
            </LoadingOverlay>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BRAND × CREATIVE × LANGUAGE PIVOT
// ─────────────────────────────────────────────────────────────────────────────
function PivotTableSection({ startDate, endDate }) {
  const [pivotBy,  setPivot]   = useState("brand");
  const [source,   setSource]  = useState("shopify");
  const [rows,     setRows]    = useState([]);
  const [loading,  setLoading] = useState(false);
  const [init,     setInit]    = useState(true);
  const [sortKey,  setPivSortKey] = useState("spend");
  const [sortDir,  setPivSortDir] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    if (!rows.length) setInit(true); else setLoading(true);
    api.acquisition.pivotTable({ startDate, endDate }, pivotBy)
      .then((d) => { if (!cancelled) setRows(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setLoading(false); setInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, pivotBy]);

  const getRevPre  = (r) => source === "meta" ? r.meta_rev : source === "ga4" ? r.ga_rev : r.shopify_rev_pre;
  const getRoasPost = (r) => {
    const rev = source === "meta" ? r.meta_rev : source === "ga4" ? r.ga_rev : r.shopify_rev_post;
    return r.spend > 0 ? rev / r.spend : null;
  };
  // ROAS (pre-RTO): shopify uses shopify_rev_pre/spend; meta & ga4 have no separate pre so same as post
  const getRoasPre = (r) => {
    if (source === "meta") return r.meta_roas   ?? null;
    if (source === "ga4")  return r.ga_roas     ?? null;
    return r.shopify_roas_pre ?? null;   // shopify_rev_pre / spend — from backend
  };

  const PIVOT_OPTIONS = [
    { value: "brand",         label: "Brand" },
    { value: "creative_type", label: "Creative" },
    { value: "language",      label: "Language" },
    { value: "brand_creative",label: "Brand × Creative" },
    { value: "full",          label: "Full combo" },
  ];

  const handlePivSort = (key) => {
    if (sortKey === key) setPivSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setPivSortKey(key); setPivSortDir("desc"); }
  };

  // Fixed widths for dimension (sticky) columns
  const DIM_W = { brand: 130, creative_type: 110, language: 90 };
  const DIM_KEYS = ["brand", "creative_type", "language"];

  const columns = useMemo(() => {
    const showBrand    = ["brand", "brand_creative", "full"].includes(pivotBy);
    const showCreative = ["creative_type", "brand_creative", "full"].includes(pivotBy);
    const showLang     = ["language", "full"].includes(pivotBy);
    const base = [
      showBrand    && { key: "brand",         label: "Brand",    sortVal: (r) => r.brand || "",
        render: (r) => <span className="font-semibold text-xs">{r.brand || "—"}</span> },
      showCreative && { key: "creative_type", label: "Creative", sortVal: (r) => r.creative_type || "",
        render: (r) => <Pill tone="purple" className="text-[10px]">{r.creative_type || "—"}</Pill> },
      showLang     && { key: "language",      label: "Language", sortVal: (r) => r.language || "",
        render: (r) => <Pill tone="blue"   className="text-[10px]">{r.language || "—"}</Pill> },
      { key: "spend",    label: "Spend",      align: "right", sortVal: (r) => r.spend ?? 0,
        render: (r) => <span className="tnum text-xs">{fmt.inr(r.spend)}</span> },
      { key: "meta_rev", label: "Meta Rev",   align: "right", sortVal: (r) => r.meta_rev ?? 0,
        render: (r) => <span className="tnum text-xs">{fmt.inr(r.meta_rev)}</span> },
      { key: "meta_roas",label: "Meta ROAS",  align: "right", sortVal: (r) => r.meta_roas ?? 0,
        render: (r) => { const v = r.meta_roas ?? null; return <Pill tone={roasTone(v)} className="text-[10px] tnum">{v != null ? v.toFixed(2)+"×" : "—"}</Pill>; } },
      { key: "rev_pre",  label: "Rev (pre)",  align: "right", sortVal: (r) => getRevPre(r) ?? 0,
        render: (r) => <span className="tnum text-xs">{fmt.inr(getRevPre(r))}</span> },
      { key: "roas_pre", label: "ROAS (pre)", align: "right", sortVal: (r) => getRoasPre(r) ?? 0,
        render: (r) => { const v = getRoasPre(r); return <Pill tone={roasTone(v)} className="text-[10px] tnum">{v != null ? v.toFixed(2)+"×" : "—"}</Pill>; } },
      { key: "roas_post",label: "ROAS (post)",align: "right", sortVal: (r) => getRoasPost(r) ?? 0,
        render: (r) => { const v = getRoasPost(r); return <Pill tone={roasTone(v)} className="text-[10px] tnum">{v != null ? v.toFixed(2)+"×" : "—"}</Pill>; } },
      { key: "aov",      label: "AOV",        align: "right", sortVal: (r) => (source === "ga4" ? r.aov_ga : r.aov_shopify) ?? 0,
        render: (r) => { const v = source === "ga4" ? r.aov_ga : r.aov_shopify; return <span className="tnum text-xs">{fmt.inr(v)}</span>; } },
      { key: "disc_pct", label: "Disc %",     align: "right", sortVal: (r) => (source === "ga4" ? r.disc_pct_ga : r.disc_pct_shopify) ?? 0,
        render: (r) => { const v = source === "ga4" ? r.disc_pct_ga : r.disc_pct_shopify; return <Pill tone={discTone(v)} className="text-[10px] tnum">{v != null ? (v * 100).toFixed(1)+"%" : "—"}</Pill>; } },
      { key: "prepaid_pct",label:"Prepaid %", align: "right", sortVal: (r) => (source === "ga4" ? r.prepaid_pct_ga : r.prepaid_pct_shopify) ?? 0,
        render: (r) => { const v = source === "ga4" ? r.prepaid_pct_ga : r.prepaid_pct_shopify; return <Pill tone={prepaidTone(v)} className="text-[10px] tnum">{v != null ? (v * 100).toFixed(1)+"%" : "—"}</Pill>; } },
      { key: "rto_amount",label: "RTO (₹)",   align: "right", sortVal: (r) => r.rto_amount ?? 0,
        render: (r) => <span className="tnum text-xs text-danger">{fmt.inr(r.rto_amount)}</span> },
      { key: "rto_pct",  label: "RTO %",      align: "right", sortVal: (r) => (source === "ga4" ? r.rto_pct_ga : r.rto_pct_shopify) ?? 0,
        render: (r) => { const v = source === "ga4" ? r.rto_pct_ga : r.rto_pct_shopify; return <Pill tone={rtoTone(v)} className="text-[10px] tnum">{v != null ? (v * 100).toFixed(1)+"%" : "—"}</Pill>; } },
      { key: "new_pct",  label: "New Cust %", align: "right", sortVal: (r) => (source === "ga4" ? r.new_pct_ga : r.new_pct_shopify) ?? 0,
        render: (r) => { const v = source === "ga4" ? r.new_pct_ga : r.new_pct_shopify; return <span className={cn("text-[11px] tnum font-semibold", v == null ? "text-muted" : v >= 0.5 ? "text-success" : v >= 0.3 ? "text-sc-amber" : "text-text")}>{v != null ? (v * 100).toFixed(1)+"%" : "—"}</span>; } },
      { key: "cac",      label: "CAC",         align: "right", sortVal: (r) => r.cac ?? 0,
        render: (r) => <span className="tnum text-xs">{fmt.inr(r.cac)}</span> },
      { key: "ltv_30d",  label: "LTV 30d",    align: "right", sortVal: (r) => r.ltv_30d_per_customer ?? 0,
        render: (r) => <span className="tnum text-xs">{fmt.inr(r.ltv_30d_per_customer)}</span> },
      { key: "cm2_pct",  label: "CM2 %",      align: "right", sortVal: (r) => (source === "ga4" ? r.cm2_pct_ga : r.cm2_pct_shopify) ?? 0,
        render: (r) => { const v = source === "ga4" ? r.cm2_pct_ga : r.cm2_pct_shopify; return <span className={cn("text-[11px] font-semibold tnum", v == null ? "text-muted" : v >= 0 ? "text-success" : "text-danger")}>{v != null ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1)+"%" : "—"}</span>; } },
    ].filter(Boolean);
    return base;
  }, [pivotBy, source]);

  // dimOffsets and PivotSortTh must come AFTER columns (they reference it)
  const dimOffsets = useMemo(() => {
    const dims = columns.filter((c) => DIM_KEYS.includes(c.key));
    let left = 0;
    const offsets = {};
    dims.forEach((c) => { offsets[c.key] = left; left += DIM_W[c.key] || 100; });
    const lastKey = dims.length > 0 ? dims[dims.length - 1].key : null;
    return { offsets, lastKey };
  }, [columns]);

  const PivotSortTh = ({ colKey, label, align = "left" }) => {
    const isDim      = DIM_KEYS.includes(colKey);
    const stickyL    = isDim ? dimOffsets.offsets[colKey] : undefined;
    const lastSticky = isDim && colKey === dimOffsets.lastKey;
    return (
      <th
        onClick={() => handlePivSort(colKey)}
        className={cn(
          "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0",
          isDim ? "z-30" : "z-10",
          "bg-sc-gray-100 text-sc-gray-600 cursor-pointer select-none",
          "hover:bg-sc-blue-light/40 hover:text-sc-blue transition-colors",
          align === "right" ? "text-right" : "text-left",
        )}
        style={{
          ...(stickyL    != null ? { position: "sticky", left: stickyL }               : {}),
          ...(lastSticky          ? { boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" }   : {}),
          ...(isDim               ? { minWidth: DIM_W[colKey], width: DIM_W[colKey] }  : {}),
        }}
      >
        <span className="inline-flex items-center gap-0.5">
          {label}
          <span className="text-[9px]">
            {sortKey === colKey ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕"}
          </span>
        </span>
      </th>
    );
  };

  // Sort rows by selected column
  const sortedRows = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortVal) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortVal(a), bv = col.sortVal(b);
      if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av ?? -Infinity) - (bv ?? -Infinity) : (bv ?? -Infinity) - (av ?? -Infinity);
    });
  }, [rows, columns, sortKey, sortDir]);

  // Pivot totals — same formulas as campaign table totals
  const pivotTotals = useMemo(() => {
    if (!rows.length) return null;
    const S = (k) => rows.reduce((s, r) => s + (r[k] ?? 0), 0);
    const spend            = S("spend");
    const meta_rev         = S("meta_rev");
    const shopify_rev_pre  = S("shopify_rev_pre");
    const shopify_rev_post = S("shopify_rev_post");
    const ga_rev           = S("ga_rev");
    const rto_amount       = S("rto_amount");

    const shopify_orders = rows.reduce((s, r) =>
      (r.aov_shopify ?? 0) > 0 ? s + (r.shopify_rev_pre ?? 0) / r.aov_shopify : s, 0);
    const ga_orders = rows.reduce((s, r) =>
      (r.aov_ga ?? 0) > 0 ? s + (r.ga_rev ?? 0) / r.aov_ga : s, 0);

    const revPre  = source === "ga4" ? ga_rev           : shopify_rev_pre;
    const orders  = source === "ga4" ? ga_orders        : shopify_orders;
    const aovKey  = source === "ga4" ? "aov_ga"         : "aov_shopify";
    const discKey = source === "ga4" ? "disc_pct_ga"    : "disc_pct_shopify";
    const prepKey = source === "ga4" ? "prepaid_pct_ga" : "prepaid_pct_shopify";
    const newKey  = source === "ga4" ? "new_pct_ga"     : "new_pct_shopify";
    const cm2Key  = source === "ga4" ? "cm2_pct_ga"     : "cm2_pct_shopify";
    const revKey  = source === "ga4" ? "ga_rev"         : "shopify_rev_pre";

    const aov = orders > 0 ? revPre / orders : null;

    const disc_pct = revPre > 0
      ? rows.reduce((s, r) => s + (r[discKey] ?? 0) * (r[revKey] ?? 0), 0) / revPre : null;

    const prepaid_pct = orders > 0
      ? rows.reduce((s, r) => {
          const ord = (r[aovKey] ?? 0) > 0 ? (r[revKey] ?? 0) / r[aovKey] : 0;
          return s + (r[prepKey] ?? 0) * ord;
        }, 0) / orders : null;

    const rto_pct = (source === "ga4" ? ga_rev : shopify_rev_post) > 0
      ? rto_amount / (source === "ga4" ? ga_rev : shopify_rev_post) : null;

    const new_pct = orders > 0
      ? rows.reduce((s, r) => {
          const ord = (r[aovKey] ?? 0) > 0 ? (r[revKey] ?? 0) / r[aovKey] : 0;
          return s + (r[newKey] ?? 0) * ord;
        }, 0) / orders : null;

    const total_nc = rows.reduce((s, r) =>
      (r.cac ?? 0) > 0 ? s + (r.spend ?? 0) / r.cac : s, 0);
    const cac = total_nc > 0 ? spend / total_nc : null;

    const ltv = total_nc > 0
      ? rows.reduce((s, r) => {
          const nc = (r.cac ?? 0) > 0 ? (r.spend ?? 0) / r.cac : 0;
          return s + (r.ltv_30d_per_customer ?? 0) * nc;
        }, 0) / total_nc : null;

    const cm2_pct = revPre > 0
      ? rows.reduce((s, r) => s + (r[cm2Key] ?? 0) * (r[revKey] ?? 0), 0) / revPre : null;

    return {
      spend, meta_rev, rto_amount,
      meta_roas:  spend > 0 ? meta_rev / spend : null,
      rev_pre:    revPre,
      roas_pre:   spend > 0 ? (source === "ga4" ? ga_rev : shopify_rev_pre) / spend : null,
      roas_post:  spend > 0 ? (source === "ga4" ? ga_rev : shopify_rev_post) / spend : null,
      aov, disc_pct, prepaid_pct, rto_pct, new_pct, cac, ltv, cm2_pct,
    };
  }, [rows, source]);

  return (
    <div className="space-y-2">
      <SectionHeader title="Brand × Creative × Language pivot" subtitle="Aggregate P&L by selected dimension · source toggle drives revenue & ROAS" tone="teal" />
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Group by:</span>
            <SegGroup value={pivotBy} onChange={setPivot} options={PIVOT_OPTIONS} size="sm" />
            <div className="w-px h-4 bg-border" />
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Source:</span>
            <SegGroup value={source} onChange={setSource}
              options={[{ value: "shopify", label: "Shopify" }, { value: "ga4", label: "GA4" }]} size="sm" />
          </div>
          {init ? <div className="skeleton h-48" /> : (
            <LoadingOverlay loading={loading}>
              <div className="overflow-x-auto overflow-y-auto rounded border border-border" style={{ maxHeight: 360 }}>
                <table className="text-sm border-collapse w-full" style={{ minWidth: "max-content" }}>
                  <thead>
                    <tr>
                      {columns.map((col) => (
                        <PivotSortTh key={col.key} colKey={col.key} label={col.label} align={col.align} />
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.length === 0 ? (
                      <tr><td colSpan={columns.length} className="py-8 text-center text-muted text-sm">No data</td></tr>
                    ) : sortedRows.map((r, i) => (
                      <tr key={`${r.brand}_${r.creative_type}_${r.language}_${i}`}
                        className={cn("border-b border-sc-gray-100 hover:bg-sc-gray-50 transition-colors group",
                          i % 2 === 1 ? "bg-elevated/30" : "bg-surface")}>
                        {columns.map((col) => {
                          const isDim      = DIM_KEYS.includes(col.key);
                          const stickyL    = isDim ? dimOffsets.offsets[col.key] : undefined;
                          const lastSticky = isDim && col.key === dimOffsets.lastKey;
                          return (
                            <td
                              key={col.key}
                              className={cn(
                                "px-3 py-2 whitespace-nowrap",
                                isDim ? "sticky z-10 bg-surface group-hover:bg-sc-gray-50" : "",
                                i % 2 === 1 && isDim ? "bg-elevated/30" : "",
                                col.align === "right" ? "text-right" : "text-left",
                              )}
                              style={{
                                ...(stickyL    != null ? { left: stickyL }                              : {}),
                                ...(lastSticky           ? { boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" } : {}),
                                ...(isDim                ? { minWidth: DIM_W[col.key] }                     : {}),
                              }}
                            >
                              {col.render ? col.render(r, i) : (r[col.key] ?? "—")}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* ── Pivot totals — sticky at bottom, dim cols frozen left ── */}
                    {pivotTotals && (() => {
                      const T = pivotTotals;
                      const metricCell = (key) => {
                        switch (key) {
                          case "spend":       return <span className="tnum text-xs">{fmt.inr(T.spend)}</span>;
                          case "meta_rev":    return <span className="tnum text-xs">{fmt.inr(T.meta_rev)}</span>;
                          case "meta_roas":   return <Pill tone={roasTone(T.meta_roas)} className="text-[10px] tnum">{T.meta_roas != null ? T.meta_roas.toFixed(2)+"×" : "—"}</Pill>;
                          case "rev_pre":     return <span className="tnum text-xs">{fmt.inr(T.rev_pre)}</span>;
                          case "roas_pre":    return <Pill tone={roasTone(T.roas_pre)} className="text-[10px] tnum">{T.roas_pre != null ? T.roas_pre.toFixed(2)+"×" : "—"}</Pill>;
                          case "roas_post":   return <Pill tone={roasTone(T.roas_post)} className="text-[10px] tnum">{T.roas_post != null ? T.roas_post.toFixed(2)+"×" : "—"}</Pill>;
                          case "aov":         return <span className="tnum text-xs">{fmt.inr(T.aov)}</span>;
                          case "disc_pct":    return <Pill tone={discTone(T.disc_pct)} className="text-[10px] tnum">{T.disc_pct != null ? (T.disc_pct*100).toFixed(1)+"%" : "—"}</Pill>;
                          case "prepaid_pct": return <Pill tone={prepaidTone(T.prepaid_pct)} className="text-[10px] tnum">{T.prepaid_pct != null ? (T.prepaid_pct*100).toFixed(1)+"%" : "—"}</Pill>;
                          case "rto_amount":  return <span className="tnum text-xs text-danger">{fmt.inr(T.rto_amount)}</span>;
                          case "rto_pct":     return <Pill tone={rtoTone(T.rto_pct)} className="text-[10px] tnum">{T.rto_pct != null ? (T.rto_pct*100).toFixed(1)+"%" : "—"}</Pill>;
                          case "new_pct":     return <span className={cn("text-[11px] tnum font-semibold", T.new_pct == null ? "text-muted" : T.new_pct >= 0.5 ? "text-success" : T.new_pct >= 0.3 ? "text-sc-amber" : "text-text")}>{T.new_pct != null ? (T.new_pct*100).toFixed(1)+"%" : "—"}</span>;
                          case "cac":         return <span className="tnum text-xs">{fmt.inr(T.cac)}</span>;
                          case "ltv_30d":     return <span className="tnum text-xs">{fmt.inr(T.ltv)}</span>;
                          case "cm2_pct":     return <span className={cn("text-[11px] font-semibold tnum", T.cm2_pct == null ? "text-muted" : T.cm2_pct >= 0 ? "text-success" : "text-danger")}>{T.cm2_pct != null ? (T.cm2_pct >= 0 ? "+" : "") + (T.cm2_pct*100).toFixed(1)+"%" : "—"}</span>;
                          default:            return <span className="text-muted text-[10px]">—</span>;
                        }
                      };
                      // Solid colour — prevents bleed-through when sticky
                      const bg = "#EBF4FE";
                      return (
                        // No sticky on <tr> — put sticky bottom-0 on every <td> instead
                        <tr className="border-t-2 border-sc-blue/25 font-semibold text-[11px]">
                          {columns.map((col, ci) => {
                            const isDim      = DIM_KEYS.includes(col.key);
                            const stickyL    = isDim ? dimOffsets.offsets[col.key] : undefined;
                            const lastSticky = isDim && col.key === dimOffsets.lastKey;

                            if (isDim) {
                              return (
                                <td
                                  key={col.key}
                                  className="px-3 py-2 whitespace-nowrap sticky z-30"
                                  style={{
                                    left: stickyL,
                                    bottom: 0,
                                    background: bg,
                                    minWidth: DIM_W[col.key],
                                    ...(lastSticky ? { boxShadow: "3px 0 6px -2px rgba(0,0,0,0.12)" } : {}),
                                  }}
                                >
                                  {ci === 0 && (
                                    <span className="font-bold text-sc-blue">TOTAL · {rows.length}</span>
                                  )}
                                </td>
                              );
                            }
                            return (
                              <td
                                key={col.key}
                                className={cn("px-3 py-2 whitespace-nowrap sticky z-[4]",
                                  col.align === "right" ? "text-right" : "")}
                                style={{ bottom: 0, background: bg }}
                              >
                                {metricCell(col.key)}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
              <div className="mt-1 text-[10px] text-muted px-1 flex justify-end">
                {sortedRows.length} rows · click column header to sort
              </div>
            </LoadingOverlay>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. GAINERS / DECLINERS
// ─────────────────────────────────────────────────────────────────────────────
function GainersDeclinersSection({ startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const [level,  setLevel]  = useState("campaign");
  const [sortBy, setSortBy] = useState("roas_delta");
  const [data,   setData]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [init,    setInit]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!data) setInit(true); else setLoading(true);
    api.acquisition.gainersDecliners(
      {
        startDate, endDate,
        compareStart: hasComparison ? compareStart : null,
        compareEnd:   hasComparison ? compareEnd   : null,
      },
      level, sortBy,
    )
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setLoading(false); setInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, hasComparison ? compareStart : null, hasComparison ? compareEnd : null, level, sortBy]);

  const gainers   = data?.gainers   || [];
  const decliners = data?.decliners || [];

  const makeColumns = (isGainer) => [
    { key: "rank", label: "#", render: (_, i) => <span className={cn("font-mono font-bold text-xs", isGainer ? "text-success" : "text-danger")}>{i + 1}</span> },
    { key: "name", label: level === "ad" ? "Ad" : "Campaign",
      render: (r) => <div className="font-medium text-[11px] text-text truncate max-w-[200px]" title={r.name}>{r.name}</div> },
    { key: "prior_roas",   label: "Prior",   align: "right", render: (r) => <span className="tnum text-xs text-muted">{(r.prior_roas   ?? 0).toFixed(2)}×</span> },
    { key: "current_roas", label: "Current", align: "right", render: (r) => <span className="tnum text-xs font-semibold text-text">{(r.current_roas ?? 0).toFixed(2)}×</span> },
    {
      key: "delta", label: sortBy === "rev_delta" ? "Δ Rev" : "Δ ROAS", align: "right",
      render: (r) => {
        const v = sortBy === "rev_delta" ? r.rev_delta : r.roas_delta;
        return (
          <span className={cn("tnum text-xs font-bold", isGainer ? "text-success" : "text-danger")}>
            {isGainer ? "▲" : "▼"} {sortBy === "rev_delta" ? fmt.inr(Math.abs(v || 0)) : Math.abs(v || 0).toFixed(2) + "×"}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-2">
      <SectionHeader
        title="Top 10 movers — period vs prior period"
        subtitle={hasComparison && compareStart ? `vs ${compareStart} → ${compareEnd}` : "vs auto-computed prior period"}
        tone="green"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted">Level:</span>
            <SegGroup value={level} onChange={setLevel}
              options={[{ value: "campaign", label: "Campaign" }, { value: "ad", label: "Ad" }]} />
            <div className="w-px h-4 bg-border" />
            <span className="text-[10px] text-muted">Sort:</span>
            <SegGroup value={sortBy} onChange={setSortBy}
              options={[{ value: "roas_delta", label: "ROAS Δ" }, { value: "rev_delta", label: "Rev Δ" }]} />
          </div>
        }
      />
      {init ? <div className="skeleton h-56" /> : (
        <LoadingOverlay loading={loading}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card className="border-t-[3px] border-t-success">
              <div className="px-4 py-2.5 bg-elevated border-b border-border flex justify-between items-center">
                <span className="text-xs font-semibold text-success">▲ Top gainers · ROAS up</span>
                <span className="text-[10px] text-muted font-mono">
                  +{gainers.reduce((s, r) => s + Math.abs(r.roas_delta || 0), 0).toFixed(2)}× combined
                </span>
              </div>
              <DataTable columns={makeColumns(true)}  rows={gainers}   getRowKey={(r, i) => `g-${i}`} maxHeight={320} />
            </Card>
            <Card className="border-t-[3px] border-t-danger">
              <div className="px-4 py-2.5 bg-elevated border-b border-border flex justify-between items-center">
                <span className="text-xs font-semibold text-danger">▼ Top decliners · ROAS down</span>
                <span className="text-[10px] text-muted font-mono">
                  {decliners.reduce((s, r) => s + (r.roas_delta || 0), 0).toFixed(2)}× combined
                </span>
              </div>
              <DataTable columns={makeColumns(false)} rows={decliners} getRowKey={(r, i) => `d-${i}`} maxHeight={320} />
            </Card>
          </div>
        </LoadingOverlay>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. GEOGRAPHIC PERFORMANCE
// ─────────────────────────────────────────────────────────────────────────────
function GeoSection({ startDate, endDate }) {
  const [groupBy,  setGroupBy]  = useState("pincode");
  const [sortKey,  setSortKey]  = useState("orders");
  const [sortDir,  setSortDir]  = useState("desc");
  const [search,   setSearch]   = useState("");
  const [rows,     setRows]     = useState([]);
  const [kpis,     setKpis]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [initLoad, setInitLoad] = useState(true);

  useEffect(() => {
    if (!startDate || !endDate) return;
    let cancelled = false;
    setLoading(true);
    api.acquisition.geo({ startDate, endDate, groupBy })
      .then((d) => { if (!cancelled) { setRows(d.rows || []); setKpis(d.kpis || null); setInitLoad(false); } })
      .catch(() => { if (!cancelled) setInitLoad(false); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate, groupBy]);

  const handleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = q ? rows.filter((row) => (row.location || "").toLowerCase().includes(q)) : rows;
    return [...r].sort((a, b) => {
      const av = a[sortKey] ?? -Infinity;
      const bv = b[sortKey] ?? -Infinity;
      return sortDir === "desc" ? (bv > av ? 1 : -1) : (av > bv ? 1 : -1);
    });
  }, [rows, search, sortKey, sortDir]);

  const exportCsv = () => {
    const headers = ["Location","Tier","Orders","RTO Orders","RTO%","Net Orders","Gross Rev","Net Rev","AOV","Prepaid%","COD%"];
    const csvRows = filtered.map((r) => [
      r.location, r.tier, r.orders, r.rto_orders,
      r.rto_pct     != null ? (r.rto_pct     * 100).toFixed(1) + "%" : "",
      r.net_orders,
      r.gross_rev   != null ? r.gross_rev.toFixed(0)   : "",
      r.net_rev     != null ? r.net_rev.toFixed(0)     : "",
      r.aov         != null ? r.aov.toFixed(0)         : "",
      r.prepaid_pct != null ? (r.prepaid_pct * 100).toFixed(1) + "%" : "",
      r.cod_pct     != null ? (r.cod_pct     * 100).toFixed(1) + "%" : "",
    ]);
    const blob = new Blob([[headers, ...csvRows].map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `geo_${groupBy}_${startDate}_${endDate}.csv`; a.click();
  };

  const rtoBadge = (pct) => {
    if (pct == null) return "bg-sc-gray-100 text-sc-gray-500";
    if (pct <= 0.10) return "bg-green-100 text-green-700";
    if (pct <= 0.15) return "bg-amber-100 text-amber-700";
    return "bg-red-100 text-red-700";
  };

  const Th = ({ colKey, label, align = "left", minW }) => (
    <th
      onClick={() => handleSort(colKey)}
      className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap sticky top-0 z-10
                 bg-sc-gray-100 text-sc-gray-600 cursor-pointer select-none hover:bg-sc-blue-light/40 hover:text-sc-blue transition-colors"
      style={{ textAlign: align, ...(minW ? { minWidth: minW } : {}) }}
    >
      <span className="inline-flex items-center gap-0.5">
        {label}
        <span className="text-[9px]">{sortKey === colKey ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕"}</span>
      </span>
    </th>
  );

  if (initLoad) return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[0,1,2,3].map((i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
      </div>
      <div className="skeleton h-64 rounded-xl" />
    </div>
  );

  const fmt  = (n) => n == null ? "—" : n >= 1e5 ? `₹${(n/1e5).toFixed(2)}L` : `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const fmtN = (n) => n == null ? "—" : n.toLocaleString("en-IN");
  const fmtP = (n) => n == null ? "—" : (n * 100).toFixed(1) + "%";

  return (
    <LoadingOverlay loading={loading}>
      <div className="space-y-3">
        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1">Total Orders</div>
            <div className="text-2xl font-bold text-text tnum">
              {kpis?.total_orders != null ? (kpis.total_orders >= 1000 ? `${(kpis.total_orders/1000).toFixed(1)}K` : kpis.total_orders) : "—"}
            </div>
            <div className="text-xs text-muted mt-0.5">across {kpis?.location_count ?? 0} {groupBy === "pincode" ? "pincodes" : groupBy === "city" ? "cities" : groupBy === "state" ? "states" : "tiers"}</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1">RTO Orders</div>
            <div className="text-2xl font-bold text-danger tnum">
              {kpis?.total_rto != null ? (kpis.total_rto >= 1000 ? `${(kpis.total_rto/1000).toFixed(2)}K` : kpis.total_rto) : "—"}
            </div>
            <div className="text-xs text-muted mt-0.5">{fmtP(kpis?.rto_rate)} blended RTO rate</div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1">Worst Location</div>
            <div className="text-lg font-bold text-danger truncate">{kpis?.worst_location ?? "—"}</div>
            <div className="text-xs text-muted mt-0.5">
              {kpis?.worst_rto_pct != null ? `${(kpis.worst_rto_pct * 100).toFixed(1)}% RTO` : ""}
              {kpis?.worst_orders  != null ? ` · ${kpis.worst_orders} orders` : ""}
            </div>
          </div>
          <div className="bg-surface border border-border rounded-xl p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-1">COD Share</div>
            <div className="text-2xl font-bold text-text tnum">{fmtP(kpis?.cod_share)}</div>
            <div className="text-xs text-muted mt-0.5">vs {fmtP(kpis?.prepaid_share)} prepaid</div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 bg-sc-gray-100 rounded-lg p-1">
            <span className="text-[10px] font-semibold text-muted px-2">GROUP BY:</span>
            {["pincode","city","state","tier"].map((g) => (
              <button key={g} onClick={() => setGroupBy(g)}
                className={cn("px-3 py-1 rounded-md text-xs font-semibold capitalize transition-colors",
                  groupBy === g ? "bg-sc-blue text-white" : "text-text-secondary hover:text-text")}
              >{g}</button>
            ))}
          </div>
          <div className="relative">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${groupBy} / city / state…`}
              className="pl-8 pr-3 py-1.5 text-xs border border-border rounded-lg bg-surface text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-sc-blue w-52"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-xs">🔍</span>
          </div>
          <div className="flex-1" />
          <button onClick={exportCsv}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border bg-surface hover:bg-sc-gray-100 text-text transition-colors">
            Export CSV
          </button>
        </div>

        {/* Table — 10 rows visible (~420px), rest scroll */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 420 }}>
            <table className="w-full text-xs border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr>
                  <Th colKey="location"    label="Location"    minW="180px" />
                  <Th colKey="tier"        label="Tier"        align="center" />
                  <Th colKey="orders"      label="Orders"      align="right" />
                  <Th colKey="rto_orders"  label="RTO Orders"  align="right" />
                  <Th colKey="rto_pct"     label="RTO %"       align="center" />
                  <Th colKey="net_orders"  label="Net Orders"  align="right" />
                  <Th colKey="gross_rev"   label="Gross Rev"   align="right" />
                  <Th colKey="net_rev"     label="Net Rev"     align="right" />
                  <Th colKey="aov"         label="AOV"         align="right" />
                  <Th colKey="prepaid_pct" label="Prepaid %"   align="center" />
                  <Th colKey="cod_pct"     label="COD %"       align="center" />
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider bg-sc-gray-100 text-sc-gray-600 sticky top-0 z-10 text-left whitespace-nowrap">
                    Top Sources
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={12} className="px-4 py-8 text-center text-muted text-xs">No data</td></tr>
                )}
                {filtered.map((r, i) => (
                  <tr key={i} className="border-t border-sc-gray-100 hover:bg-sc-gray-50 transition-colors">
                    <td className="px-3 py-2 font-medium text-text whitespace-nowrap max-w-[220px] truncate">{r.location}</td>
                    <td className="px-3 py-2 text-center">
                      {r.tier ? <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sc-blue/10 text-sc-blue">{r.tier}</span> : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tnum">{fmtN(r.orders)}</td>
                    <td className="px-3 py-2 text-right tnum text-danger font-medium">{fmtN(r.rto_orders)}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={cn("px-2 py-0.5 rounded-full text-[11px] font-semibold", rtoBadge(r.rto_pct))}>
                        {fmtP(r.rto_pct)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tnum">{fmtN(r.net_orders)}</td>
                    <td className="px-3 py-2 text-right tnum">{fmt(r.gross_rev)}</td>
                    <td className="px-3 py-2 text-right tnum">{fmt(r.net_rev)}</td>
                    <td className="px-3 py-2 text-right tnum">{r.aov != null ? `₹${Math.round(r.aov).toLocaleString("en-IN")}` : "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">{fmtP(r.prepaid_pct)}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sc-gray-100 text-sc-gray-600">{fmtP(r.cod_pct)}</span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {(r.top_sources || []).map((s, si) => (
                          <span key={si} title={s.name}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-sc-blue/10 text-sc-blue text-[10px] font-medium max-w-[160px] cursor-default">
                            <span className="truncate">{s.name}</span>
                            <span className="shrink-0 font-bold">{(s.share * 100).toFixed(0)}%</span>
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > 0 && (
            <div className="px-4 py-2 border-t border-border bg-sc-gray-50 text-[10px] text-muted">
              RTO % = rto orders ÷ total orders · Benchmark for India D2C: ≤10% healthy, 10–15% caution, &gt;15% bleeding · Top sources % = share of total location orders
            </div>
          )}
        </div>
      </div>
    </LoadingOverlay>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. ACTION LIST (rules-driven, computed from overview data)
// ─────────────────────────────────────────────────────────────────────────────
function ActionListSection({ kpis, fatigued_ads, loading, initialLoading }) {
  if (initialLoading) return <div className="skeleton h-48 rounded-xl" />;

  const c      = kpis?.current || {};
  const pause  = (fatigued_ads || []).filter((r) => {
    const trueRoas = r.roas ?? 0;
    return trueRoas < 0.6 && (r.fatigue_score ?? r.frequency * 20) > 70;
  });
  const scale  = (fatigued_ads || []).filter((r) => (r.roas ?? 0) >= 1.5 && (r.fatigue_score ?? 100) < 40);

  const groups = [
    {
      tone: "danger",
      title: "▼ Pause now",
      meta: `${pause.length} items · stop ${fmt.inr(pause.reduce((s,r)=>s+(r.spend||0),0))} bleed`,
      items: pause.map((r) => ({
        name: r.ad_name || r.name,
        sub:  `${r.campaign_name || ""} · ROAS ${(r.roas||0).toFixed(2)}× · Freq ${(r.frequency||0).toFixed(1)}`,
        right: fmt.inr(r.spend) + " spend",
        impact: "−" + fmt.inr((r.spend||0) - (r.spend||0) * (r.roas||0)) + " CM loss",
        impactTone: "text-danger",
      })),
    },
    {
      tone: "warn",
      title: "⚠ Optimize RTO",
      meta: `${c.rto_pct != null ? (c.rto_pct*100).toFixed(1)+"% blended RTO" : ""}`,
      items: c.rto_pct > 0.15 ? [{
        name: "High RTO detected",
        sub:  `Blended RTO ${(c.rto_pct*100).toFixed(1)}% · target ≤10% · restrict COD on high-RTO geos`,
        right: fmt.inr(c.rto_amount) + " lost",
        impact: "",
        impactTone: "",
      }] : [],
    },
    {
      tone: "success",
      title: "▲ Scale carefully",
      meta: `${scale.length} winners identified`,
      items: scale.map((r) => ({
        name: r.ad_name || r.name,
        sub:  `${r.campaign_name || ""} · ROAS ${(r.roas||0).toFixed(2)}× · low fatigue ${r.fatigue_score ?? "—"}`,
        right: fmt.inr(r.spend) + " current",
        impact: "+projected CM2 at +30% budget",
        impactTone: "text-success",
      })),
    },
  ];

  return (
    <div className="space-y-2">
      <SectionHeader title="Action list — what to do today" subtitle="Auto-generated from rules · ROAS <0.6× + fatigue >70 → Pause · ROAS >1.5× + fatigue <40 → Scale" tone="red" />
      <Card>
        <CardBody className="space-y-4">
          <LoadingOverlay loading={loading}>
            {groups.map((g) => (
              <div key={g.title}>
                <div className={cn("flex justify-between items-baseline px-3 py-2 rounded-lg mb-2",
                  g.tone === "danger" ? "bg-red-50" : g.tone === "warn" ? "bg-amber-50" : "bg-green-50")}>
                  <span className={cn("text-xs font-bold",
                    g.tone === "danger" ? "text-danger" : g.tone === "warn" ? "text-sc-amber" : "text-success")}>{g.title}</span>
                  <span className="text-[10px] text-muted font-mono">{g.meta}</span>
                </div>
                {g.items.length === 0 ? (
                  <div className="px-3 py-2 text-[11px] text-muted italic bg-elevated rounded-lg">No items match this rule right now.</div>
                ) : (
                  <div className="space-y-1.5">
                    {g.items.map((it, i) => (
                      <div key={i} className="grid items-center gap-3 px-3 py-2 rounded-lg border border-border hover:border-border-strong hover:bg-elevated transition-colors cursor-default"
                        style={{ gridTemplateColumns: "1fr auto auto" }}>
                        <div>
                          <span className="text-xs font-semibold text-text">{it.name}</span>
                          <span className="text-[10px] text-muted ml-2">{it.sub}</span>
                        </div>
                        <span className="text-[10px] text-muted font-mono">{it.right}</span>
                        <span className={cn("text-[11px] font-bold font-mono", it.impactTone)}>{it.impact}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </LoadingOverlay>
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER TAB
// ─────────────────────────────────────────────────────────────────────────────
function PlaceholderTab({ tabKey }) {
  const meta = ACQUISITION_TABS.find((t) => t.key === tabKey);
  return (
    <Card className="p-10 flex flex-col items-center justify-center text-center">
      <div className="w-3 h-3 rounded-sm mb-3" style={{ background: meta?.color }} />
      <div className="text-sm font-semibold text-text mb-1">{meta?.label}</div>
      <div className="text-xs text-muted max-w-md">
        Coming soon. This tab will surface {meta?.label?.toLowerCase()} metrics in a future update.
      </div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AcquisitionPage({ startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const [tab, setTab] = useState("meta");

  const {
    data, loading, initialLoading, error, filterOpts,
    aiSummary, aiDate, aiLoading, aiPending,
  } = useAcquisition({ startDate, endDate, compareStart, compareEnd, hasComparison });

  const sharedFilters = {};  // top-level filters propagated to sub-sections

  return (
    <div className="px-4 py-5 max-w-[1600px] mx-auto">
      <AcquisitionTabs active={tab} onChange={setTab} />

      <div className="mt-5">
        {/* ───────── META ADS ───────── */}
        {tab === "meta" && (
          <div className="space-y-6">
            {error && (
              <div className="px-4 py-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-sm">{error}</div>
            )}

            {/* AI flash */}
            <AIFlash title="AI daily flash · Meta Ads" summary={aiSummary} date={aiDate} loading={aiLoading} pending={aiPending} />

            {/* 1. KPI row */}
            <div className="space-y-1.5">
              <SectionHeader
                title="Headline KPIs"
                subtitle={hasComparison ? "Shopify-attributed · vs comparison period" : "Shopify-attributed · no comparison selected"}
                tone="purple"
              />
              <MetaKpiRow kpis={data?.kpis} loading={loading} initialLoading={initialLoading} hasComparison={hasComparison} />
            </div>

            {/* 3. Waterfall */}
            <WaterfallSection startDate={startDate} endDate={endDate} filters={sharedFilters} />

            {/* 4. Trend + Perf table */}
            <PerfTableSection
              startDate={startDate} endDate={endDate}
              filterOpts={filterOpts}
              compareStart={compareStart} compareEnd={compareEnd}
            />

            {/* 5. Brand × Creative × Language pivot */}
            <PivotTableSection startDate={startDate} endDate={endDate} />

            {/* 6. Gainers / Decliners */}
            <GainersDeclinersSection
              startDate={startDate} endDate={endDate}
              compareStart={compareStart} compareEnd={compareEnd}
              hasComparison={hasComparison}
            />

            {/* 7. Geographic performance */}
            <div className="space-y-1.5">
              <SectionHeader
                title="Geographic Performance"
                subtitle="Where orders come from & where they RTO · v_fb_pincode_table"
                tone="blue"
              />
              <GeoSection startDate={startDate} endDate={endDate} />
            </div>

            {/* 8. Action list */}
            <ActionListSection
              kpis={data?.kpis}
              fatigued_ads={data?.fatigued_ads}
              loading={loading}
              initialLoading={initialLoading}
            />
          </div>
        )}

        {/* ───────── PARTNERSHIPS ───────── */}
        {tab === "partnership" && (
          <PartnershipTab
            startDate={startDate} endDate={endDate}
            compareStart={compareStart} compareEnd={compareEnd}
            aiSummary={aiSummary} aiDate={aiDate} aiLoading={aiLoading}
          />
        )}

        {/* ───────── PLACEHOLDERS ───────── */}
        {tab !== "meta" && tab !== "partnership" && (
          <PlaceholderTab tabKey={tab} />
        )}
      </div>
    </div>
  );
}
