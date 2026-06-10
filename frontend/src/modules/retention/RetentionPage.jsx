import { useState, useMemo, useRef, useEffect } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from "recharts";
import { Card, CardHeader, CardBody, CardTitle } from "@/shared/ui/Card";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { AIFlash } from "@/shared/components/AIFlash";
import { KpiCard } from "@/shared/components/KpiCard";
import { cn, fmt } from "@/lib/utils";
import { api } from "@/lib/api";
import { useAiSummary } from "@/shared/hooks/useAiSummary";
import {
  useRetentionOverview, useRetentionOverviewCompare,
  useRetentionTrend, useLtvCac, useBrandMix, useBrandOverlap,
  useProductTable, useFoSoGap, useCrossSell, useAffinityMatrix, useReturnRate,
  useChannelQuality, useDiscountRepeat, usePaymentSplit, useCityTier, useAovByOrder,
  useContributionMargin,
} from "@/modules/retention/useRetention";

// ─── Colour palette matching HTML prototype ───────────────────────────────────
const C = {
  purple: "#534AB7", purpleLt: "#EEEDFE",
  green:  "#3B6D11", greenLt:  "#EAF3DE", greenMid: "#97C459",
  teal:   "#0F6E56", tealLt:   "#E1F5EE",
  red:    "#A32D2D", redLt:    "#FCEBEB", redMid:   "#F09595",
  amber:  "#854F0B", amberLt:  "#FAEEDA", amberMid: "#EF9F27",
  blue:   "#185FA5", blueLt:   "#E6F1FB", blueMid:  "#85B7EB",
  gray:   "#888780",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const p = (v, dp = 1) => (v == null ? "—" : `${Number(v).toFixed(dp)}%`);
const inr = (v) => (v == null ? "—" : fmt.inr(v));
const num = (v) => (v == null ? "—" : fmt.num(v));
const retColor = (v) => v >= 8 ? C.green : v >= 2 ? C.amber : C.red;
const retBg    = (v) => v >= 8 ? C.greenLt : v >= 2 ? C.amberLt : C.redLt;

function Pill({ children, color = C.gray, bg, className }) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold", className)}
      style={{ background: bg || `${color}22`, color }}>
      {children}
    </span>
  );
}
function PillBtn({ active, onClick, children, className }) {
  return (
    <button onClick={onClick}
      className={cn("px-3 py-1 rounded-full text-[10px] font-medium border transition-all",
        active ? "bg-[#534AB7] text-white border-[#534AB7]" : "bg-white text-[#5F5E5A] border-[#D3D1C7] hover:bg-[#F1EFE8]",
        className)}>
      {children}
    </button>
  );
}
function Skel({ h = "h-5", w = "w-full" }) {
  return <div className={cn("rounded animate-pulse bg-gray-200", h, w)} />;
}
function EmptyState({ msg = "No data for this period." }) {
  return <div className="text-sm text-center text-gray-400 py-8">{msg}</div>;
}
function ChartCard({ title, children, legend, className }) {
  return (
    <Card className={cn("p-0 overflow-hidden", className)}>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        {legend && <div className="ml-auto flex gap-3 flex-wrap">{legend}</div>}
      </div>
      <div className="p-4">{children}</div>
    </Card>
  );
}
function LegendDot({ color, label }) {
  return (
    <span className="flex items-center gap-1 text-[10px] text-gray-500">
      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: "overview",    label: "Overview",            color: C.purple },
  { key: "trend",       label: "Retention trend",     color: C.teal },
  { key: "product",     label: "Product",             color: C.blue },
  { key: "acquisition", label: "Acquisition quality", color: C.amber },
  { key: "econ",        label: "Unit economics",      color: C.red },
];

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1 — OVERVIEW
// ═════════════════════════════════════════════════════════════════════════════
const WINDOWS = ["7d","14d","30d","60d","90d","120d","180d","360d"];
const WIN_COLOR = w => ["7d","14d"].includes(w) ? "blue" : ["30d","60d","90d"].includes(w) ? "green" : w === "360d" ? "red" : "amber";

