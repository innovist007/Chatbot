import { useState, useMemo, useEffect, useCallback } from "react";
import { useAcquisition } from "@/hooks/useAcquisition";
import { AcquisitionTabs, ACQUISITION_TABS } from "@/components/acquisition/AcquisitionTabs";
import { PartnershipTab } from "@/components/acquisition/PartnershipTab";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardBody } from "@/components/ui/Card";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { AIFlash } from "@/components/shared/AIFlash";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { DataTable } from "@/components/DataTable";
import { KpiCard } from "@/components/KpiCard";
import { Pill } from "@/components/ui/Pill";
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
  { key: "ctr",           label: "CTR %",              axis: "line", color: "#854F0B",
    chartVal: (r) => r.ctr      != null ? +(r.ctr * 100).toFixed(2)     : null,
    fmtVal:   (v) => v != null ? v.toFixed(2) + "%" : "—" },
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
            const pct   = (val * 100).toFixed(key === "ctr" ? 2 : 1) + "%";
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
      value: c.ctr != null ? (c.ctr * 100).toFixed(2) + "%" : "—",
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
            options={[{ value: "shopify", label: "Shopify" }, { value: "meta", label: "Meta" }, { value: "ga4", label: "GA4" }]} />
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
    if (k === "ctr" || k === "rto_pct") return v + "%";
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

  // ── Pending filter state (UI dropdowns, not yet applied) ───────────────────
  const [pBrand,    setPBrand]    = useState("");
  const [pCampaign, setPCampaign] = useState("");
  const [pAdName,   setPAdName]   = useState("");
  const [pCreative, setPCreative] = useState("");

  // ── Applied filter state (triggers API fetches) ────────────────────────────
  const [aFilters, setAFilters] = useState({ brand: "", campaign: "", adName: "", creative: "" });

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
    brands:        aFilters.brand    ? [aFilters.brand]    : undefined,
    campaigns:     aFilters.campaign ? [aFilters.campaign] : undefined,
    adNames:       aFilters.adName   ? [aFilters.adName]   : undefined,
    creativeTypes: aFilters.creative ? [aFilters.creative] : undefined,
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

  // fetch trend
  useEffect(() => {
    let cancelled = false;
    if (!trendRows.length) setTndInit(true); else setTndLoad(true);
    api.acquisition.trend(
      { startDate, endDate, ...apiFilters }, granularity,
    ).then((d) => { if (!cancelled) setTrendRows(d ?? []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) { setTndLoad(false); setTndInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, JSON.stringify(apiFilters), granularity]);

  // ── Filter bar handlers ────────────────────────────────────────────────────
  const handleApply = () =>
    setAFilters({ brand: pBrand, campaign: pCampaign, adName: pAdName, creative: pCreative });

  const handleReset = () => {
    setPBrand(""); setPCampaign(""); setPAdName(""); setPCreative("");
    setAFilters({ brand: "", campaign: "", adName: "", creative: "" });
  };

  const hasPendingFilters = pBrand || pCampaign || pAdName || pCreative;
  const granLabel = { day: "DoD", week: "WoW", month: "MoM" }[granularity] || granularity;

  // ── Source-aware rev / ROAS ────────────────────────────────────────────────
  const getRevPre   = (r) => source === "meta" ? r.meta_rev : source === "ga4" ? r.ga_rev : r.shopify_rev_pre;
  const getRevPost  = (r) => source === "meta" ? r.meta_rev : source === "ga4" ? r.ga_rev : r.shopify_rev_post;
  const getRoasPre  = (r) => { const v = getRevPre(r);  return r.spend > 0 ? v / r.spend : null; };
  const getRoasPost = (r) => { const v = getRevPost(r); return r.spend > 0 ? v / r.spend : null; };

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

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const cols = [
      ["name", "Name"], ["stage", "Stage"], ["spend", "Spend"],
      ["shopify_rev_pre", "Rev (pre-RTO)"], ["shopify_rev_post", "Rev (post-RTO)"],
      ["meta_rev", "Meta Rev"], ["ga_rev", "GA4 Rev"],
      ["aov", "AOV"], ["disc_pct", "Disc %"], ["prepaid_pct", "Prepaid %"],
      ["rto_pct", "RTO %"], ["cac", "CAC"], ["ltv_30d_per_customer", "LTV 30d"],
      ["cm2_pct", "CM2 %"], ["fatigue_score", "Fatigue"],
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
  }, [visibleRows, level, startDate, endDate]);

  // ── Sortable header cell ───────────────────────────────────────────────────
  const SortTh = ({ colKey, label, align = "left" }) => (
    <th onClick={() => handleSort(colKey)}
      className={cn(
        "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap",
        "bg-sc-gray-100 text-sc-gray-600 cursor-pointer select-none",
        "hover:bg-sc-blue-light/40 hover:text-sc-blue transition-colors sticky top-0 z-10",
        align === "right" ? "text-right" : "text-left",
      )}>
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

        <select value={pBrand} onChange={(e) => setPBrand(e.target.value)}
          className="border border-border rounded px-2 py-1 bg-surface text-text text-[11px] outline-none hover:border-sc-blue transition-colors">
          <option value="">All brands</option>
          {(filterOpts.brands || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={pCampaign} onChange={(e) => setPCampaign(e.target.value)}
          className="border border-border rounded px-2 py-1 bg-surface text-text text-[11px] outline-none hover:border-sc-blue transition-colors max-w-[200px]">
          <option value="">All campaigns</option>
          {(filterOpts.campaigns || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={pAdName} onChange={(e) => setPAdName(e.target.value)}
          className="border border-border rounded px-2 py-1 bg-surface text-text text-[11px] outline-none hover:border-sc-blue transition-colors max-w-[180px]">
          <option value="">All ads</option>
          {(filterOpts.ad_names || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

        <select value={pCreative} onChange={(e) => setPCreative(e.target.value)}
          className="border border-border rounded px-2 py-1 bg-surface text-text text-[11px] outline-none hover:border-sc-blue transition-colors">
          <option value="">All ad types</option>
          {(filterOpts.creative_types || []).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>

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
          {/* Table controls row */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Level pills with count badges */}
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Level:</span>
            {[{ v: "campaign", l: "Campaign" }, { v: "ad", l: "Ad" }].map(({ v, l }) => (
              <button key={v} onClick={() => setLevel(v)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-colors",
                  level === v
                    ? "bg-sc-blue text-white border-sc-blue"
                    : "bg-surface text-text-secondary border-border hover:border-sc-blue hover:text-sc-blue",
                )}>
                {l}
                {!tblInit && level === v && (
                  <span className="ml-1 opacity-75">({tableRows.length})</span>
                )}
              </button>
            ))}

            <div className="w-px h-4 bg-border" />

            {/* Source pills */}
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted">Source:</span>
            {[{ v: "shopify", l: "Shopify" }, { v: "ga4", l: "GA4" }].map(({ v, l }) => (
              <button key={v} onClick={() => setSource(v)}
                className={cn(
                  "px-2.5 py-0.5 rounded-full border text-[11px] font-semibold transition-colors",
                  source === v
                    ? "bg-sc-blue text-white border-sc-blue"
                    : "bg-surface text-text-secondary border-border hover:border-sc-blue hover:text-sc-blue",
                )}>
                {l}
              </button>
            ))}

            <div className="w-px h-4 bg-border" />

            {/* Search */}
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table…"
              className="border border-border rounded px-2 py-0.5 bg-surface text-text text-[11px] outline-none w-36 hover:border-sc-blue focus:border-sc-blue transition-colors" />

            {/* Export CSV */}
            <button onClick={handleExport}
              className="ml-auto px-3 py-1 rounded border border-border text-[11px] font-semibold text-text-secondary hover:border-sc-blue hover:text-sc-blue transition-colors">
              Export CSV
            </button>
          </div>

          {/* Table */}
          {tblInit ? (
            <div className="skeleton h-64 rounded" />
          ) : (
            <LoadingOverlay loading={tblLoad}>
              <div className="overflow-x-auto overflow-y-auto rounded border border-border" style={{ maxHeight: 380 }}>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr>
                      <SortTh colKey="name"                  label={level === "ad" ? "Ad" : "Campaign"} />
                      <SortTh colKey="stage"                 label="Stage" />
                      <SortTh colKey="spend"                 label="Spend"          align="right" />
                      <SortTh colKey="shopify_rev_pre"       label="Rev (pre-RTO)"  align="right" />
                      <SortTh colKey="shopify_roas_pre"      label="ROAS (pre)"     align="right" />
                      <SortTh colKey="shopify_rev_post"      label="Rev (post-RTO)" align="right" />
                      <SortTh colKey="shopify_roas_post"     label="ROAS (post)"    align="right" />
                      <SortTh colKey="meta_rev"              label="Rev (Meta)"     align="right" />
                      <SortTh colKey="meta_roas"             label="ROAS (Meta)"    align="right" />
                      <SortTh colKey="aov"                   label="AOV"            align="right" />
                      <SortTh colKey="disc_pct"              label="Disc %"         align="right" />
                      <SortTh colKey="prepaid_pct"           label="Prepaid %"      align="right" />
                      <SortTh colKey="rto_pct"               label="RTO %"          align="right" />
                      <SortTh colKey="cac"                   label="CAC"            align="right" />
                      <SortTh colKey="ltv_30d_per_customer"  label="LTV 30D"        align="right" />
                      <SortTh colKey="cm2_pct"               label="CM2 %"          align="right" />
                      <SortTh colKey="fatigue_score"         label="Fatigue"        align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.length === 0 ? (
                      <tr>
                        <td colSpan={17} className="py-10 text-center text-muted text-sm">No data</td>
                      </tr>
                    ) : visibleRows.map((r, i) => {
                      const revPre   = getRevPre(r);
                      const revPost  = getRevPost(r);
                      const roasPre  = getRoasPre(r);
                      const roasPost = getRoasPost(r);
                      return (
                        <tr key={`${r.name}_${i}`}
                          className="border-b border-sc-gray-100 last:border-b-0 hover:bg-sc-gray-50 transition-colors">
                          {/* Name */}
                          <td className="px-3 py-2 min-w-[160px] max-w-[200px]">
                            <div className="font-medium text-[11px] text-sc-blue truncate" title={r.name}>{r.name}</div>
                            {r.brand && <div className="text-[9px] text-muted">{r.brand}</div>}
                          </td>
                          {/* Stage */}
                          <td className="px-3 py-2 whitespace-nowrap">
                            {r.stage
                              ? <Pill tone="neutral" className="text-[9px]">{r.stage}</Pill>
                              : <span className="text-muted text-[10px]">—</span>}
                          </td>
                          {/* Spend */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(r.spend)}</td>
                          {/* Rev pre-RTO */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(revPre)}</td>
                          {/* ROAS pre */}
                          <td className="px-3 py-2 text-right">
                            <Pill tone={roasTone(roasPre)} className="text-[10px] tnum">
                              {roasPre != null ? roasPre.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          {/* Rev post-RTO */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(revPost)}</td>
                          {/* ROAS post */}
                          <td className="px-3 py-2 text-right">
                            <Pill tone={roasTone(roasPost)} className="text-[10px] tnum">
                              {roasPost != null ? roasPost.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          {/* Rev Meta */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(r.meta_rev)}</td>
                          {/* ROAS Meta */}
                          <td className="px-3 py-2 text-right">
                            <Pill tone={roasTone(r.meta_roas)} className="text-[10px] tnum">
                              {r.meta_roas != null ? r.meta_roas.toFixed(2) + "×" : "—"}
                            </Pill>
                          </td>
                          {/* AOV */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(r.aov)}</td>
                          {/* Disc % */}
                          <td className="px-3 py-2 text-right">
                            <Pill tone={discTone(r.disc_pct)} className="text-[10px] tnum">
                              {r.disc_pct != null ? (r.disc_pct * 100).toFixed(1) + "%" : "—"}
                            </Pill>
                          </td>
                          {/* Prepaid % */}
                          <td className="px-3 py-2 text-right">
                            <Pill tone={prepaidTone(r.prepaid_pct)} className="text-[10px] tnum">
                              {r.prepaid_pct != null ? (r.prepaid_pct * 100).toFixed(1) + "%" : "—"}
                            </Pill>
                          </td>
                          {/* RTO % */}
                          <td className="px-3 py-2 text-right">
                            <Pill tone={rtoTone(r.rto_pct)} className="text-[10px] tnum">
                              {r.rto_pct != null ? (r.rto_pct * 100).toFixed(1) + "%" : "—"}
                            </Pill>
                          </td>
                          {/* CAC */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(r.cac)}</td>
                          {/* LTV 30D */}
                          <td className="px-3 py-2 text-right tnum text-xs">{fmt.inr(r.ltv_30d_per_customer)}</td>
                          {/* CM2 % */}
                          <td className="px-3 py-2 text-right">
                            {(() => {
                              const v = r.cm2_pct;
                              return (
                                <span className={cn("text-[11px] font-semibold tnum",
                                  v == null ? "text-muted" : v >= 0 ? "text-success" : "text-danger")}>
                                  {v != null ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1) + "%" : "—"}
                                </span>
                              );
                            })()}
                          </td>
                          {/* Fatigue */}
                          <td className="px-3 py-2 text-right">
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
                  </tbody>
                </table>
              </div>
              <div className="mt-1.5 text-[10px] text-muted px-1 flex justify-between">
                <span>
                  <strong className="text-text">CM2 %</strong> = (Post-RTO rev − COGS − Logistics − Spend) ÷ Post-RTO rev ·
                  <strong className="text-text"> Fatigue</strong> = days-live + frequency + CTR decay + CPM rise (0–100; &gt;70 = pause)
                </span>
                <span className="text-muted">{visibleRows.length} rows</span>
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
  const [pivotBy, setPivot]   = useState("brand");
  const [source,  setSource]  = useState("shopify");
  const [rows,    setRows]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [init,    setInit]    = useState(true);

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

  const columns = useMemo(() => {
    const showBrand    = ["brand", "brand_creative", "full"].includes(pivotBy);
    const showCreative = ["creative_type", "brand_creative", "full"].includes(pivotBy);
    const showLang     = ["language", "full"].includes(pivotBy);
    const base = [
      showBrand    && { key: "brand",         label: "Brand",    render: (r) => <span className="font-semibold text-xs">{r.brand || "—"}</span> },
      showCreative && { key: "creative_type", label: "Creative", render: (r) => <Pill tone="purple" className="text-[10px]">{r.creative_type || "—"}</Pill> },
      showLang     && { key: "language",      label: "Language", render: (r) => <Pill tone="blue"   className="text-[10px]">{r.language || "—"}</Pill> },
      { key: "spend",    label: "Spend",        align: "right", render: (r) => <span className="tnum text-xs">{fmt.inr(r.spend)}</span> },
      { key: "rev_pre",  label: "Rev (pre)",    align: "right", render: (r) => <span className="tnum text-xs">{fmt.inr(getRevPre(r))}</span> },
      { key: "roas_pre", label: "ROAS (pre)",   align: "right", render: (r) => { const v = getRoasPre(r); return <Pill tone={roasTone(v)} className="text-[10px] tnum">{v != null ? v.toFixed(2)+"×" : "—"}</Pill>; } },
      { key: "roas_post",label: "ROAS (post)",  align: "right", render: (r) => { const v = getRoasPost(r); return <Pill tone={roasTone(v)} className="text-[10px] tnum">{v != null ? v.toFixed(2)+"×" : "—"}</Pill>; } },
      { key: "meta_rev", label: "Rev (Meta)",   align: "right", render: (r) => <span className="tnum text-xs">{fmt.inr(r.meta_rev)}</span> },
      { key: "meta_roas",label: "ROAS (Meta)",  align: "right", render: (r) => { const v = r.meta_roas ?? null; return <Pill tone={roasTone(v)} className="text-[10px] tnum">{v != null ? v.toFixed(2)+"×" : "—"}</Pill>; } },
      { key: "aov",      label: "AOV",          align: "right", render: (r) => <span className="tnum text-xs">{fmt.inr(r.aov)}</span> },
      { key: "disc_pct", label: "Disc %",       align: "right", render: (r) => <Pill tone={discTone(r.disc_pct)}   className="text-[10px] tnum">{r.disc_pct   != null ? (r.disc_pct   * 100).toFixed(1)+"%" : "—"}</Pill> },
      { key: "prepaid_pct",label:"Prepaid %",   align: "right", render: (r) => <Pill tone={prepaidTone(r.prepaid_pct)} className="text-[10px] tnum">{r.prepaid_pct != null ? (r.prepaid_pct * 100).toFixed(1)+"%" : "—"}</Pill> },
      { key: "rto_amount",label: "RTO (₹)",      align: "right", render: (r) => <span className="tnum text-xs text-danger">{fmt.inr(r.rto_amount)}</span> },
      { key: "rto_pct",  label: "RTO %",        align: "right", render: (r) => <Pill tone={rtoTone(r.rto_pct)}     className="text-[10px] tnum">{r.rto_pct     != null ? (r.rto_pct     * 100).toFixed(1)+"%" : "—"}</Pill> },
      { key: "cac",      label: "CAC",           align: "right", render: (r) => <span className="tnum text-xs">{fmt.inr(r.cac)}</span> },
      { key: "ltv_30d",  label: "LTV 30d",      align: "right", render: (r) => <span className="tnum text-xs">{fmt.inr(r.ltv_30d_per_customer)}</span> },
      { key: "cm2_pct",  label: "CM2 %",        align: "right", render: (r) => { const v = r.cm2_pct; return <span className={cn("text-[11px] font-semibold tnum", v == null ? "text-muted" : v >= 0 ? "text-success" : "text-danger")}>{v != null ? (v >= 0 ? "+" : "") + (v * 100).toFixed(1)+"%" : "—"}</span>; } },
    ].filter(Boolean);
    return base;
  }, [pivotBy, source]);

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
              <DataTable columns={columns} rows={rows}
                getRowKey={(r) => `${r.brand}_${r.creative_type}_${r.language}`}
                maxHeight={300} />
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
// 7. ACTION LIST (rules-driven, computed from overview data)
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
    aiSummary, aiDate, aiLoading,
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
            <AIFlash title="AI daily flash · Meta Ads" summary={aiSummary} date={aiDate} loading={aiLoading} />

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

            {/* 7. Action list */}
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