function OverviewTab({ startDate, endDate, hasComparison, overviewData, overviewLoading, prevKm: prevKmProp }) {
  // Use pre-fetched data from the page level when available; fall back to local fetch
  const localFetch = useRetentionOverview({ startDate, endDate });
  const data    = overviewData    ?? localFetch.data;
  const loading = overviewLoading ?? localFetch.loading;
  const km      = data?.key_metrics    || {};
  const prevKm  = prevKmProp           || {};
  const wins    = data?.windows        || {};
  const comp    = data?.composition    || {};
  const hm      = data?.cohort_heatmap || [];

  // Compute deltas (current - previous) only when comparison is active
  const delta = (curr, prev, invert = false) => {
    if (!hasComparison || curr == null || prev == null || prev === 0) return null;
    return invert ? (prev - curr) / prev : (curr - prev) / prev;
  };

  // Pivot heatmap rows into a 2D structure
  const hmPivot = useMemo(() => {
    const cohorts = [...new Set(hm.map(r => r.cohort_month))].sort();
    const months  = [0,1,2,3,4,5,6,7,8];
    return cohorts.map(c => ({
      cohort: c,
      cells: months.map(m => hm.find(r => r.cohort_month === c && r.month_n === m)),
    }));
  }, [hm]);

  const heatColor = (v, m) => {
    if (m === 0) return C.purple;
    if (v == null) return "#F8F7F3";
    if (v >= 10) return C.purple;
    if (v >= 7)  return "#9FE1CB";
    if (v >= 4)  return C.greenLt;
    if (v >= 2)  return C.amberLt;
    return C.redLt;
  };
  const heatText = (v, m) => {
    if (m === 0) return "#fff";
    if (v == null) return "#D3D1C7";
    if (v >= 10) return "#fff";
    return "#2C2C2A";
  };

  return (
    <LoadingOverlay loading={loading} label="Loading retention data…">
    <div className="space-y-5">
      {/* KPI Cards */}
      <div>
        <SectionHeader title="Key metrics" subtitle="Rolling · all cohorts" tone="purple" className="mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading && !data
            ? Array(6).fill(0).map((_, i) => <Card key={i} className="p-4"><Skel h="h-14" /></Card>)
            : <>
              <KpiCard label="30d repeat rate"
                value={p(km.repeat_rate_30d)}
                delta={delta(km.repeat_rate_30d, prevKm.repeat_rate_30d)}
              />
              <KpiCard label="Realized LTV (90d)"
                value={inr(km.realized_ltv_90d)}
                delta={delta(km.realized_ltv_90d, prevKm.realized_ltv_90d)}
              />
              <KpiCard label="Avg order value"
                value={inr(km.avg_order_value)}
                delta={delta(km.avg_order_value, prevKm.avg_order_value)}
              />
              <KpiCard label="Avg order frequency"
                value={km.avg_order_frequency ? `${Number(km.avg_order_frequency).toFixed(2)}` : "—"}
                delta={delta(km.avg_order_frequency, prevKm.avg_order_frequency)}
              />
              <KpiCard label="CAC payback"
                value={km.cac_payback_days ? `${Math.round(km.cac_payback_days)}d` : "—"}
                delta={delta(km.cac_payback_days, prevKm.cac_payback_days)}
                positiveIsBad
              />
              <KpiCard label="Loyal (3+ orders)"
                value={km.loyal_customers && km.ntb_customers
                  ? p((km.loyal_customers / km.ntb_customers) * 100, 1)
                  : "—"}
                delta={(() => {
                  const currRate = km.loyal_customers && km.ntb_customers
                    ? km.loyal_customers / km.ntb_customers : null;
                  const prevRate = prevKm.loyal_customers && prevKm.ntb_customers
                    ? prevKm.loyal_customers / prevKm.ntb_customers : null;
                  return delta(currRate, prevRate);
                })()}
                tip={`${num(km.loyal_customers)} of ${num(km.ntb_customers)}`}
              />
            </>
          }
        </div>
      </div>

      {/* Retention windows */}
      <div>
        <SectionHeader title="Order frequency & retention by window" subtitle="Cumulative · rolling" tone="blue" className="mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {WINDOWS.map(w => {
            const freq = wins[`freq_${w}`];
            const rate = wins[`rate_${w}`];
            const maxRate = 20;
            const barW = Math.min(100, ((rate || 0) / maxRate) * 100);
            const tone = WIN_COLOR(w);
            const colors = { blue: [C.blueLt, "#B5D4F4", C.blue], green: [C.greenLt, "#C0DD97", C.green],
              amber: [C.amberLt, "#FAC775", C.amber], red: [C.redLt, "#F7C1C1", C.red] };
            const [bg, border, fg] = colors[tone];
            return (
              <div key={w} className="rounded-md p-3 border text-center" style={{ background: bg, borderColor: border }}>
                <div className="text-[9px] font-bold mb-1" style={{ color: fg }}>{w.toUpperCase()}</div>
                <div className="text-base font-semibold font-mono" style={{ color: fg }}>
                  {loading ? "—" : freq ? `${freq}×` : "—"}
                </div>
                <div className="h-1.5 rounded mt-2 mb-1 overflow-hidden" style={{ background: `${fg}22` }}>
                  <div className="h-full rounded transition-all" style={{ width: `${barW}%`, background: fg }} />
                </div>
                <div className="text-[9px] font-medium" style={{ color: fg }}>
                  {loading ? "—" : rate ? `${rate}% ret.` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Customer composition */}
      <div>
        <SectionHeader
          title="Customer composition · order count · recency · LTV bucket"
          subtitle={comp.total_customers ? `Total: ${num(comp.total_customers)} customers` : ""}
          tone="green" className="mb-3"
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Order count */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold tracking-wide" style={{ color: C.purple }}>ORDER COUNT</span>
              <Pill color={C.purple}>{num(comp.total_customers)}</Pill>
            </div>
            {loading ? <Skel h="h-28" /> : [
              { label: "1 order · new/one-time", count: comp.oc_1, color: C.purple },
              { label: "2 orders · returning",   count: comp.oc_2, color: C.green },
              { label: "3 orders · engaged",     count: comp.oc_3, color: C.amber },
              { label: "3+ orders · loyal",      count: comp.oc_3plus, color: C.red },
            ].map(({ label, count, color }) => {
              const pct = comp.total_customers ? ((count || 0) / comp.total_customers) * 100 : 0;
              return (
                <div key={label} className="mb-2">
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span style={{ color }}>{label}</span>
                    <span className="font-mono font-semibold">{num(count)} <span className="text-gray-400 font-normal">· {p(pct)}</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </Card>

          {/* Recency */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold tracking-wide" style={{ color: C.teal }}>RECENCY · LAST PURCHASE</span>
              <Pill color={C.teal}>{num(comp.total_customers)}</Pill>
            </div>
            {loading ? <Skel h="h-28" /> : [
              { label: "Active · ≤90d",       count: comp.rec_active,  color: C.teal },
              { label: "Warm · 91–180d",       count: comp.rec_warm,    color: C.green },
              { label: "At-risk · 181–360d",   count: comp.rec_at_risk, color: C.amber },
              { label: "Lapsed · 360+d",       count: comp.rec_lapsed,  color: C.red },
            ].map(({ label, count, color }) => {
              const pct = comp.total_customers ? ((count || 0) / comp.total_customers) * 100 : 0;
              return (
                <div key={label} className="mb-2">
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span style={{ color }}>{label}</span>
                    <span className="font-mono font-semibold">{num(count)} <span className="text-gray-400 font-normal">· {p(pct)}</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </Card>

          {/* LTV bucket */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold tracking-wide" style={{ color: C.blue }}>LTV BUCKET</span>
              <Pill color={C.blue}>avg {inr(comp.avg_lifetime_value)}</Pill>
            </div>
            {loading ? <Skel h="h-28" /> : [
              { label: "< ₹500",          count: comp.ltv_lt500,    color: "#B5D4F4" },
              { label: "₹500 – 700",      count: comp.ltv_500_700,  color: "#378ADD" },
              { label: "₹700 – 1,000",    count: comp.ltv_700_1000, color: C.teal },
              { label: "₹1,000 – 1,500",  count: comp.ltv_1000_1500,color: C.green },
              { label: "₹1,500+",         count: comp.ltv_1500plus, color: "#2C2C2A" },
            ].map(({ label, count, color }) => {
              const pct = comp.total_customers ? ((count || 0) / comp.total_customers) * 100 : 0;
              return (
                <div key={label} className="mb-2">
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-gray-700">{label}</span>
                    <span className="font-mono font-semibold">{num(count)} <span className="text-gray-400 font-normal">· {p(pct)}</span></span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded overflow-hidden">
                    <div className="h-full rounded transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>

      {/* Cohort heatmap */}
      <div>
        <SectionHeader title="Cohort retention heatmap (triangle)" subtitle="Rows = acquisition month · Columns = months since acquisition" tone="purple" className="mb-3" />
        <Card className="p-4 overflow-x-auto">
          {loading ? <Skel h="h-48" /> : hmPivot.length === 0 ? <EmptyState /> : (
            <table className="border-collapse text-[11px] min-w-[700px]">
              <thead>
                <tr>
                  <th className="px-3 py-1.5 bg-gray-100 text-left font-semibold text-gray-600 text-[10px]">Cohort</th>
                  {[0,1,2,3,4,5,6,7,8].map(m => (
                    <th key={m} className="px-3 py-1.5 bg-gray-100 text-center font-semibold text-gray-600 text-[10px]">M{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hmPivot.map(({ cohort, cells }) => (
                  <tr key={cohort}>
                    <td className="px-3 py-1.5 font-medium whitespace-nowrap border-b border-gray-50">{cohort}</td>
                    {cells.map((cell, m) => {
                      const val = cell?.retention_pct;
                      return (
                        <td key={m} className="px-2 py-1 text-center border border-white rounded"
                          style={{ background: heatColor(val, m) }}>
                          <span className="text-[10px] font-semibold" style={{ color: heatText(val, m) }}>
                            {m === 0 ? "100%" : val == null ? "–" : `${val}%`}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
    </LoadingOverlay>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2 — RETENTION TREND
// ═════════════════════════════════════════════════════════════════════════════
const SEGMENTS = ["brand","product","channel","discount","payment","platform"];
const TREND_WINDOWS = ["7d","30d","60d","180d","360d"];
// Cohort time-bucket granularity for the trend X-axis (decoupled from the
// retention measurement window above). Mirrors the supply-chain convention.
const GRANULARITIES = ["DoD","WoW","MoM","YoY"];
const SEG_LABELS = { brand:"Brand", product:"Product", channel:"Acq source", discount:"Discount", payment:"Payment", platform:"Platform" };
const BRAND_COLORS = { "Bare Anatomy": C.purple, "Chemist at Play": C.green, "Sunscoop": C.blue };
const BRANDS_LIST  = ["Bare Anatomy","Chemist at Play","Sunscoop"];

// ── Venn SVG component — mirrors the HTML prototype exactly ──────────────────
function VennDiagram({ row }) {
  if (!row) return null;
  const { total, ba_only, cap_only, ss_only, ba_cap, cap_ss, ba_ss, all_three, order_count_segment } = row;
  const pct = (n) => total ? `${((n / total) * 100).toFixed(1)}%` : "0%";
  const f   = (n) => n == null ? "0" : Number(n).toLocaleString("en-IN");

  const accentMap = { "1_order": C.purple, "2_orders": C.green, "3_orders": C.amber, "3+_orders": C.red };
  const labelMap  = { "1_order": "Order count = 1", "2_orders": "Order count = 2", "3_orders": "Order count = 3", "3+_orders": "OC 3+ (loyal)" };
  const accent = accentMap[order_count_segment] || C.gray;

  return (
    <div className="border border-gray-200 rounded-xl bg-white p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl" style={{ background: accent }} />
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-semibold text-gray-700">{labelMap[order_count_segment] || order_count_segment}</span>
        <span className="ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${accent}22`, color: accent }}>
          {f(total)} customers
        </span>
      </div>
      <svg width="100%" viewBox="0 0 340 310" style={{ maxWidth: 320 }}>
        {/* Circles */}
        <circle cx="120" cy="175" r="80" fill={C.purple} opacity=".14" />
        <circle cx="120" cy="175" r="80" fill="none" stroke={C.purple} strokeWidth="1.5" opacity=".55" />
        <circle cx="220" cy="175" r="80" fill={C.green} opacity=".14" />
        <circle cx="220" cy="175" r="80" fill="none" stroke={C.green} strokeWidth="1.5" opacity=".55" />
        <circle cx="170" cy="105" r="80" fill={C.blue} opacity=".14" />
        <circle cx="170" cy="105" r="80" fill="none" stroke={C.blue} strokeWidth="1.5" opacity=".55" />
        {/* BA only */}
        <text x="38" y="182" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fontWeight="600" fill="#3C3489">BA only</text>
        <text x="38" y="196" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="12" fontWeight="600" fill="#3C3489">{f(ba_only)}</text>
        <text x="38" y="208" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fill="#5F5E5A">{pct(ba_only)}</text>
        <line x1="65" y1="196" x2="88" y2="196" stroke="#3C3489" strokeWidth="0.8" strokeDasharray="3 2" opacity=".5" />
        {/* CAP only */}
        <text x="302" y="182" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fontWeight="600" fill="#27500A">CAP only</text>
        <text x="302" y="196" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="12" fontWeight="600" fill="#27500A">{f(cap_only)}</text>
        <text x="302" y="208" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fill="#5F5E5A">{pct(cap_only)}</text>
        <line x1="275" y1="196" x2="252" y2="196" stroke="#27500A" strokeWidth="0.8" strokeDasharray="3 2" opacity=".5" />
        {/* SS only */}
        <text x="170" y="16" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fontWeight="600" fill="#0C447C">SS only</text>
        <text x="170" y="30" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="12" fontWeight="600" fill="#0C447C">{f(ss_only)}</text>
        <text x="170" y="42" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="9" fill="#5F5E5A">{pct(ss_only)}</text>
        <line x1="170" y1="48" x2="170" y2="60" stroke="#0C447C" strokeWidth="0.8" strokeDasharray="3 2" opacity=".5" />
        {/* BA∩CAP */}
        <text x="170" y="220" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8.5" fontWeight="600" fill="#2C2C2A">BA∩CAP</text>
        <text x="170" y="234" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="11" fontWeight="600" fill="#2C2C2A">{f(ba_cap)}</text>
        <text x="170" y="245" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8.5" fill="#5F5E5A">{pct(ba_cap)}</text>
        {/* BA∩SS */}
        <text x="118" y="120" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8" fontWeight="600" fill="#2C2C2A">BA∩SS</text>
        <text x="118" y="132" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="11" fontWeight="600" fill="#2C2C2A">{f(ba_ss)}</text>
        <text x="118" y="143" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8" fill="#5F5E5A">{pct(ba_ss)}</text>
        {/* CAP∩SS */}
        <text x="222" y="120" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8" fontWeight="600" fill="#2C2C2A">CAP∩SS</text>
        <text x="222" y="132" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="11" fontWeight="600" fill="#2C2C2A">{f(cap_ss)}</text>
        <text x="222" y="143" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8" fill="#5F5E5A">{pct(cap_ss)}</text>
        {/* All 3 */}
        <text x="170" y="166" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8" fontWeight="600" fill="#444441">All 3</text>
        <text x="170" y="179" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="11" fontWeight="600" fill="#444441">{f(all_three)}</text>
        <text x="170" y="190" textAnchor="middle" fontFamily="DM Sans,sans-serif" fontSize="8" fill="#5F5E5A">{pct(all_three)}</text>
      </svg>
    </div>
  );
}

// Format a cohort bucket date for the X-axis, adapting the label to the
// selected granularity: YoY → "2026", MoM → "Jan '26", DoD/WoW → "6 Jan '26".
function fmtBucket(dateStr, gran = "WoW") {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const yy = String(d.getFullYear()).slice(2);
  if (gran === "YoY") return String(d.getFullYear());
  if (gran === "MoM") return `${MONTHS[d.getMonth()]} '${yy}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} '${yy}`;
}

const METRIC_OPTS = [
  { key: "retention_rate", label: "Repeat rate", unit: "pct", yAxis: "y" },
  { key: "ltv",            label: "LTV (₹)",     unit: "inr", yAxis: "y2" },
  { key: "aov",            label: "AOV (₹)",      unit: "inr", yAxis: "y2" },
  { key: "avg_freq",       label: "Order freq",   unit: "num", yAxis: "y" },
];
const METRIC_DASH = { retention_rate: [], ltv: [5, 3], aov: [3, 3], avg_freq: [8, 2] };
const LINE_COLORS_TREND = ["#534AB7","#3B6D11","#185FA5","#0F6E56","#854F0B","#A32D2D"];
const SEG_BRAND_SUBS = ["All","Bare Anatomy","Chemist at Play","Sunscoop"];

function fmtMetric(v, unit) {
  if (v == null) return "—";
  if (unit === "inr")  return `₹${Math.round(v)}`;
  if (unit === "pct")  return `${Number(v).toFixed(2)}%`;
  return Number(v).toFixed(2);
}

// ─── Multi-select metrics dropdown ────────────────────────────────────────────
function MetricsDropdown({ activeMetrics, onToggle, onAll, onClear }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const label = activeMetrics.size === 0        ? "Select metrics…"
    : activeMetrics.size === METRIC_OPTS.length  ? "All metrics"
    : [...activeMetrics].map(k => METRIC_OPTS.find(m => m.key === k)?.label ?? k).join(", ");

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-medium transition-colors",
          open ? "border-[#534AB7] bg-[#EEEDFE] text-[#534AB7]" : "border-gray-200 bg-white text-gray-600 hover:border-[#534AB7]"
        )}
        style={{ minWidth: 160, maxWidth: 260 }}
      >
        <span className="truncate flex-1 text-left">{label}</span>
        <svg className={cn("w-3 h-3 flex-shrink-0 transition-transform", open && "rotate-180")} viewBox="0 0 12 12" fill="none">
          <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-52 py-1">
          {METRIC_OPTS.map(m => (
            <label key={m.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-[#EEEDFE] cursor-pointer">
              <input
                type="checkbox"
                checked={activeMetrics.has(m.key)}
                onChange={() => onToggle(m.key)}
                className="w-3.5 h-3.5 rounded accent-[#534AB7]"
              />
              <span className="text-[11px] text-gray-700">{m.label}</span>
            </label>
          ))}
          <div className="border-t border-gray-100 mt-1 px-3 py-1.5 flex gap-3">
            <button onClick={onAll}   className="text-[10px] text-[#534AB7] font-medium hover:underline">Select all</button>
            <button onClick={onClear} className="text-[10px] text-gray-400 font-medium hover:underline">Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single-select searchable segment dropdown ─────────────────────────────────
function SegmentValueDropdown({ segmentLabel, options, value, onChange, loading = false }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Reset search when dropdown closes
  useEffect(() => { if (!open) setSearch(""); }, [open]);

  const filtered = options.filter(o =>
    !search || o.toLowerCase().includes(search.toLowerCase())
  );

  const label = loading
    ? `Loading ${segmentLabel}s…`
    : value === null ? `All ${segmentLabel}s` : value;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => !loading && setOpen(o => !o)}
        disabled={loading}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-medium transition-colors",
          loading
            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-wait"
            : value !== null
              ? "border-[#534AB7] bg-[#EEEDFE] text-[#534AB7]"
              : "border-gray-200 bg-white text-gray-600 hover:border-[#534AB7]"
        )}
        style={{ minWidth: 160, maxWidth: 260 }}
      >
        {loading && (
          <span className="w-3 h-3 border-2 border-gray-300 border-t-[#534AB7] rounded-full animate-spin flex-shrink-0" />
        )}
        <span className="truncate flex-1 text-left">{label}</span>
        {!loading && value !== null && (
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); onChange(null); }}
            className="text-[#534AB7] opacity-60 hover:opacity-100 font-bold leading-none px-0.5 cursor-pointer"
          >×</span>
        )}
        {!loading && (
          <svg className={cn("w-3 h-3 flex-shrink-0 transition-transform", open && "rotate-180")} viewBox="0 0 12 12" fill="none">
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>

      {open && !loading && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-64">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={`Search ${segmentLabel}…`}
              className="w-full px-2 py-1.5 text-[11px] border border-gray-200 rounded outline-none focus:border-[#534AB7] bg-[#F8F7F3]"
            />
          </div>
          <div className="max-h-60 overflow-y-auto">
            {/* "All" option */}
            <button
              onClick={() => { onChange(null); setOpen(false); }}
              className={cn(
                "w-full text-left px-3 py-2 text-[11px] transition-colors",
                value === null ? "font-semibold text-[#534AB7] bg-[#EEEDFE]" : "text-gray-700 hover:bg-[#EEEDFE]"
              )}
            >
              All {segmentLabel}s <span className="text-[9px] text-gray-400 ml-1">(overlay top 5)</span>
            </button>
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-[11px] text-gray-400 text-center">No results for "{search}"</div>
            ) : filtered.map(opt => (
              <button
                key={opt}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={cn(
                  "w-full text-left px-3 py-2 text-[11px] transition-colors",
                  value === opt ? "font-semibold text-[#534AB7] bg-[#EEEDFE]" : "text-gray-700 hover:bg-[#EEEDFE]"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
          <div className="border-t border-gray-100 px-3 py-1.5 text-[9px] text-gray-400">
            {options.length} option{options.length !== 1 ? "s" : ""} · select one to isolate
          </div>
        </div>
      )}
    </div>
  );
}

function RetentionTrendTab({ startDate, endDate }) {
  const [segment,      setSegment]    = useState("brand");
  const [gran,         setGran]       = useState("30d");  // retention measurement window (7d/30d/…); not the global `window`
  const [granularity,  setGranularity]= useState("WoW");  // cohort time-bucket grain for the X-axis
  const [segFilter,    setSegFilter]  = useState(null);   // null = all, string = isolated segment
  const [brandView,    setBrandView]  = useState("Overall");
  const [activeMetrics, setActiveMetrics] = useState(new Set(["retention_rate", "ltv"]));

  const handleMetricToggle = (key) => {
    setActiveMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) { if (next.size > 1) next.delete(key); }
      else next.add(key);
      return next;
    });
  };
  const handleMetricAll   = () => setActiveMetrics(new Set(METRIC_OPTS.map(m => m.key)));
  const handleMetricClear = () => setActiveMetrics(new Set(["retention_rate"]));

  // Use `gran` (not `window`) — the global `window` was being shadowed, breaking the filter
  const { data: trendData, loading: trendLoading } = useRetentionTrend({ startDate, endDate, segment, window: gran, granularity });
  const { data: ltvCacData, loading: ltvLoading }  = useLtvCac({ startDate, endDate });
  const { data: mixData,    loading: mixLoading }   = useBrandMix({ startDate, endDate });
  const { data: vennData,   loading: vennLoading }  = useBrandOverlap({ startDate, endDate });

  // All unique segment values from data — no limit, fully dynamic
  const allSegVals = useMemo(() =>
    [...new Set((trendData || []).map(r => r.segment_value))].filter(Boolean),
    [trendData]
  );

  // null = overlay top 5, string = isolate that one segment
  const visibleSegs = useMemo(() =>
    segFilter === null ? allSegVals.slice(0, 5) : allSegVals.filter(s => s === segFilter),
    [allSegVals, segFilter]
  );

  // Buckets are pre-aggregated server-side at the selected granularity
  // (DoD/WoW/MoM/YoY) — render one chart row per bucket, no client merging.
  const trendChartData = useMemo(() => {
    if (!trendData?.length) return [];
    const buckets = [...new Set(trendData.map(r => r.week_start))].sort();
    return buckets.map(b => {
      const row = { week: fmtBucket(b, granularity) };
      visibleSegs.forEach(s => {
        [...activeMetrics].forEach(mk => {
          const rec = trendData.find(r => r.week_start === b && r.segment_value === s);
          row[`${s}__${mk}`] = rec?.[mk] ?? null;
        });
      });
      return row;
    });
  }, [trendData, visibleSegs, activeMetrics, granularity]);

  // Build series descriptors: { dataKey, segVal, metric, color, dash, yAxis, label }
  const seriesList = useMemo(() => {
    // Shorten long segment labels for legend: "Bare Anatomy" → "Bare", "facebookads" → "Facebook"
    const shortName = s => s?.split(" ")[0] ?? s;
    return visibleSegs.flatMap((s, si) =>
      METRIC_OPTS
        .filter(m => activeMetrics.has(m.key))
        .map(m => ({
          dataKey: `${s}__${m.key}`,
          label:   `${shortName(s)}·${m.label}`,
          color:   BRAND_COLORS[s] || LINE_COLORS_TREND[si % LINE_COLORS_TREND.length],
          dash:    METRIC_DASH[m.key],
          yAxis:   m.yAxis,
          unit:    m.unit,
        }))
    );
  }, [visibleSegs, activeMetrics]);

  // When segment type changes, reset the sub-filter to null (= all)
  const handleSegmentChange = (s) => { setSegment(s); setSegFilter(null); };

  const hasY2 = seriesList.some(s => s.yAxis === "y2");
  const lineColors = ["#534AB7","#3B6D11","#185FA5","#0F6E56","#854F0B","#A32D2D"];

  // ── Image 8: Brand mix — aggregate by buyer_type for Overall, or by brand for specific
  const mixChartData = useMemo(() => {
    if (!mixData?.length) return [];
    const months = [...new Set(mixData.map(r => r.order_month))].sort();

    if (brandView === "Overall") {
      // Sum NTB/existing/cross across all brands per month
      return months.map(m => {
        const rows = mixData.filter(r => r.order_month === m);
        return {
          month: m,
          "New to brand (NTB)": rows.filter(r => r.buyer_type === "NTB").reduce((s, r) => s + (r.customer_count || 0), 0),
          "Existing same-brand": rows.filter(r => r.buyer_type === "existing").reduce((s, r) => s + (r.customer_count || 0), 0),
          "Cross-brand inflow":  rows.filter(r => r.buyer_type === "cross").reduce((s, r) => s + (r.customer_count || 0), 0),
        };
      });
    } else {
      // Filter to selected brand; split cross by prev_brand
      return months.map(m => {
        const rows = mixData.filter(r => r.order_month === m && r.brand === brandView);
        const row  = { month: m };
        const shortName = brandView === "Bare Anatomy" ? "BA" : brandView === "Chemist at Play" ? "CAP" : "SS";
        rows.forEach(r => {
          if (r.buyer_type === "NTB")      row[`New to ${shortName}`] = (row[`New to ${shortName}`] || 0) + (r.customer_count || 0);
          else if (r.buyer_type === "existing") row[`Existing ${shortName}`] = (row[`Existing ${shortName}`] || 0) + (r.customer_count || 0);
          else if (r.prev_brand)            row[`From ${r.prev_brand?.slice(0,3)}`] = (row[`From ${r.prev_brand?.slice(0,3)}`] || 0) + (r.customer_count || 0);
        });
        return row;
      });
    }
  }, [mixData, brandView]);

  const mixSeriesKeys = useMemo(() => {
    if (!mixChartData.length) return [];
    return Object.keys(mixChartData[0] || {}).filter(k => k !== "month");
  }, [mixChartData]);

  const MIX_COLORS = {
    "New to brand (NTB)":  C.purple,
    "Existing same-brand": C.greenMid,
    "Cross-brand inflow":  C.gray,
  };
  const getMixColor = (key, i) => MIX_COLORS[key] || lineColors[i % lineColors.length];

  return (
    <LoadingOverlay loading={trendLoading} label="Refreshing…">
    <div className="space-y-5">
      {/* ── Image 6: Retention trend chart ── */}
      <div>
        <SectionHeader title="Retention trend chart" subtitle="Cohort-based · rolling window" tone="purple" className="mb-3" />
        <Card className="p-4 space-y-3">

          {/* Filter row — Granularity pills · Segment pills · Metrics dropdown · Segment-value dropdown */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 items-center text-[10px]">
            {/* Granularity — cohort time-bucket grain for the X-axis */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold uppercase tracking-wide text-[9px]">Granularity</span>
              <div className="flex gap-1">
                {GRANULARITIES.map(g => (
                  <PillBtn key={g} active={granularity === g} onClick={() => setGranularity(g)}>{g}</PillBtn>
                ))}
              </div>
            </div>

            <div className="w-px h-4 bg-gray-200 self-center" />

            {/* Retention measurement window — "repeat within N days" */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold uppercase tracking-wide text-[9px]">Window</span>
              <div className="flex gap-1">
                {TREND_WINDOWS.map(w => (
                  <PillBtn key={w} active={gran === w} onClick={() => setGran(w)}>{w}</PillBtn>
                ))}
              </div>
            </div>

            <div className="w-px h-4 bg-gray-200 self-center" />

            {/* Segment type */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold uppercase tracking-wide text-[9px]">Segment</span>
              <div className="flex gap-1 flex-wrap">
                {SEGMENTS.map(s => (
                  <PillBtn key={s} active={segment === s} onClick={() => handleSegmentChange(s)}>
                    {SEG_LABELS[s]}
                  </PillBtn>
                ))}
              </div>
            </div>

            <div className="w-px h-4 bg-gray-200 self-center" />

            {/* Metrics — multi-select dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold uppercase tracking-wide text-[9px]">Metrics</span>
              <MetricsDropdown
                activeMetrics={activeMetrics}
                onToggle={handleMetricToggle}
                onAll={handleMetricAll}
                onClear={handleMetricClear}
              />
            </div>

            <div className="w-px h-4 bg-gray-200 self-center" />

            {/* Segment value — single-select searchable dropdown, all values from data */}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 font-semibold uppercase tracking-wide text-[9px]">
                {SEG_LABELS[segment]}
              </span>
              <SegmentValueDropdown
                segmentLabel={SEG_LABELS[segment]}
                options={trendLoading ? [] : allSegVals}
                value={segFilter}
                onChange={setSegFilter}
                loading={trendLoading}
              />
            </div>
          </div>

          {/* Legend */}
          {seriesList.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {seriesList.map(s => (
                <span key={s.dataKey} className="flex items-center gap-1 text-[10px] text-gray-500">
                  <span style={{
                    display: "inline-block", width: 16, height: 2,
                    background: s.dash.length ? "transparent" : s.color,
                    borderBottom: s.dash.length ? `2px dashed ${s.color}` : "none",
                    flexShrink: 0,
                  }} />
                  {s.label}
                </span>
              ))}
            </div>
          )}

          {/* Chart */}
          {trendLoading ? <Skel h="h-72" /> : trendChartData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                <XAxis
                  dataKey="week"
                  tick={{ fontSize: 10 }}
                  interval="preserveStartEnd"
                  minTickGap={granularity === "DoD" ? 30 : granularity === "WoW" ? 40 : 50}
                />
                {/* Left Y-axis: %, freq */}
                <YAxis yAxisId="y" orientation="left" tick={{ fontSize: 10 }}
                  tickFormatter={v => {
                    const hasRate = [...activeMetrics].some(k => k === "retention_rate");
                    return hasRate ? `${v}%` : String(Number(v).toFixed(2));
                  }} />
                {/* Right Y-axis: ₹ — only when LTV or AOV active */}
                {hasY2 && (
                  <YAxis yAxisId="y2" orientation="right" width={55} tick={{ fontSize: 10 }}
                    tickFormatter={v => `₹${Math.round(v)}`} />
                )}
                <Tooltip contentStyle={{ fontSize: 11 }}
                  formatter={(v, name) => {
                    const s = seriesList.find(x => x.dataKey === name || x.label === name);
                    return [s ? fmtMetric(v, s.unit) : v, s?.label ?? name];
                  }} />
                {seriesList.map(s => (
                  <Line key={s.dataKey} type="monotone" dataKey={s.dataKey} name={s.label}
                    yAxisId={s.yAxis} stroke={s.color} strokeWidth={2}
                    strokeDasharray={s.dash.join(" ")} dot={false} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Image 7: Realized LTV vs CAC by cohort month ── */}
      <div>
        <SectionHeader
          title="Realized LTV vs CAC payback · cohort trend"
          subtitle="Last 12 months · cohort_cac driven · LTV = SUM(order_value ≤ 90d) / NTB count"
          tone="amber" className="mb-3"
        />
        {/* Data notice when only 1 point */}
        {ltvCacData?.length === 1 && (
          <div className="mb-2 px-3 py-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-700">
            Only 1 cohort month found in <code>v_cohort_cac</code> for the last 12 months.
            The trend will populate as more monthly cohorts are available.
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChartCard title="Realized LTV (₹) by cohort"
            legend={<><LegendDot color={C.teal} label="LTV 90d" /><LegendDot color={C.red} label="CAC" /></>}>
            {ltvLoading ? <Skel h="h-52" /> : !ltvCacData?.length ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={ltvCacData} margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                  <XAxis dataKey="cohort_month" tick={{ fontSize: 9 }} padding={{ left: 20, right: 20 }} />
                  <YAxis width={55} tick={{ fontSize: 10 }} tickFormatter={v => `₹${Math.round(v)}`} />
                  <Tooltip contentStyle={{ fontSize: 11 }}
                    formatter={(v, n) => [`₹${Math.round(v || 0)}`, n]} />
                  <Line type="monotone" dataKey="ltv_90d" name="LTV 90d" stroke={C.teal} strokeWidth={2} dot={{ r: 4 }} />
                  <Line type="monotone" dataKey="cac" name="CAC" stroke={C.red} strokeWidth={1.5} strokeDasharray="5 3" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <ChartCard title="CAC vs LTV · monthly"
            legend={<><LegendDot color={C.amber} label="CAC (bar)" /><LegendDot color={C.teal} label="LTV 90d (line)" /></>}>
            {ltvLoading ? <Skel h="h-52" /> : !ltvCacData?.length ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={ltvCacData} margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                  <XAxis dataKey="cohort_month" tick={{ fontSize: 9 }} padding={{ left: 20, right: 20 }} />
                  <YAxis width={55} tick={{ fontSize: 10 }} tickFormatter={v => `₹${Math.round(v)}`} />
                  <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`₹${Math.round(v || 0)}`]} />
                  <Bar dataKey="cac" name="CAC" fill={`${C.amber}99`} radius={[3, 3, 0, 0]} />
                  <Line type="monotone" dataKey="ltv_90d" name="LTV 90d" stroke={C.teal} strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
          {ltvCacData?.slice(-1).map(r => [
            { label: "LTV/CAC ratio", value: r.ltv_cac_ratio ? `${r.ltv_cac_ratio}×` : "—", color: C.green },
            { label: "CAC payback", value: r.payback_days ? `${r.payback_days}d` : "—", color: C.amber },
            { label: "LTV 90d", value: inr(r.ltv_90d), color: C.teal },
          ].map(({ label, value, color }) => (
            <div key={label} className="p-3 rounded-lg border border-gray-100 bg-white">
              <div className="text-[9px] font-bold text-gray-400 mb-1">{label.toUpperCase()} (latest cohort)</div>
              <div className="text-lg font-bold" style={{ color }}>{value}</div>
            </div>
          )))}
        </div>
      </div>

      {/* ── Image 8: Monthly buyer mix by brand origin ── */}
      <div>
        <SectionHeader title="Monthly buyer mix by brand origin" subtitle="NTB · existing buyer · cross-brand inflow" tone="purple" className="mb-3" />
        <Card className="p-4 space-y-3">
          {/* View selector — Overall / brand-specific */}
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-gray-500 font-medium">View brand</span>
            <div className="flex gap-1">
              {["Overall", ...BRANDS_LIST].map(b => (
                <PillBtn key={b} active={brandView === b} onClick={() => setBrandView(b)}>{b}</PillBtn>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-3">
            {mixSeriesKeys.map((k, i) => <LegendDot key={k} color={getMixColor(k, i)} label={k} />)}
          </div>
          {mixLoading ? <Skel h="h-64" /> : mixChartData.length === 0 ? <EmptyState /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={mixChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={{ fontSize: 11 }}
                  formatter={(v, name) => [Number(v).toLocaleString("en-IN"), name]} />
                {mixSeriesKeys.map((k, i) => (
                  <Bar key={k} dataKey={k} name={k} stackId="a" fill={getMixColor(k, i)}
                    radius={i === mixSeriesKeys.length - 1 ? [3, 3, 0, 0] : i === 0 ? [0, 0, 3, 3] : [0, 0, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* ── Image 9: Brand overlap Venn diagrams by order-count cohort ── */}
      <div>
        <SectionHeader title="Brand overlap by order count cohort" subtitle="BA = Bare Anatomy · CAP = Chemist at Play · SS = Sunscoop" tone="red" className="mb-3" />
        {/* Legend */}
        <div className="flex flex-wrap gap-3 mb-3 text-[10px] text-gray-500">
          {[
            { color: C.purple, label: "BA only" }, { color: C.green, label: "CAP only" },
            { color: C.blue,   label: "SS only" }, { color: "#888780", label: "Intersections" },
          ].map(({ color, label }) => <LegendDot key={label} color={color} label={label} />)}
        </div>
        {vennLoading ? (
          <div className="grid grid-cols-2 gap-3"><Skel h="h-64" /><Skel h="h-64" /><Skel h="h-64" /><Skel h="h-64" /></div>
        ) : !vennData?.length ? <EmptyState /> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vennData.map(row => <VennDiagram key={row.order_count_segment} row={row} />)}
          </div>
        )}
      </div>
    </div>
    </LoadingOverlay>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3 — PRODUCT
// ═════════════════════════════════════════════════════════════════════════════
// ─── Shared sort helpers (used by all 4 product-tab tables) ──────────────────
function sortedBy(arr, key, dir) {
  if (!key || !arr?.length) return arr || [];
  return [...arr].sort((a, b) => {
    const av = a[key] ?? (dir === "desc" ? -Infinity : Infinity);
    const bv = b[key] ?? (dir === "desc" ? -Infinity : Infinity);
    if (typeof av === "string") return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    return dir === "asc" ? av - bv : bv - av;
  });
}

function SortTh({ col, label, align = "left", sortKey, sortDir, onSort, minW }) {
  const active = sortKey === col;
  return (
    <th
      onClick={() => onSort(col)}
      className="cursor-pointer select-none px-2 py-2 text-[10px] font-semibold text-gray-600 whitespace-nowrap hover:bg-blue-50/50 transition-colors"
      style={{ textAlign: align, minWidth: minW }}
    >
      {label}{" "}
      <span className={cn("text-[9px]", active ? "text-[#534AB7]" : "opacity-40")}>
        {active ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
      </span>
    </th>
  );
}

function ProductTab({ startDate, endDate }) {
  const [crossWindow,    setCrossWindow]    = useState("30d");
  const [crossFoProduct, setCrossFoProduct] = useState(null);
  const [foSearch, setFoSearch] = useState("");

  // Return rate — product search filter
  const [returnSearch, setReturnSearch] = useState("");

  // Affinity matrix — highlight + scroll to a specific A×B cell
  const [affinA,   setAffinA]   = useState("");
  const [affinB,   setAffinB]   = useState("");
  const matrixRef = useRef(null);

  // ── Sort state for each table ─────────────────────────────────────────────
  const [prodSortKey,  setProdSortKey]  = useState("total");
  const [prodSortDir,  setProdSortDir]  = useState("desc");
  const [gapSortKey,   setGapSortKey]   = useState("median_gap_days");
  const [gapSortDir,   setGapSortDir]   = useState("asc");
  const [crossSortKey, setCrossSortKey] = useState("so_count");
  const [crossSortDir, setCrossSortDir] = useState("desc");
  const [retSortKey,   setRetSortKey]   = useState("return_rate_pct");
  const [retSortDir,   setRetSortDir]   = useState("desc");

  const handleSort = (setKey, setDir, currentKey) => (col) => {
    if (currentKey === col) setDir(d => d === "desc" ? "asc" : "desc");
    else { setKey(col); setDir("desc"); }
  };

  const { data: prodData,   loading: prodLoading }   = useProductTable({ startDate, endDate });
  const { data: gapData,    loading: gapLoading }    = useFoSoGap({ startDate, endDate });
  const { data: crossData,  loading: crossLoading }  = useCrossSell({ startDate, endDate, window: crossWindow, foProduct: crossFoProduct });
  const { data: affinData,  loading: affinLoading }  = useAffinityMatrix({ startDate, endDate });
  const { data: returnData, loading: returnLoading }  = useReturnRate({ startDate, endDate });

  // Pivot product table: product → { jan, feb, mar, ... }
  const prodPivot = useMemo(() => {
    if (!prodData?.length) return [];
    const byProduct = {};
    prodData.forEach(r => {
      if (!byProduct[r.product]) byProduct[r.product] = { product: r.product, total: 0, months: {} };
      byProduct[r.product].months[r.cohort_month] = r;
      byProduct[r.product].total += r.acquired || 0;
    });
    return Object.values(byProduct).sort((a, b) => b.total - a.total);
  }, [prodData]);
  const monthCols = useMemo(() => [...new Set((prodData || []).map(r => r.cohort_month))].sort(), [prodData]);

  // Affinity matrix products
  const affinProds = useMemo(() => {
    const s = new Set();
    (affinData || []).forEach(r => { s.add(r.product_a); s.add(r.product_b); });
    return [...s];   // no slice — show all products
  }, [affinData]);

  const affinLookup = useMemo(() => {
    const m = {};
    (affinData || []).forEach(r => { m[`${r.product_a}|||${r.product_b}`] = r.pct_a_with_b; });
    return m;
  }, [affinData]);

  const affinColor = (v) => {
    if (v == null) return "#F1EFE8";
    if (v >= 30) return "#085041"; if (v >= 20) return C.teal;
    if (v >= 10) return "#9FE1CB"; if (v >= 5) return C.greenLt;
    return "#F8F7F3";
  };
  const affinText = (v) => v == null ? C.gray : v >= 20 ? "#fff" : "#2C2C2A";

  // Auto-scroll to the A×B intersection when both products are selected
  useEffect(() => {
    if (!affinA || !affinB || !matrixRef.current) return;
    const rowIdx = affinProds.indexOf(affinA);
    const colIdx = affinProds.indexOf(affinB);
    if (rowIdx === -1 || colIdx === -1) return;
    const ROW_H   = 34;   // approx px per row (including padding)
    const COL_W   = 72;   // approx px per data column
    const LABEL_W = 134;  // sticky row-label column width
    matrixRef.current.scrollTo({
      top:  Math.max(0, (rowIdx + 1) * ROW_H - 120),
      left: Math.max(0, LABEL_W + colIdx * COL_W - 160),
      behavior: "smooth",
    });
  }, [affinA, affinB, affinProds]);

  const foProducts = useMemo(() => {
    const s = new Set();
    (prodData || []).forEach(r => s.add(r.product));
    return [...s].filter(Boolean).filter(p => p.toLowerCase().includes(foSearch.toLowerCase())).slice(0, 8);
  }, [prodData, foSearch]);

  // ── Sorted data for each table ────────────────────────────────────────────
  const sortedProdPivot = useMemo(() =>
    sortedBy(prodPivot, prodSortKey, prodSortDir),
    [prodPivot, prodSortKey, prodSortDir]
  );
  const sortedGapData = useMemo(() =>
    sortedBy(gapData, gapSortKey, gapSortDir),
    [gapData, gapSortKey, gapSortDir]
  );
  const sortedCrossData = useMemo(() =>
    sortedBy(crossData, crossSortKey, crossSortDir),
    [crossData, crossSortKey, crossSortDir]
  );

  // Convenience sort handlers
  const onSortProd  = handleSort(setProdSortKey,  setProdSortDir,  prodSortKey);
  const onSortGap   = handleSort(setGapSortKey,   setGapSortDir,   gapSortKey);
  const onSortCross = handleSort(setCrossSortKey,  setCrossSortDir, crossSortKey);
  const onSortRet   = handleSort(setRetSortKey,    setRetSortDir,   retSortKey);

  return (
    <LoadingOverlay loading={prodLoading} label="Refreshing…">
    <div className="space-y-5">
      {/* Product retention table */}
      <div>
        <SectionHeader title="Product-level repeat rate by month" subtitle="Green = top · Red = at-risk" tone="purple" className="mb-3" />
        <Card className="p-0 overflow-x-auto">
          {prodLoading ? <div className="p-4"><Skel h="h-48" /></div> : prodPivot.length === 0 ? <EmptyState /> : (
            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              <table className="w-full border-collapse text-[11px] min-w-[700px]">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-gray-100 border-b border-gray-200">
                    <SortTh col="product" label="Product" sortKey={prodSortKey} sortDir={prodSortDir} onSort={onSortProd} minW={200} />
                    {monthCols.map(m => [
                      <th key={`${m}-acq`} className="px-2 py-2 text-right font-semibold text-gray-600 text-[10px]">{m} acq.</th>,
                      <th key={`${m}-ret`} className="px-2 py-2 text-right font-semibold text-gray-600 text-[10px]">{m} ret%</th>,
                    ])}
                    <SortTh col="total" label="Total" align="right" sortKey={prodSortKey} sortDir={prodSortDir} onSort={onSortProd} />
                  </tr>
                </thead>
                <tbody>
                  {sortedProdPivot.map((row, i) => (
                    <tr key={row.product} className={cn(i % 2 ? "bg-gray-50" : "", "hover:bg-blue-50/30")}>
                      <td className="px-3 py-2 font-medium max-w-[200px] truncate" title={row.product}>{row.product}</td>
                      {monthCols.map(m => {
                        const cell = row.months[m];
                        const rate = cell?.retention_rate_30d;
                        return [
                          <td key={`${m}-acq`} className="px-2 py-2 text-right text-gray-700">{num(cell?.acquired)}</td>,
                          <td key={`${m}-ret`} className="px-2 py-2 text-right">
                            {rate != null
                              ? <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold"
                                  style={{ background: retBg(rate), color: retColor(rate) }}>{p(rate)}</span>
                              : "—"}
                          </td>,
                        ];
                      })}
                      <td className="px-2 py-2 text-right font-semibold">{num(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* FO→SO gap */}
      <div>
        <SectionHeader title="First → second order gap (days)" subtitle="Median days between order 1 and order 2 by product" tone="green" className="mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChartCard title={`Median FO→SO gap by product (days) · ${sortedGapData?.length ?? 0} products`}>
            {gapLoading ? <Skel h="h-64" /> : !sortedGapData?.length ? <EmptyState /> : (
              <div style={{ overflowY: "auto", maxHeight: 480 }}>
                <ResponsiveContainer width="100%" height={Math.max(280, sortedGapData.length * 32)}>
                  <BarChart data={sortedGapData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="fo_product" width={140} tick={{ fontSize: 9 }}
                      tickFormatter={v => v?.length > 22 ? v.slice(0, 22) + "…" : v} />
                    <Tooltip contentStyle={{ fontSize: 11 }}
                      formatter={(v) => [`${v}d median · trigger day ${Math.max(1, v - 6)}`, "Gap"]} />
                    <Bar dataKey="median_gap_days" name="Median gap" radius={[0, 3, 3, 0]}>
                      {sortedGapData.map((r, i) => (
                        <Cell key={i} fill={r.median_gap_days < 30 ? `${C.teal}CC` : r.median_gap_days < 45 ? `${C.amber}CC` : `${C.red}CC`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[11px] font-semibold">Optimal campaign trigger windows</div>
              {gapData?.length > 0 && <span className="text-[9px] text-gray-400">{gapData.length} products</span>}
            </div>
            {/* Sort pills for the list */}
            <div className="flex gap-1 flex-wrap mb-3">
              {[
                { col: "fo_product",      label: "Product" },
                { col: "median_gap_days", label: "Median gap" },
                { col: "so_orders",       label: "Orders" },
              ].map(({ col, label }) => (
                <button key={col} onClick={() => onSortGap(col)}
                  className={cn("px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-all",
                    gapSortKey === col
                      ? "bg-[#3B6D11] text-white border-[#3B6D11]"
                      : "bg-white text-gray-500 border-gray-200 hover:bg-gray-50")}>
                  {label} {gapSortKey === col ? (gapSortDir === "asc" ? "↑" : "↓") : ""}
                </button>
              ))}
            </div>
            {gapLoading ? <Skel h="h-48" /> : (
              <div style={{ overflowY: "auto", maxHeight: 360 }}>
                {sortedGapData.map(r => (
                  <div key={r.fo_product} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-[11px] truncate max-w-[160px]" title={r.fo_product}>{r.fo_product}</span>
                    <div className="flex gap-2 items-center flex-shrink-0">
                      <span className="text-[10px] text-gray-400">median {r.median_gap_days}d</span>
                      <Pill color={r.median_gap_days < 30 ? C.green : r.median_gap_days < 45 ? C.amber : C.red}>
                        trigger day {Math.max(1, r.median_gap_days - 6)}
                      </Pill>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Cross-sell waterfall */}
      <div>
        <SectionHeader title="Cross-product repeat rate (FO→SO)" subtitle="Next product bought after first order" tone="green" className="mb-3" />
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center text-[10px]">
            <span className="text-gray-500 font-medium">Window</span>
            <div className="flex gap-1">
              {["7d","30d","60d","120d","360d"].map(w =>
                <PillBtn key={w} active={crossWindow === w} onClick={() => setCrossWindow(w)}>{w}</PillBtn>)}
            </div>
            <span className="text-gray-500 font-medium ml-4">First order product ›</span>
            <input className="border border-gray-200 rounded px-2 py-1 text-[10px] w-40 focus:outline-none focus:border-purple-400"
              placeholder="Search product…" value={foSearch}
              onChange={e => { setFoSearch(e.target.value); }}
            />
            {crossFoProduct && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-[10px] text-purple-700">
                {crossFoProduct} <button onClick={() => setCrossFoProduct(null)} className="ml-1 opacity-60 hover:opacity-100">×</button>
              </span>
            )}
            {foSearch && foProducts.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {foProducts.map(fp => (
                  <button key={fp} className="px-2 py-0.5 rounded bg-white border border-gray-200 text-[10px] hover:bg-purple-50"
                    onClick={() => { setCrossFoProduct(fp); setFoSearch(""); }}>
                    {fp}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 420 }}>
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-100 border-b border-gray-200">
                  <SortTh col="so_product"  label="SO product (bought next)" sortKey={crossSortKey} sortDir={crossSortDir} onSort={onSortCross} />
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500">Cross-sell rate</th>
                  <SortTh col="so_count"    label="SO count"          align="right" sortKey={crossSortKey} sortDir={crossSortDir} onSort={onSortCross} />
                  <SortTh col="pct_of_ntb"  label="% of FO customers" align="right" sortKey={crossSortKey} sortDir={crossSortDir} onSort={onSortCross} />
                </tr>
              </thead>
              <tbody>
                {crossLoading ? (
                  <tr><td colSpan={4} className="p-4"><Skel h="h-32" /></td></tr>
                ) : !(sortedCrossData?.length) ? (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-6 text-sm">No data</td></tr>
                ) : sortedCrossData.map((r, i) => {
                  const barW = Math.min(100, r.pct_of_ntb * 5);
                  const color = r.pct_of_ntb >= 15 ? C.teal : r.pct_of_ntb >= 10 ? C.green : r.pct_of_ntb >= 7 ? C.amber : C.purple;
                  return (
                    <tr key={r.so_product} className={i % 2 ? "bg-gray-50" : ""}>
                      <td className="px-3 py-2">{r.so_product}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2.5 bg-gray-100 rounded overflow-hidden min-w-[80px]">
                            <div className="h-full rounded" style={{ width: `${barW}%`, background: color }} />
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{num(r.so_count)}</td>
                      <td className="px-3 py-2 text-right">
                        <Pill color={color}>{p(r.pct_of_ntb)}</Pill>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {crossData?.length > 0 && (
            <div className="mt-1.5 text-[10px] text-gray-400 text-right">
              {crossData.length} products · scroll to view all
            </div>
          )}
        </Card>
      </div>

      {/* Affinity matrix */}
      <div>
        <SectionHeader
          title="Product affinity matrix"
          subtitle={`% of buyers of product A who also bought product B (lifetime) · ${affinProds.length} products`}
          tone="green" className="mb-3"
        />
        <Card className="p-4">
          {/* ── Product A × B picker ── */}
          {affinProds.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-3 p-2.5 bg-[#EEEDFE] rounded-lg border border-[#AFA9EC]">
              <span className="text-[10px] font-semibold text-[#534AB7]">Find affinity:</span>

              {/* shared datalist for both inputs */}
              <datalist id="aff-prod-list">
                {affinProds.map(p => <option key={p} value={p} />)}
              </datalist>

              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-[#534AB7] uppercase tracking-wide">Product A</span>
                <input
                  list="aff-prod-list"
                  value={affinA}
                  onChange={e => setAffinA(e.target.value)}
                  placeholder="Search product A…"
                  className="border border-[#AFA9EC] rounded px-2 py-1 text-[10px] bg-white outline-none focus:border-[#534AB7] w-44"
                />
              </div>

              <span className="text-[#534AB7] font-bold text-sm">×</span>

              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-bold text-[#534AB7] uppercase tracking-wide">Product B</span>
                <input
                  list="aff-prod-list"
                  value={affinB}
                  onChange={e => setAffinB(e.target.value)}
                  placeholder="Search product B…"
                  className="border border-[#AFA9EC] rounded px-2 py-1 text-[10px] bg-white outline-none focus:border-[#534AB7] w-44"
                />
              </div>

              {/* Show result inline when both are valid */}
              {affinA && affinB && affinA !== affinB && (() => {
                const v = affinLookup[`${affinA}|||${affinB}`] || affinLookup[`${affinB}|||${affinA}`];
                return v != null ? (
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
                    style={{ background: affinColor(v), color: affinText(v) }}>
                    {v}% of {affinA.split(" ")[0]} buyers also bought {affinB.split(" ")[0]}
                  </span>
                ) : (
                  <span className="text-[10px] text-[#534AB7] opacity-60">No co-purchase data for this pair</span>
                );
              })()}

              {(affinA || affinB) && (
                <button
                  onClick={() => { setAffinA(""); setAffinB(""); }}
                  className="text-[9px] text-[#534AB7] opacity-60 hover:opacity-100 font-medium ml-auto"
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {affinLoading ? <Skel h="h-48" /> : affinProds.length === 0 ? <EmptyState /> : (
            /* Scrollable in both directions — row/col headers stay sticky */
            <div ref={matrixRef} className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 480 }}>
              <table className="border-collapse text-[10px]" style={{ minWidth: "max-content" }}>
                <thead className="sticky top-0 z-20">
                  <tr>
                    {/* Corner cell — sticky left AND top */}
                    <th className="p-1.5 bg-gray-100 text-[9px] font-semibold text-gray-400 sticky left-0 z-30 min-w-[134px]"></th>
                    {affinProds.map(pb => {
                      const isHighlightCol = pb === affinB || pb === affinA;
                      return (
                        <th key={pb}
                          className="p-1.5 text-[9px] font-semibold text-center min-w-[72px]"
                          style={{ background: isHighlightCol ? "#534AB720" : "#F1EFE8", color: isHighlightCol ? "#534AB7" : "#888780" }}
                          title={pb}>
                          {pb?.slice(0, 12)}{pb?.length > 12 ? "…" : ""}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {affinProds.map(pa => {
                    const isHighlightRow = pa === affinA || pa === affinB;
                    return (
                      <tr key={pa}>
                        {/* Row label — sticky left */}
                        <td
                          className="p-1.5 text-[9px] font-semibold whitespace-nowrap sticky left-0 z-10"
                          style={{ background: isHighlightRow ? "#534AB720" : "#F1EFE8", color: isHighlightRow ? "#534AB7" : "#888780" }}
                          title={pa}>
                          {pa?.slice(0, 20)}{pa?.length > 20 ? "…" : ""}
                        </td>
                        {affinProds.map(pb => {
                          const v = pa === pb ? null : (affinLookup[`${pa}|||${pb}`] || affinLookup[`${pb}|||${pa}`]);
                          // Highlight the target intersection cell
                          const isTarget = (pa === affinA && pb === affinB) || (pa === affinB && pb === affinA);
                          return (
                            <td key={pb}
                              className="p-1.5 text-center border border-white rounded"
                              style={{
                                background: affinColor(v),
                                outline: isTarget ? "2.5px solid #534AB7" : undefined,
                                outlineOffset: isTarget ? "-1px" : undefined,
                                position: isTarget ? "relative" : undefined,
                                zIndex: isTarget ? 1 : undefined,
                              }}>
                              <span className="text-[10px] font-semibold" style={{ color: isTarget ? "#534AB7" : affinText(v) }}>
                                {pa === pb ? "—" : v != null ? `${v}%` : "—"}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* Return rate */}
      <div>
        <SectionHeader title="Return / refund rate by product & cohort" subtitle="Net of returns is the true retention picture" tone="red" className="mb-3" />

        {/* Search filter */}
        <div className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={returnSearch}
            onChange={e => setReturnSearch(e.target.value)}
            placeholder="Search product…"
            className="border border-gray-200 rounded px-2.5 py-1.5 text-[11px] bg-white outline-none focus:border-red-400 w-56 transition-colors"
          />
          {returnSearch && (
            <span className="text-[10px] text-gray-400">
              {(returnData || []).filter(r => r.product?.toLowerCase().includes(returnSearch.toLowerCase())).length} of {returnData?.length ?? 0} products
            </span>
          )}
          {returnSearch && (
            <button onClick={() => setReturnSearch("")} className="text-[10px] text-gray-400 hover:text-red-500 font-medium">
              Clear
            </button>
          )}
        </div>

        {/* filteredReturn is a plain variable — no IIFE, no JSX issues */}
        {(returnData => {
          const filteredReturn = returnSearch
            ? returnData.filter(r => r.product?.toLowerCase().includes(returnSearch.toLowerCase()))
            : returnData;
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ChartCard title={`Return rate % by product · ${filteredReturn.length} products`}>
                {returnLoading ? <Skel h="h-64" /> : !filteredReturn.length ? <EmptyState msg="No products match your search." /> : (
                  <div style={{ overflowY: "auto", maxHeight: 480 }}>
                    <ResponsiveContainer width="100%" height={Math.max(280, filteredReturn.length * 32)}>
                      <BarChart data={filteredReturn} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                        <YAxis type="category" dataKey="product" width={140} tick={{ fontSize: 9 }}
                          tickFormatter={v => v?.length > 22 ? v.slice(0, 22) + "…" : v} />
                        <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`${v}%`, "Return rate"]} />
                        <Bar dataKey="return_rate_pct" name="Return rate" radius={[0, 3, 3, 0]}>
                          {filteredReturn.map((r, i) => (
                            <Cell key={i} fill={r.return_rate_pct > 6 ? `${C.red}CC` : r.return_rate_pct > 4 ? `${C.amber}CC` : `${C.green}CC`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartCard>

              <Card className="p-0">
                <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-xs font-semibold text-gray-700">Gross vs net repeat rate (after returns)</span>
                  <span className="text-[9px] text-gray-400">{filteredReturn.length} products</span>
                </div>
                {returnLoading ? <div className="p-4"><Skel h="h-48" /></div> : (
                  <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 420 }}>
                    <table className="w-full border-collapse text-[11px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="bg-gray-50">
                          <SortTh col="product"           label="Product"     sortKey={retSortKey} sortDir={retSortDir} onSort={onSortRet} minW={140} />
                          <SortTh col="gross_repeat_rate" label="Gross ret%"  sortKey={retSortKey} sortDir={retSortDir} onSort={onSortRet} />
                          <SortTh col="return_rate_pct"   label="Return%"     sortKey={retSortKey} sortDir={retSortDir} onSort={onSortRet} />
                          <SortTh col="net_repeat_rate"   label="Net ret%"    sortKey={retSortKey} sortDir={retSortDir} onSort={onSortRet} />
                          <SortTh col="_delta"            label="Δ"           sortKey={retSortKey} sortDir={retSortDir} onSort={onSortRet} />
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          // Compute delta, then sort
                          const withDelta = filteredReturn.map(r => ({
                            ...r,
                            _delta: r.net_repeat_rate != null && r.gross_repeat_rate != null
                              ? r.net_repeat_rate - r.gross_repeat_rate : null,
                          }));
                          const display = sortedBy(withDelta, retSortKey, retSortDir);
                          return display.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-400 text-sm">No products match your search.</td></tr>
                          ) : display.map((r, i) => (
                            <tr key={r.product} className={i % 2 ? "bg-gray-50" : ""}>
                              <td className="px-3 py-2 max-w-[140px] truncate text-[10px]" title={r.product}>{r.product}</td>
                              <td className="px-3 py-2">{p(r.gross_repeat_rate)}</td>
                              <td className="px-3 py-2"><Pill color={r.return_rate_pct > 6 ? C.red : r.return_rate_pct > 4 ? C.amber : C.green}>{p(r.return_rate_pct)}</Pill></td>
                              <td className="px-3 py-2 font-semibold">{p(r.net_repeat_rate)}</td>
                              <td className="px-3 py-2 text-[10px] font-semibold text-red-600">
                                {r._delta != null ? `${r._delta.toFixed(2)}pp` : "—"}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            </div>
          );
        })(returnData || [])}
      </div>
    </div>
    </LoadingOverlay>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4 — ACQUISITION QUALITY
// ═════════════════════════════════════════════════════════════════════════════
// Payment mode colour / dash config — defined outside so it doesn't re-create each render
const PAY_COLORS  = { Prepaid: C.purple, COD: C.amber, UPI: C.teal, Card: C.blue };
const PAY_DASH    = { Prepaid: [], COD: [5,3], UPI: [3,3], Card: [8,2] };
const PAY_FALLBACK = ["#534AB7","#854F0B","#0F6E56","#A32D2D","#185FA5","#3B6D11"];

function AcquisitionTab({ startDate, endDate }) {
  const [chWindow, setChWindow] = useState("30d");

  // Only channel quality responds to window changes; the rest use selected dates only
  const { data: chData,   loading: chLoading }   = useChannelQuality({ startDate, endDate, window: chWindow });
  const { data: discData, loading: discLoading }  = useDiscountRepeat({ startDate, endDate });
  const { data: payData,  loading: payLoading }   = usePaymentSplit({ startDate, endDate });
  const { data: tierData, loading: tierLoading }  = useCityTier({ startDate, endDate });
  const { data: aovData,  loading: aovLoading }   = useAovByOrder({ startDate, endDate });

  // Derive unique payment modes from data
  const payModes = useMemo(() =>
    [...new Set((payData || []).map(r => r.payment_mode))].filter(Boolean).sort(),
    [payData]
  );

  // Backend now normalises to exactly 2 values: 'full_price' and 'discount_acquired'
  // (NULL/empty in DB → full_price, any discount tag → discount_acquired)
  const DISC_CONFIG = {
    full_price:        { label: "Full price",        color: C.purple, dash: [] },
    discount_acquired: { label: "Discount acquired", color: C.amber,  dash: [5,3] },
  };
  const discConfig   = (seg) => DISC_CONFIG[seg] || { label: seg, color: C.gray, dash: [] };
  const discSegments    = useMemo(() =>
    [...new Set((discData || []).map(r => r.discount_segment))].filter(Boolean).sort(),
    [discData]
  );
  const discVisibleSegs = useMemo(() =>
    ["full_price","discount_acquired"].filter(s => discSegments.includes(s)),
    [discSegments]
  );

  // Shape discount repeat for chart: months as x-axis, segment as series
  const discChartData = useMemo(() => {
    if (!discData?.length) return [];
    const months = [...new Set(discData.map(r => r.cohort_month))].sort();
    return months.map(m => {
      const row = { month: m };
      discData.filter(r => r.cohort_month === m).forEach(r => { row[r.discount_segment] = r.retention_rate_30d; });
      return row;
    });
  }, [discData]);

  const payChartData = useMemo(() => {
    if (!payData?.length) return [];
    const months = [...new Set(payData.map(r => r.cohort_month))].sort();
    return months.map(m => {
      const row = { month: m };
      payData.filter(r => r.cohort_month === m).forEach(r => { row[r.payment_mode] = r.retention_rate_30d; });
      return row;
    });
  }, [payData]);

  // AOV by order cohort — pivot brands × OC
  const aovChartData = useMemo(() => {
    const ocs = ["OC1","OC2","OC3","OC3+"];
    return ocs.map(oc => {
      const row = { oc };
      (aovData || []).filter(r => r.order_cohort === oc).forEach(r => { row[r.brand] = r.avg_order_value; });
      return row;
    });
  }, [aovData]);
  const aovBrands = [...new Set((aovData || []).map(r => r.brand))].filter(Boolean);

  const qualityBadge = (ltr) => {
    if (!ltr) return null;
    if (ltr >= 2.5) return <Pill color={C.green}>Excellent</Pill>;
    if (ltr >= 1.8) return <Pill color={C.amber}>Good</Pill>;
    if (ltr >= 1.4) return <Pill color={C.amber}>Marginal</Pill>;
    return <Pill color={C.red}>At-risk</Pill>;
  };

  return (
    <div className="space-y-5">
      {/* Channel quality — only this section responds to the Retention window filter */}
      <div>
        <SectionHeader title="CAC quality by acquisition channel" subtitle="Which traffic source acquires customers who actually come back" tone="blue" className="mb-3" />
        <LoadingOverlay loading={chLoading} label="Refreshing…">
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-center text-[10px]">
            <span className="text-gray-500 font-medium">Retention window</span>
            {["7d","30d","60d","120d","360d"].map(w =>
              <PillBtn key={w} active={chWindow === w} onClick={() => setChWindow(w)}>{w}</PillBtn>)}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
                  {["Channel","NTB customers",`Ret% (${chWindow})`,"CAC (₹)","LTV (₹)","LTV/CAC","Payback (d)","Quality"].map(h =>
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 whitespace-nowrap">{h}</th>)}
                </tr>
              </thead>
              <tbody className={chLoading ? "opacity-40 pointer-events-none" : ""}>
                {chLoading && !chData?.length ? (
                  <tr><td colSpan={8} className="p-4"><Skel h="h-32" /></td></tr>
                ) : !(chData?.length) ? (
                  <tr><td colSpan={8} className="text-center text-gray-400 py-6 text-sm">No data</td></tr>
                ) : chData.map((r, i) => {
                  const ltr = r.ltv_cac_ratio;
                  return (
                    <tr key={r.channel} className={i % 2 ? "bg-gray-50" : ""}>
                      <td className="px-3 py-2 font-medium">{r.channel}</td>
                      <td className="px-3 py-2">{num(r.ntb_count)}</td>
                      <td className="px-3 py-2">
                        <Pill color={retColor(r.retention_rate)}>{p(r.retention_rate)}</Pill>
                        {chLoading && <span className="ml-1 text-[9px] text-gray-400">↻</span>}
                      </td>
                      <td className="px-3 py-2">{inr(r.avg_cac)}</td>
                      <td className="px-3 py-2">{inr(r.ltv_90d)}</td>
                      <td className="px-3 py-2">
                        <Pill color={ltr >= 2 ? C.green : ltr >= 1.5 ? C.amber : C.red}>
                          {ltr ? `${ltr}×` : "—"}
                        </Pill>
                      </td>
                      <td className="px-3 py-2">{r.payback_days ? `${r.payback_days}d` : "—"}</td>
                      <td className="px-3 py-2">{qualityBadge(ltr)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
        </LoadingOverlay>
      </div>

      {/* Discount vs full-price */}
      <div>
        <SectionHeader title="Discount vs full-price first-order repeat rate" subtitle="Acquisition quality matters — full-price cohorts retain better" tone="amber" className="mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <ChartCard title="Repeat rate: discount-acquired vs full-price · by cohort month"
              legend={discVisibleSegs.map(s => {
                const cfg = discConfig(s);
                return <LegendDot key={s} color={cfg.color} label={cfg.label} />;
              })}>
              {discLoading ? <Skel h="h-52" /> : discChartData.length === 0 ? (
                <div className="space-y-2">
                  <EmptyState />
                  {discSegments.length > 0 && (
                    <div className="text-[10px] text-gray-400 text-center">
                      Segments found in data: <code className="bg-gray-100 px-1 rounded">{discSegments.join(", ")}</code>
                    </div>
                  )}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={discChartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis width={45} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`${v}%`]} />
                    {discVisibleSegs.map(s => {
                      const cfg = discConfig(s);
                      return (
                        <Line key={s} type="monotone" dataKey={s} name={cfg.label}
                          stroke={cfg.color} strokeWidth={2} dot={{ r: 3 }}
                          strokeDasharray={cfg.dash.join(" ")} />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>

          {/* Summary cards — driven by discVisibleSegs */}
          <Card className="p-4 space-y-3">
            {discLoading ? <Skel h="h-32" /> : discVisibleSegs.length === 0 ? (
              <div className="text-[10px] text-gray-400 text-center py-4">
                No discount segment data found.
                {discSegments.length > 0 && (
                  <div className="mt-1">Segments in DB: <code>{discSegments.join(", ")}</code></div>
                )}
              </div>
            ) : discVisibleSegs.map(seg => {
              const cfg    = discConfig(seg);
              const rows   = (discData || []).filter(r => r.discount_segment === seg);
              const totNtb = rows.reduce((s, r) => s + (r.ntb_count || 0), 0);
              const totRet = rows.reduce((s, r) => s + (r.retained_30d || 0), 0);
              const rate   = totNtb ? (totRet / totNtb) * 100 : null;
              return (
                <div key={seg} className="p-3 rounded border" style={{ background: `${cfg.color}11`, borderColor: `${cfg.color}44` }}>
                  <div className="text-[9px] font-bold mb-1" style={{ color: cfg.color }}>{cfg.label.toUpperCase()} COHORT</div>
                  <div className="text-xl font-bold font-mono" style={{ color: cfg.color }}>
                    {rate != null ? p(rate) : "—"}
                  </div>
                  <div className="text-[10px] text-gray-400">30d repeat · {num(totNtb)} customers</div>
                  <div className="mt-2 h-1 rounded overflow-hidden bg-gray-100">
                    <div className="h-full rounded transition-all" style={{ width: `${Math.min(100, (rate || 0) * 10)}%`, background: cfg.color }} />
                  </div>
                </div>
              );
            })}
            {/* Delta insight between first two visible segments */}
            {discVisibleSegs.length >= 2 && (() => {
              const calcRate = (seg) => {
                const rows = (discData || []).filter(r => r.discount_segment === seg);
                const n = rows.reduce((s,r) => s + (r.ntb_count||0), 0);
                return n ? (rows.reduce((s,r) => s + (r.retained_30d||0), 0) / n) * 100 : null;
              };
              const r0 = calcRate(discVisibleSegs[0]);
              const r1 = calcRate(discVisibleSegs[1]);
              const delta = r0 != null && r1 != null ? (r1 - r0).toFixed(1) : null;
              return delta != null ? (
                <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-[10px] text-amber-700 leading-relaxed">
                  <strong>Δ {delta}pp</strong> ({discConfig(discVisibleSegs[1]).label} vs {discConfig(discVisibleSegs[0]).label}).
                  Full-price acquisition yields higher retention quality.
                </div>
              ) : null;
            })()}
          </Card>
        </div>
      </div>

      {/* COD vs Prepaid */}
      <div>
        <SectionHeader title="COD vs Prepaid · repeat rate & retention quality" subtitle="Payment mode is a strong predictor of repeat behavior" tone="amber" className="mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <ChartCard title="Repeat rate trend · payment mode · by cohort month"
              legend={payModes.map((m, i) => <LegendDot key={m} color={PAY_COLORS[m] || PAY_FALLBACK[i]} label={m} />)}>
              {payLoading ? <Skel h="h-52" /> : payChartData.length === 0 ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={payChartData} margin={{ top: 5, right: 15, left: 5, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis width={45} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`${v}%`]} />
                    {payModes.map((m, i) => (
                      <Line key={m} type="monotone" dataKey={m} name={m}
                        stroke={PAY_COLORS[m] || PAY_FALLBACK[i]}
                        strokeWidth={2.5} dot={{ r: 3 }}
                        strokeDasharray={(PAY_DASH[m] || []).join(" ")} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
          <Card className="p-4 space-y-3">
            {payLoading ? <Skel h="h-40" /> :
              payModes.map((mode, i) => {
                const color = PAY_COLORS[mode] || PAY_FALLBACK[i];
                const rows  = (payData || []).filter(r => r.payment_mode === mode);
                const totNtb = rows.reduce((s, r) => s + (r.ntb_count || 0), 0);
                const totRet = rows.reduce((s, r) => s + (r.retained_30d || 0), 0);
                const rate   = totNtb ? (totRet / totNtb) * 100 : 0;
                const avgLtv = rows.length ? rows.reduce((s, r) => s + (r.ltv_90d || 0), 0) / rows.length : 0;
                return (
                  <div key={mode} className="p-3 rounded border" style={{ background: `${color}11`, borderColor: `${color}44` }}>
                    <div className="text-[9px] font-bold mb-1" style={{ color }}>{mode.toUpperCase()} COHORT</div>
                    <div className="text-xl font-bold font-mono" style={{ color }}>{p(rate)}</div>
                    <div className="text-[10px] text-gray-400">30d repeat · {num(totNtb)} customers</div>
                    <div className="text-[10px] text-gray-400">Avg LTV {inr(avgLtv)}</div>
                  </div>
                );
              })
            }
          </Card>
        </div>
      </div>

      {/* City tier */}
      <div>
        <SectionHeader title="Repeat rate by city tier" subtitle="Do retention economics hold outside Tier 1?" tone="blue" className="mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <ChartCard title="30d repeat rate & LTV by city tier"
            legend={<><LegendDot color={C.purple} label="Repeat %" /><LegendDot color={`${C.teal}88`} label="LTV (₹, R)" /></>}>
            {tierLoading ? <Skel h="h-52" /> : !tierData?.length ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={tierData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                  <XAxis dataKey="city_tier" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="left" width={45} tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <YAxis yAxisId="right" orientation="right" width={55} tick={{ fontSize: 10 }} tickFormatter={v => `₹${Math.round(v)}`} />
                  <Tooltip contentStyle={{ fontSize: 11 }} />
                  <Bar yAxisId="left" dataKey="retention_rate_30d" name="Repeat %" radius={[3,3,0,0]}>
                    {tierData.map((r, i) => (
                      <Cell key={i} fill={r.retention_rate_30d >= 7 ? `${C.purple}CC` : r.retention_rate_30d >= 4 ? `${C.amber}CC` : `${C.red}CC`} />
                    ))}
                  </Bar>
                  <Line yAxisId="right" type="monotone" dataKey="ltv_90d" name="LTV 90d" stroke={C.teal} strokeWidth={2} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
          <Card className="p-0 overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-700">Tier-wise economics summary</div>
            {tierLoading ? <div className="p-4"><Skel h="h-32" /></div> : (
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-gray-50">
                    {["City tier","Customers","30d ret%","LTV (₹)","CAC (₹)","LTV/CAC"].map(h =>
                      <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(tierData || []).map((r, i) => (
                    <tr key={r.city_tier} className={i % 2 ? "bg-gray-50" : ""}>
                      <td className="px-3 py-2">{r.city_tier}</td>
                      <td className="px-3 py-2">{num(r.ntb_count)}</td>
                      <td className="px-3 py-2"><Pill color={retColor(r.retention_rate_30d)}>{p(r.retention_rate_30d)}</Pill></td>
                      <td className="px-3 py-2">{inr(r.ltv_90d)}</td>
                      <td className="px-3 py-2">{inr(r.avg_cac)}</td>
                      <td className="px-3 py-2">
                        <Pill color={r.ltv_cac_ratio >= 1.8 ? C.green : r.ltv_cac_ratio >= 1.4 ? C.amber : C.red}>
                          {r.ltv_cac_ratio ? `${r.ltv_cac_ratio}×` : "—"}
                        </Pill>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      {/* AOV by order number */}
      <div>
        <SectionHeader title="AOV by order number · do customers spend more as loyalty grows?" subtitle="OC1 → OC2 → OC3 → OC3+ · brand level" tone="purple" className="mb-3" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-3">
            <ChartCard title="AOV (₹) by order number · per brand"
              legend={aovBrands.map(b => <LegendDot key={b} color={BRAND_COLORS[b] || C.gray} label={b} />)}>
              {aovLoading ? <Skel h="h-52" /> : aovChartData.every(r => aovBrands.every(b => !r[b])) ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={aovChartData} margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" />
                    <XAxis dataKey="oc" tick={{ fontSize: 11 }} />
                    <YAxis width={55} tick={{ fontSize: 10 }} tickFormatter={v => `₹${v}`} />
                    <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`₹${Math.round(v)}`]} />
                    {aovBrands.map(b => (
                      <Line key={b} type="monotone" dataKey={b} name={b}
                        stroke={BRAND_COLORS[b] || C.gray} strokeWidth={2} dot={{ r: 5 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
          <Card className="p-4 space-y-3">
            <div className="text-[11px] font-semibold mb-1">OC1→OC2 uplift</div>
            {aovLoading ? <Skel h="h-32" /> : aovBrands.map(b => {
              const oc1 = aovData?.find(r => r.brand === b && r.order_cohort === "OC1")?.avg_order_value;
              const oc2 = aovData?.find(r => r.brand === b && r.order_cohort === "OC2")?.avg_order_value;
              const uplift = oc1 && oc2 ? ((oc2 - oc1) / oc1) * 100 : null;
              const color  = BRAND_COLORS[b] || C.gray;
              return (
                <div key={b} className="p-3 rounded border" style={{ background: `${color}11`, borderColor: `${color}33` }}>
                  <div className="text-[9px] font-bold mb-1 truncate" style={{ color }}>{b?.toUpperCase()}</div>
                  <div className="text-lg font-bold font-mono" style={{ color }}>
                    {uplift != null ? `${uplift >= 0 ? "+" : ""}${uplift.toFixed(0)}%` : "—"}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    {inr(oc1)} → {inr(oc2)}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5 — UNIT ECONOMICS
// ═════════════════════════════════════════════════════════════════════════════
function UnitEconTab({ startDate, endDate }) {
  const { data: cmData, loading: cmLoading } = useContributionMargin({ startDate, endDate });

  const waterfallData = cmData ? [
    { label: "Gross LTV",   value: cmData.gross_ltv_per_customer, color: `${C.teal}CC` },
    { label: "− Returns",   value: cmData.avg_returns_per_customer, color: `${C.red}CC` },
    { label: "Net LTV",     value: cmData.net_ltv_per_customer, color: `${C.purple}CC` },
    { label: "− CAC",       value: cmData.avg_cac, color: `${C.red}CC` },
  ] : [];

  return (
    <LoadingOverlay loading={cmLoading} label="Refreshing…">
    <div className="space-y-5">
      {/* Contribution margin KPIs */}
      <div>
        <SectionHeader title="Contribution margin per cohort" subtitle="LTV minus returns · true value per customer" tone="red" className="mb-3" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {cmLoading ? Array(4).fill(0).map((_, i) => <Card key={i} className="p-4"><Skel h="h-14" /></Card>) : <>
            <KpiCard label="Avg LTV (90d)"           value={inr(cmData?.gross_ltv_per_customer)} />
            <KpiCard label="Avg returns / customer"  value={inr(cmData?.avg_returns_per_customer)} positiveIsBad />
            <KpiCard label="Return rate"             value={p(cmData?.return_rate_pct)} positiveIsBad />
            <KpiCard label="Net LTV per customer"    value={inr(cmData?.net_ltv_per_customer)} />
          </>}
        </div>
        {/* CM% insight */}
        {cmData?.contribution_margin_pct != null && (
          <div className="p-3 rounded border border-green-200 bg-green-50 text-sm text-green-800">
            <strong>Contribution margin: {p(cmData.contribution_margin_pct)}</strong> — net LTV after returns vs gross LTV.
            CAC payback based on net CM is {inr(cmData.avg_cac)} ÷ {inr(cmData.net_ltv_per_customer)}.
          </div>
        )}
      </div>

      {/* CM waterfall chart */}
      {waterfallData.length > 0 && (
        <ChartCard title="Contribution margin waterfall · avg customer">
          {cmLoading ? <Skel h="h-48" /> : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={waterfallData} margin={{ top: 5, right: 15, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1EFE8" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis width={55} tick={{ fontSize: 10 }} tickFormatter={v => `₹${Math.round(v)}`} />
                <Tooltip contentStyle={{ fontSize: 11 }} formatter={v => [`₹${Math.round(v)}`]} />
                <Bar dataKey="value" name="₹" radius={[4, 4, 0, 0]}>
                  {waterfallData.map((r, i) => <Cell key={i} fill={r.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      )}

      {/* Winback & NPS placeholders */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-5 flex flex-col items-center justify-center text-center min-h-[140px] border-dashed">
          <div className="text-sm font-semibold text-gray-500 mb-1">Winback campaign tracker</div>
          <div className="text-xs text-gray-400">Connect your campaign data source to see reactivation metrics.</div>
        </Card>
        <Card className="p-5 flex flex-col items-center justify-center text-center min-h-[140px] border-dashed">
          <div className="text-sm font-semibold text-gray-500 mb-1">NPS / satisfaction overlay</div>
          <div className="text-xs text-gray-400">Connect your NPS data source to see the satisfaction → repeat rate lead indicator.</div>
        </Card>
      </div>
    </div>
    </LoadingOverlay>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// KEY METRICS STRIP  — shown in every tab so users always see the headline numbers
// ═════════════════════════════════════════════════════════════════════════════
function KeyMetricsStrip({ km, prevKm, loading, hasComparison }) {
  const delta = (curr, prev) => {
    if (!hasComparison || curr == null || prev == null || prev === 0) return null;
    return (curr - prev) / prev;
  };
  const loyalRate = km.loyal_customers && km.ntb_customers
    ? km.loyal_customers / km.ntb_customers : null;
  const prevLoyalRate = prevKm.loyal_customers && prevKm.ntb_customers
    ? prevKm.loyal_customers / prevKm.ntb_customers : null;

  const metrics = [
    { label: "30d repeat rate",     value: km.repeat_rate_30d != null ? `${Number(km.repeat_rate_30d).toFixed(1)}%` : "—", delta: delta(km.repeat_rate_30d, prevKm.repeat_rate_30d) },
    { label: "LTV 90d",             value: inr(km.realized_ltv_90d),   delta: delta(km.realized_ltv_90d, prevKm.realized_ltv_90d) },
    { label: "Avg AOV",             value: inr(km.avg_order_value),     delta: delta(km.avg_order_value, prevKm.avg_order_value) },
    { label: "Order frequency",     value: km.avg_order_frequency ? Number(km.avg_order_frequency).toFixed(2) : "—", delta: delta(km.avg_order_frequency, prevKm.avg_order_frequency) },
    { label: "CAC payback",         value: km.cac_payback_days ? `${Math.round(km.cac_payback_days)}d` : "—", delta: delta(km.cac_payback_days, prevKm.cac_payback_days), positiveIsBad: true },
    { label: "Loyal (3+ orders)",   value: loyalRate != null ? `${(loyalRate * 100).toFixed(1)}%` : "—", delta: delta(loyalRate, prevLoyalRate) },
  ];

  return (
    <div className="mb-5">
      <SectionHeader title="Key metrics" subtitle="Rolling · all cohorts" tone="purple" className="mb-2" />
      <LoadingOverlay loading={loading} label="Refreshing…">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {loading && !km.repeat_rate_30d
            ? Array(6).fill(0).map((_, i) => <Card key={i} className="p-3"><Skel h="h-10" /></Card>)
            : metrics.map(({ label, value, delta: d, positiveIsBad }) => (
                <KpiCard key={label} label={label} value={value} delta={d} positiveIsBad={positiveIsBad} />
              ))
          }
        </div>
      </LoadingOverlay>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════
export default function RetentionPage({ startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const [activeTab, setActiveTab] = useState("overview");
  const [visitedTabs, setVisited] = useState(new Set(["overview"]));

  function switchTab(key) {
    setActiveTab(key);
    setVisited(prev => new Set([...prev, key]));
  }

  // Fetch overview data once at page level — shared across all tabs
  const { data: overviewData, loading: overviewLoading } = useRetentionOverview({ startDate, endDate });
  const { data: prevData }  = useRetentionOverviewCompare({ startDate, endDate, compareStart, compareEnd, hasComparison });
  const km     = overviewData?.key_metrics || {};
  const prevKm = prevData || {};

  // AI summary — real endpoint
  const { summary: aiSummary, pending: aiPending } = useAiSummary(
    () => api.retention.aiSummaryStreamUrl()
  );

  const sharedProps   = { startDate, endDate };
  const compareProps  = { compareStart, compareEnd, hasComparison };
  const isNonOverview = activeTab !== "overview";

  return (
    <div className="min-h-screen bg-[#F1EFE8]">
      {/* Tab bar */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-200 px-5 flex items-center gap-1 h-11 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={cn("px-3.5 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-all relative",
              activeTab === t.key ? "text-white" : "text-gray-600 hover:bg-gray-50")}
            style={activeTab === t.key ? { background: t.color } : {}}>
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: activeTab === t.key ? "rgba(255,255,255,0.6)" : t.color }} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="max-w-[1400px] mx-auto px-5 py-5">
        {/* AI Flash — connected to real endpoint */}
        <AIFlash
          title="AI daily flash · Retention"
          summary={aiSummary}
          pending={aiPending}
          loading={overviewLoading}
          className="mb-4"
        />

        {/* Key metrics strip — visible on ALL tabs */}
        {isNonOverview && (
          <KeyMetricsStrip
            km={km}
            prevKm={prevKm}
            loading={overviewLoading}
            hasComparison={hasComparison}
          />
        )}

        {activeTab === "overview"    && (
          <OverviewTab
            {...sharedProps}
            {...compareProps}
            overviewData={overviewData}
            overviewLoading={overviewLoading}
            prevKm={prevKm}
          />
        )}
        {activeTab === "trend"       && visitedTabs.has("trend")       && <RetentionTrendTab {...sharedProps} />}
        {activeTab === "product"     && visitedTabs.has("product")     && <ProductTab        {...sharedProps} />}
        {activeTab === "acquisition" && visitedTabs.has("acquisition") && <AcquisitionTab    {...sharedProps} />}
        {activeTab === "econ"        && visitedTabs.has("econ")        && <UnitEconTab       {...sharedProps} />}
      </div>
    </div>
  );
}
