import { useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  LineChart,
  PieChart, Pie, Cell,
} from "recharts";
import { api } from "@/lib/api";
import { useAppCR } from "@/modules/app_cr/useAppCR";
import { AppCRTabs, APP_CR_TABS } from "@/modules/app_cr/components/AppCRTabs";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { AIFlash } from "@/shared/components/AIFlash";
import { KpiCard } from "@/shared/components/KpiCard";
import { Card, CardBody } from "@/shared/ui/Card";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { fmt, cn } from "@/lib/utils";

// ─── colour palette ───────────────────────────────────────────────────────────
const C = {
  blue:   "#185FA5",
  purple: "#534AB7",
  teal:   "#0F6E56",
  green:  "#3B6D11",
  amber:  "#854F0B",
  red:    "#A32D2D",
  coral:  "#993C1D",
  gray:   "#888780",
};

// ─── helpers ──────────────────────────────────────────────────────────────────
function pct(n, dp = 1) {
  if (n == null || isNaN(n)) return "—";
  return (n * 100).toFixed(dp) + "%";
}
function shortDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  return `${d.getDate()} ${d.toLocaleString("en", { month: "short" })}`;
}

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-sc-gray-900 text-white text-[11px] rounded-md px-3 py-2 shadow-lg min-w-[140px]">
      <div className="font-semibold mb-1.5 text-sc-gray-200">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span style={{ background: p.color }} className="w-2 h-2 rounded-sm flex-shrink-0" />
          <span className="opacity-70">{p.name}:</span>
          <span className="font-mono font-semibold ml-auto pl-2">
            {p.value != null ? p.value.toLocaleString("en-IN") : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI strip (10 metrics, 2 rows of 5) ─────────────────────────────────────
function KpiStrip({ curr, deltas, hasComparison }) {
  // Only show delta badges when a comparison period is actually selected
  const d = (k) => (hasComparison ? (deltas?.[k] ?? null) : null);
  const metrics = [
    // Row 1
    { label: "Installs",           value: fmt.num(curr.installs),           key: "installs" },
    { label: "Inorganic Installs", value: fmt.num(curr.inorganic_installs), key: "inorganic_installs" },
    { label: "Orders",             value: fmt.num(curr.orders),             key: "orders" },
    { label: "Revenue",            value: fmt.inr(curr.revenue),            key: "revenue" },
    { label: "Uninstalls",         value: fmt.num(curr.uninstalls),         key: "uninstalls", positiveIsBad: true },
    // Row 2
    { label: "CVR",                value: pct(curr.cvr),                    key: "cvr" },
    { label: "ATC",                value: fmt.num(curr.atc),                key: "atc" },
    { label: "ATC Rate",           value: pct(curr.atc_rate),               key: "atc_rate" },
    { label: "AOV",                value: fmt.inr(curr.aov),                key: "aov" },
    { label: "Avg DAU",            value: fmt.num(curr.dau),                key: "dau" },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {metrics.map(({ label, value, key, positiveIsBad }) => (
        <KpiCard
          key={key}
          label={label}
          value={value}
          delta={d(key)}
          positiveIsBad={positiveIsBad}
        />
      ))}
    </div>
  );
}

// ─── filter pill button ───────────────────────────────────────────────────────
function FilterPill({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 bg-elevated rounded-md p-0.5">
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            "px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap",
            value === opt
              ? "bg-surface text-text shadow-sm"
              : "text-muted hover:text-text",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────
const DONUT_COLORS = [C.blue, C.purple, C.teal, C.amber, C.red, C.coral, C.gray, C.green];

// Bar chart on Overview: % of installs reaching each step.
// vil_rate (Browse) removed — matches the funnel tab cleanup.

function OverviewTab({ data, startDate, endDate }) {
  // ── chart filter state ────────────────────────────────────────────────
  const [granularity,  setGranularity]  = useState("Daily");
  const [os,           setOs]           = useState("All");
  const [installType,  setInstallType]  = useState("All");

  // trend rows — start from what overview already loaded, refetch on filter change
  const [trendRows,    setTrendRows]    = useState(data?.daily_trend || []);
  const [trendLoading, setTrendLoading] = useState(false);
  const isFirst = useRef(true);

  useEffect(() => {
    // skip the first render — we already have data.daily_trend
    if (isFirst.current) { isFirst.current = false; return; }
    setTrendLoading(true);
    api.appCr
      .trend({
        startDate,
        endDate,
        granularity:  granularity === "Weekly" ? "week" : "day",
        os,
        installType,
      })
      .then((rows) => setTrendRows(rows || []))
      .catch(() => {})
      .finally(() => setTrendLoading(false));
  }, [startDate, endDate, granularity, os, installType]);

  // ── chart data ────────────────────────────────────────────────────────
  const trendChart = trendRows.map((r) => ({
    date:     shortDate(r.date),
    Installs: r.installs  != null ? +r.installs  : null,
    "CVR %":  r.cvr_pct   != null ? +Number(r.cvr_pct).toFixed(2)      : null,
    "ATC %":  r.atc_rate_pct != null ? +Number(r.atc_rate_pct).toFixed(2) : null,
  }));

  // ── tick interval — show ~8 labels regardless of data length ──────────
  const tickInterval = Math.max(0, Math.floor(trendChart.length / 7) - 1);

  // ── source mix donut ──────────────────────────────────────────────────
  // Re-use install_attribution (channel_group breakdown) already loaded
  const sourceMix = (data?.install_attribution || [])
    .filter((r) => (r.installs || 0) > 0)
    .slice(0, 8);

  const totalInstalls = sourceMix.reduce((s, r) => s + (r.installs || 0), 0) || 1;

  return (
    <div className="space-y-5">

      {/* ── Section header + filter controls ─────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionHeader
          tone="blue"
          title="Daily install & CVR trend — all media sources"
          subtitle={`${startDate} – ${endDate} · ${trendChart.length} ${granularity === "Weekly" ? "weeks" : "days"} · non-organic + organic`}
          className="flex-1 min-w-0"
        />
      </div>

      {/* filter row — matches AF HTML design */}
      <div className="flex items-center gap-3 flex-wrap px-3 py-2 bg-elevated/60 rounded-lg border border-border text-[11px]">
        <span className="font-semibold text-muted">Granularity</span>
        <FilterPill
          options={["Daily", "Weekly"]}
          value={granularity}
          onChange={setGranularity}
        />
        <div className="w-px h-4 bg-border" />
        <span className="font-semibold text-muted">OS</span>
        <FilterPill
          options={["All", "iOS", "Android"]}
          value={os}
          onChange={setOs}
        />
        <div className="w-px h-4 bg-border" />
        <span className="font-semibold text-muted">Install type</span>
        <FilterPill
          options={["All", "Non-organic", "Organic"]}
          value={installType}
          onChange={setInstallType}
        />
        {trendLoading && (
          <span className="text-[10px] text-muted ml-auto animate-pulse">refreshing…</span>
        )}
      </div>

      {/* ── Trend chart ──────────────────────────────────────────────── */}
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-[12px] font-semibold">Daily installs + CVR % overlay</span>
            <div className="flex gap-4">
              {[{ c: C.blue, l: "Installs (K)" }, { c: C.teal, l: "CVR %" }].map(({ c, l }) => (
                <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span style={{ background: c }} className="w-2.5 h-2.5 rounded-sm" />{l}
                </span>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={trendChart} margin={{ top: 4, right: 48, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: C.gray }}
                tickLine={false}
                axisLine={false}
                interval={tickInterval}
              />
              <YAxis
                yAxisId="l"
                tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v}
                tick={{ fontSize: 10, fill: C.gray }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="r"
                orientation="right"
                unit="%"
                tick={{ fontSize: 10, fill: C.gray }}
                tickLine={false}
                axisLine={false}
                domain={[0, "auto"]}
              />
              <Tooltip content={<ChartTip />} />
              <Bar
                yAxisId="l"
                dataKey="Installs"
                fill={C.blue + "28"}
                stroke={C.blue}
                strokeWidth={1}
                radius={[2, 2, 0, 0]}
              />
              <Line
                yAxisId="r"
                dataKey="CVR %"
                stroke={C.teal}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="r"
                dataKey="ATC %"
                stroke={C.amber}
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {/* ── Bottom row: funnel + source mix donut ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Full conversion funnel (reuse ClassicFunnel from Funnel tab) */}
        <div>
          <SectionHeader
            tone="purple"
            title="Full conversion funnel — active users to purchase"
            subtitle={`Overall CVR ${pct(
              (() => {
                const s = data?.funnel;
                const steps = Array.isArray(s) ? s : (s?.steps || []);
                const last = steps[steps.length - 1];
                return last?.overall_pct ?? 0;
              })()
            )}`}
          />
          <Card className="mt-2">
            <CardBody>
              <ClassicFunnel
                steps={(() => {
                  const s = data?.funnel;
                  return Array.isArray(s) ? s : (s?.steps || []);
                })()}
              />
            </CardBody>
          </Card>
        </div>

        {/* Source mix donut */}
        <div>
          <SectionHeader
            tone="teal"
            title="Install source mix — organic vs non-organic"
            subtitle={`Non-organic: ${
              sourceMix.filter(r => r.source?.toLowerCase() !== 'organic')
                       .reduce((s, r) => s + (r.installs || 0), 0) > 0
                ? pct(sourceMix.filter(r => r.source?.toLowerCase() !== 'organic')
                               .reduce((s, r) => s + (r.installs || 0), 0) / totalInstalls)
                : '—'
            } of installs`}
          />
          <Card className="mt-2">
            <CardBody>
              <div className="text-[12px] font-semibold mb-3">Install source breakdown</div>
              {sourceMix.length > 0 ? (
                <div className="flex items-center gap-6">
                  {/* Continuous donut — no paddingAngle, white stroke separates slices */}
                  <div className="flex-shrink-0">
                    <PieChart width={190} height={190}>
                      <Pie
                        data={sourceMix}
                        dataKey="installs"
                        nameKey="source"
                        cx="50%"
                        cy="50%"
                        innerRadius={56}
                        outerRadius={88}
                        paddingAngle={0}
                        stroke="#fff"
                        strokeWidth={2}
                        startAngle={90}
                        endAngle={-270}
                      >
                        {sourceMix.map((_, i) => (
                          <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v, name) => [`${fmt.num(v)} (${pct(v / totalInstalls)})`, name]}
                        contentStyle={{ fontSize: 11, borderRadius: 6, border: "1px solid #E8E7E0" }}
                      />
                    </PieChart>
                  </div>
                  {/* Legend */}
                  <div className="flex flex-col gap-2 min-w-0 flex-1">
                    {sourceMix.map((r, i) => {
                      const sharePct = r.installs / totalInstalls;
                      return (
                        <div key={r.source} className="flex items-center gap-2 text-[11px]">
                          <span
                            className="w-3 h-3 rounded-sm flex-shrink-0"
                            style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                          />
                          <span className="truncate text-text flex-1">{r.source}</span>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="w-16 h-1.5 bg-sc-gray-100 rounded overflow-hidden">
                              <div
                                style={{ width: `${Math.round(sharePct * 100)}%`, background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                                className="h-1.5 rounded"
                              />
                            </div>
                            <span className="font-mono font-semibold w-8 text-right">
                              {pct(sharePct, 0)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center text-muted text-sm">
                  No install source data for this period.
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP FUNNEL TAB — helpers
// ─────────────────────────────────────────────────────────────────────────────
const FUNNEL_COLORS = [C.blue, "#378ADD", C.purple, "#7F77DD", C.amber, "#EF9F27", C.green, C.teal, "#1D9E75"];

const DROP_TONES = { red: "#A32D2D", amber: "#854F0B", green: "#3B6D11" };
function dropTone(stepCvr, isBase) {
  if (isBase) return "neutral";
  const drop = 1 - (stepCvr ?? 1);
  if (drop >= 0.4) return "red";
  if (drop >= 0.2) return "amber";
  return "green";
}

/** ClassicFunnel — identical layout to the Web CR funnel tab.
 *  sqrt-scale keeps small steps visible without abrupt jumps.
 *  Only difference from the Web CR source: step_conversion → step_cvr.
 */
function ClassicFunnel({ steps }) {
  if (!steps?.length) return <div className="py-8 text-center text-muted text-sm">No funnel data</div>;

  const base = steps[0]?.count || 1;
  // sqrt scaling keeps small steps visible while preserving the funnel shape.
  const scale = (cnt) => Math.max(Math.sqrt(cnt / base), 0.08);

  const rowH = 56;
  const gap  = 4;
  const viewW = 560;
  const viewH = steps.length * (rowH + gap);
  const cx    = viewW / 2;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      width="100%"
      style={{ maxHeight: viewH, fontFamily: "inherit" }}
      role="img"
      aria-label="App conversion funnel active users to purchase"
    >
      <defs>
        <linearGradient id="af-funnel-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0.16" />
          <stop offset="40%"  stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {steps.map((s, i) => {
        const topW    = scale(s.count) * viewW;
        const nextCnt = steps[i + 1]?.count ?? s.count * 0.95;
        const botW    = scale(nextCnt) * viewW;
        const y       = i * (rowH + gap);
        const topLeft  = cx - topW / 2;
        const topRight = cx + topW / 2;
        const botLeft  = cx - botW / 2;
        const botRight = cx + botW / 2;
        const color   = FUNNEL_COLORS[i % FUNNEL_COLORS.length];
        const isBase  = i === 0;
        const isFinal = i === steps.length - 1;
        const drop    = isBase ? null : 1 - (s.step_cvr ?? 1);
        const tone    = dropTone(s.step_cvr, isBase);
        const dropColor = DROP_TONES[tone] || "#888780";

        return (
          <g key={s.step}>
            <path
              d={`M ${topLeft} ${y} L ${topRight} ${y} L ${botRight} ${y + rowH} L ${botLeft} ${y + rowH} Z`}
              fill={color}
            />
            <path
              d={`M ${topLeft} ${y} L ${topRight} ${y} L ${botRight} ${y + rowH} L ${botLeft} ${y + rowH} Z`}
              fill="url(#af-funnel-shine)"
              pointerEvents="none"
            />

            {/* Inline labels */}
            <text x={cx} y={y + rowH / 2 - 4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600">
              {s.step}
            </text>
            <text x={cx} y={y + rowH / 2 + 12} textAnchor="middle" fill="#fff" fontSize="11" opacity="0.95">
              {fmt.num(s.count)} · {fmt.pct(s.overall_pct, 1)}
            </text>

            {/* Left: drop-off pill */}
            {!isBase && (
              <g>
                <line
                  x1={topLeft} x2="56"
                  y1={y + rowH / 2} y2={y + rowH / 2}
                  stroke={dropColor} strokeWidth="1"
                  strokeDasharray={tone === "red" ? "" : "2 2"}
                />
                <rect
                  x="2" y={y + rowH / 2 - 9}
                  width="54" height="18" rx="3"
                  fill={tone === "red" ? dropColor : "#fff"}
                  stroke={dropColor} strokeWidth="1"
                />
                <text
                  x="29" y={y + rowH / 2 + 4}
                  textAnchor="middle" fontSize="10" fontWeight="700"
                  fill={tone === "red" ? "#fff" : dropColor}
                >
                  −{((drop ?? 0) * 100).toFixed(1)}%
                </text>
              </g>
            )}

            {/* Right: step CVR */}
            {!isBase && (
              <g>
                <line
                  x1={topRight} x2={viewW - 60}
                  y1={y + rowH / 2} y2={y + rowH / 2}
                  stroke="#D3D1C7" strokeWidth="1" strokeDasharray="2 2"
                />
                <text
                  x={viewW - 8} y={y + rowH / 2 + 4}
                  textAnchor="end" fontSize="11" fontWeight="600" fill={color}
                >
                  {fmt.pct(s.step_cvr, 1)}
                </text>
              </g>
            )}

            {/* Final CR pill on the right of last row */}
            {isFinal && (
              <g>
                <rect
                  x={viewW - 90} y={y + rowH / 2 - 9}
                  width="84" height="18" rx="9"
                  fill="#0F6E56"
                />
                <text
                  x={viewW - 48} y={y + rowH / 2 + 4}
                  textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff"
                >
                  FINAL CR {fmt.pct(s.overall_pct, 2)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Exact port of WebCR FunnelMetricsTable */
function FunnelMetricsTable({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="overflow-hidden border border-border rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-elevated">
          <tr>
            {["Step","Count","% of base","Step CR","Drop-off"].map((h) => (
              <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const isBase  = i === 0;
            const isFinal = i === steps.length - 1;
            const tone    = dropTone(s.step_cvr, isBase);
            return (
              <tr key={s.step}
                className={isFinal ? "bg-emerald-50/40 dark:bg-emerald-950/10 font-semibold" : i % 2 ? "" : "bg-elevated/30"}>
                <td className="px-3 py-2">
                  <span className="inline-block w-2 h-2 rounded-sm mr-2 align-middle"
                    style={{ background: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                  {s.step}
                </td>
                <td className="px-3 py-2 text-right font-mono">{fmt.num(s.count)}</td>
                <td className="px-3 py-2 text-right font-mono">{fmt.pct(s.overall_pct, 2)}</td>
                <td className="px-3 py-2 text-right font-mono">{isBase ? "—" : fmt.pct(s.step_cvr, 1)}</td>
                <td className="px-3 py-2 text-right">
                  {isBase ? <span className="text-muted">—</span>
                  : isFinal ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-sc-green-light text-sc-green">FINAL</span>
                  ) : (
                    <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                      tone === "red"   ? "bg-sc-red-light text-sc-red"
                      : tone === "amber" ? "bg-sc-amber-light text-sc-amber"
                      : "bg-sc-green-light text-sc-green")}>
                      −{fmt.pct(1 - (s.step_cvr ?? 0), 1)}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Single OS funnel column — mirrors WebCR DeviceFunnelColumn */
function OsFunnelColumn({ osData }) {
  if (!osData) return null;
  const isIOS    = osData.os?.toLowerCase().includes("ios");
  const color    = isIOS ? C.blue : C.teal;
  const bgCls    = isIOS ? "bg-sky-50 dark:bg-sky-950/20" : "bg-emerald-50 dark:bg-emerald-950/20";
  const txtCls   = isIOS ? "text-sky-700 dark:text-sky-400" : "text-emerald-700 dark:text-emerald-400";
  const steps    = osData.steps || [];

  return (
    <div>
      {/* OS header */}
      <div className={cn("flex items-center justify-between px-3 py-2 rounded-lg mb-3", bgCls)}>
        <span className={cn("text-xs font-semibold", txtCls)}>
          {isIOS ? "📱 iOS" : "🤖 Android"} — CVR {fmt.pct(osData.cvr, 2)}
        </span>
        <span className={cn("text-[11px]", txtCls)}>
          {fmt.num(osData.installs)} installs · {fmt.num(osData.dau)} active
        </span>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {steps.map((s, i) => {
          const w      = Math.max((s.overall_pct ?? 1) * 100, 1);
          const drop   = s.drop_pct ?? 0;
          const dropCl = drop > 0.4 ? "text-danger" : drop > 0.25 ? "text-warning" : "text-success";
          const isBase = i === 0;
          return (
            <div key={s.step}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-text-secondary">{s.step}</span>
                <span className="font-mono font-semibold">{fmt.num(s.count)}</span>
              </div>
              <div className="h-5 bg-elevated rounded relative overflow-hidden">
                <div
                  className="h-5 rounded flex items-center pl-2 text-[9px] font-semibold text-white"
                  style={{ width: `${w}%`, background: color }}
                >
                  {w > 12 ? `${(s.overall_pct * 100).toFixed(1)}%` : ""}
                </div>
              </div>
              {!isBase && drop > 0 && (
                <div className={cn("text-right text-[9px] font-semibold", dropCl)}>
                  −{(drop * 100).toFixed(1)}%
                </div>
              )}
              {isBase && (
                <div className="text-right text-[9px] text-muted">base</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP FUNNEL TAB
// ─────────────────────────────────────────────────────────────────────────────
function FunnelTab({ data }) {
  // Handle both old list shape (legacy) and new {installs, steps} shape
  const raw        = data.funnel;
  const steps      = Array.isArray(raw) ? raw : (raw?.steps || []);
  const installs   = Array.isArray(raw) ? (steps[0]?.count || 0) : (raw?.installs || 0);
  const osFunnel   = data.os_funnel || [];

  if (!steps.length) return <EmptyTab label="App Funnel" />;

  // First step = Active Users (DAU base), last step = Purchase
  const baseDau   = steps[0]?.count || 0;
  const finalStep = steps[steps.length - 1];
  const overallCR = baseDau ? finalStep.count / baseDau : 0;

  const biggestDrop = steps.slice(1).reduce(
    (m, s) => (s.drop_pct > m.drop_pct ? s : m),
    steps[1] || {},
  );
  const biggestDropIdx = steps.findIndex((s) => s.step === biggestDrop.step);
  const prevStepName   = biggestDropIdx > 0 ? steps[biggestDropIdx - 1]?.step : "";

  const iosData     = osFunnel.find((r) => r.os?.toLowerCase().includes("ios"));
  const androidData = osFunnel.find((r) =>
    r.os?.toLowerCase().includes("android") || r.os?.toLowerCase().includes("droid"),
  );

  return (
    <div className="space-y-6">

      {/* ── Full funnel ──────────────────────────────────────────────── */}
      <div className="space-y-2">
        <SectionHeader
          tone="purple"
          title="Full conversion funnel — active users to purchase"
          subtitle={`${fmt.num(installs)} installs · ${fmt.num(baseDau)} active users → ${fmt.num(finalStep?.count || 0)} purchases · session CVR ${fmt.pct(overallCR, 2)}`}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <div className="px-4 pt-3 pb-1 text-[12px] font-semibold">Funnel shape</div>
            <CardBody>
              <ClassicFunnel steps={steps} />
            </CardBody>
          </Card>

          <div className="space-y-3">
            <FunnelMetricsTable steps={steps} />

            {biggestDrop?.step && biggestDrop.drop_pct > 0 && (
              <div className="px-3 py-2 rounded-lg bg-warning-light border border-warning/20 text-warning text-xs">
                <strong>Biggest leak:</strong> {prevStepName} → {biggestDrop.step} loses{" "}
                <span className="font-mono font-semibold">−{fmt.pct(biggestDrop.drop_pct, 1)}</span> of users.
              </div>
            )}

            <div className="px-3 py-2 rounded-lg bg-accent-soft border border-accent/20 text-accent text-xs">
              <strong>Note:</strong> Funnel base = daily active users (app sessions).
              Install-to-purchase CVR ({fmt.pct(installs > 0 ? finalStep.count / installs : 0, 2)}) is shown in the KPI strip.
            </div>
          </div>
        </div>
      </div>

      {/* ── Funnel by OS — iOS vs Android ────────────────────────────── */}
      {(iosData || androidData) && (
        <div className="space-y-2">
          <SectionHeader
            tone="blue"
            title="Funnel by operating system — iOS vs Android comparison"
            subtitle="Step-by-step CVR divergence · % of active users"
          />
          <Card>
            <CardBody>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <OsFunnelColumn osData={iosData} />
                <OsFunnelColumn osData={androidData} />
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MEDIA SOURCES TAB
// ─────────────────────────────────────────────────────────────────────────────
// ─── channel colours — matches the AF HTML design ────────────────────────────
const CHANNEL_COLORS = [
  "#185FA5", // blue
  "#1D9E75", // teal-green
  "#534AB7", // purple
  "#EF9F27", // amber/orange
  "#A32D2D", // red
  "#854F0B", // brown
  "#0F6E56", // dark teal
  "#888780", // gray
];

// Custom tooltip matching the screenshot dark style
function MediaTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-sc-gray-900 text-white text-[11px] rounded-lg px-3 py-2.5 shadow-xl min-w-[160px]">
      <div className="font-semibold mb-2 text-sc-gray-200">{label}</div>
      {payload
        .filter((p) => p.value != null)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .map((p) => (
          <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} />
            <span className="opacity-75">{p.dataKey}:</span>
            <span className="font-mono font-semibold ml-auto pl-3">{p.value != null ? p.value.toFixed(1) : "—"}</span>
          </div>
        ))}
    </div>
  );
}

function MediaCvrTrendChart({ mediaTrend }) {
  const channels = mediaTrend?.channels || [];
  const rawRows  = mediaTrend?.rows     || [];

  if (!channels.length || !rawRows.length) return null;

  // Collect all non-null CVR values to compute a smart Y-axis max.
  // Use the 97th percentile so extreme outliers don't compress real lines.
  const allVals = rawRows
    .flatMap((r) => channels.map((ch) => r[ch]))
    .filter((v) => v != null && v > 0)
    .sort((a, b) => a - b);
  const p97     = allVals.length ? allVals[Math.floor(allVals.length * 0.97)] : 20;
  const yMax    = Math.ceil(Math.max(p97, 2) / 2) * 2; // round up to nearest 2%

  // Format date labels; cap CVR values at yMax so extreme outliers don't render
  const rows = rawRows.map((r) => {
    const out = { ...r, date: shortDate(r.date) };
    channels.forEach((ch) => {
      if (out[ch] != null) out[ch] = Math.min(+out[ch], yMax);
    });
    return out;
  });

  // Show ~8 evenly-spaced X axis labels
  const tickInterval = Math.max(1, Math.floor(rows.length / 8));

  // Dashed style for "Organic"-like channels (index ≥ 4 or name contains organic)
  const isDashed = (ch) => ch.toLowerCase().includes("organic") || ch.toLowerCase().includes("direct");

  return (
    <div className="space-y-2">
      <SectionHeader
        tone="blue"
        title="Media source CVR trend — rolling daily"
        subtitle={channels.join(" · ")}
      />
      <Card>
        <CardBody>
          <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
            <span className="text-[12px] font-semibold">Media source CVR % daily trend</span>
            {/* Legend matching screenshot — top-right */}
            <div className="flex flex-wrap gap-3">
              {channels.map((ch, i) => (
                <span key={ch} className="flex items-center gap-1.5 text-[10px] text-muted">
                  <span
                    className="flex-shrink-0"
                    style={{
                      display: "inline-block",
                      width: 24,
                      height: 2,
                      background: CHANNEL_COLORS[i % CHANNEL_COLORS.length],
                      borderTop: isDashed(ch)
                        ? `2px dashed ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`
                        : `2px solid ${CHANNEL_COLORS[i % CHANNEL_COLORS.length]}`,
                    }}
                  />
                  {ch}
                </span>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={rows} margin={{ top: 8, right: 48, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: C.gray }}
                tickLine={false}
                axisLine={{ stroke: "#E8E7E0" }}
                interval={tickInterval}
                padding={{ left: 8, right: 24 }}
                minTickGap={40}
              />
              <YAxis
                tick={{ fontSize: 10, fill: C.gray }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
                domain={[0, yMax]}
                allowDataOverflow
                width={38}
              />
              <Tooltip content={<MediaTrendTooltip />} />
              {channels.map((ch, i) => (
                <Line
                  key={ch}
                  type="monotone"
                  dataKey={ch}
                  stroke={CHANNEL_COLORS[i % CHANNEL_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                  strokeDasharray={isDashed(ch) ? "5 3" : undefined}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>
    </div>
  );
}

function CampaignRow({ r, i }) {
  return (
    <tr className={cn("border-b border-sc-gray-100 hover:bg-sc-gray-50 transition-colors", i % 2 === 1 && "bg-sc-gray-50/50")}>
      <td className="px-3 py-2 text-muted font-semibold text-[10px] w-8">{i + 1}</td>
      <td className="px-3 py-2 font-mono text-sc-blue text-[10px] max-w-[240px] truncate" title={r.campaign}>{r.campaign}</td>
      <td className="px-3 py-2">
        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sc-gray-100 text-sc-gray-600 font-semibold whitespace-nowrap">{r.channel_group}</span>
      </td>
      <td className="px-3 py-2 font-mono">{fmt.num(r.installs)}</td>
      <td className="px-3 py-2 font-mono">{fmt.num(r.orders)}</td>
      <td className="px-3 py-2"><CvrBadge v={r.cvr} /></td>
      <td className="px-3 py-2 font-mono font-semibold">{fmt.inr(r.revenue)}</td>
      <td className="px-3 py-2 font-mono">{fmt.inr(r.aov)}</td>
    </tr>
  );
}

function MediaSourcesTab({ data }) {
  const sources   = data.media_sources || [];
  const campaigns = data.campaigns     || [];

  return (
    <div className="space-y-5">
      <SectionHeader tone="teal" title="Media source performance · installs, CVR, revenue" subtitle="Sorted by revenue" />
      <Card>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-sc-gray-100 text-sc-gray-600">
                  {["Channel", "Installs", "DAU", "Orders", "Revenue", "CVR", "ATC Rate", "AOV"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((r, i) => (
                  <tr key={i} className={cn("border-b border-sc-gray-100 hover:bg-sc-gray-50", i % 2 === 1 && "bg-sc-gray-50/50")}>
                    <td className="px-3 py-2 font-medium">{r.channel_group}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(r.installs)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(r.dau)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(r.orders)}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{fmt.inr(r.revenue)}</td>
                    <td className="px-3 py-2"><CvrBadge v={r.cvr} /></td>
                    <td className="px-3 py-2 font-mono">{pct(r.atc_rate)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.inr(r.aov)}</td>
                  </tr>
                ))}
                {!sources.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No data.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <MediaCvrTrendChart mediaTrend={data.media_trend} />

      {campaigns.length > 0 && (
        <>
          <SectionHeader
            tone="coral"
            title="All campaigns · ranked by revenue"
            subtitle={`${campaigns.length} campaigns`}
          />
          <Card>
            <CardBody className="!p-0">
              <div className="overflow-x-auto overflow-y-auto max-h-[480px]">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr className="bg-sc-gray-100 text-sc-gray-600 sticky top-0 z-10">
                      {["#", "Campaign", "Channel", "Installs", "Orders", "CVR", "Revenue", "AOV"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap border-b border-sc-gray-200">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((r, i) => (
                      <CampaignRow key={i} r={r} i={i} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GEOGRAPHY TAB
// ─────────────────────────────────────────────────────────────────────────────
function GeoTab({ data }) {
  const rows = data.geo || [];
  const maxRev = Math.max(...rows.map((r) => r.revenue || 0), 1);

  return (
    <div className="space-y-5">
      <SectionHeader tone="red" title="Geographic conversion insights · country ranking" subtitle="By revenue" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardBody>
            <div className="text-[12px] font-semibold mb-3">Top countries by revenue</div>
            <div className="space-y-2">
              {rows.slice(0, 12).map((r, i) => (
                <div key={r.country} className="flex items-center gap-2 hover:bg-sc-gray-50 px-1 py-0.5 rounded">
                  <span className="w-5 text-[10px] font-bold text-muted text-center">{i + 1}</span>
                  <span className="text-[11px] min-w-[90px]">{r.country}</span>
                  <div className="flex-1 h-2 bg-sc-gray-100 rounded overflow-hidden">
                    <div style={{ width: `${((r.revenue || 0) / maxRev) * 100}%`, background: C.blue }} className="h-2 rounded" />
                  </div>
                  <span className="min-w-[72px] text-right font-mono text-[11px] font-semibold text-sc-blue">{fmt.inr(r.revenue)}</span>
                  <CvrBadge v={r.cvr} />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-[12px] font-semibold mb-3">Installs & CVR by country</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart
                data={rows.slice(0, 10).map((r) => ({ name: r.country, Installs: r.installs, "CVR %": r.cvr != null ? +(r.cvr * 100).toFixed(2) : 0 }))}
                layout="vertical"
                margin={{ top: 4, right: 50, left: 10, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E8E7E0" />
                <XAxis type="number" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10, fill: C.gray }} width={90} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTip />} />
                <Bar dataKey="Installs" fill={C.blue + "40"} stroke={C.blue} strokeWidth={1} radius={[0,2,2,0]} />
                <Line dataKey="CVR %" stroke={C.red} strokeWidth={2} dot={{ r: 3, fill: C.red }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardBody>
        </Card>
      </div>

      <SectionHeader tone="blue" title="Full country breakdown" />
      <Card>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-sc-gray-100 text-sc-gray-600">
                  {["#", "Country", "Installs", "DAU", "Orders", "Revenue", "CVR", "AOV"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={cn("border-b border-sc-gray-100 hover:bg-sc-gray-50", i % 2 === 1 && "bg-sc-gray-50/50")}>
                    <td className="px-3 py-2 text-muted font-bold">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{r.country}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(r.installs)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(r.dau)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(r.orders)}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{fmt.inr(r.revenue)}</td>
                    <td className="px-3 py-2"><CvrBadge v={r.cvr} /></td>
                    <td className="px-3 py-2 font-mono">{fmt.inr(r.aov)}</td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No data.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSTALLS & UNINSTALLS TAB
// ─────────────────────────────────────────────────────────────────────────────
function InstallsTab({ data }) {
  const trend      = data.install_trend       || [];
  const attribution = data.install_attribution || [];
  const curr       = data.overview?.current   || {};
  const deltas     = data.overview?.deltas    || {};

  const totalInstalls   = curr.installs   || 0;
  const totalUninstalls = curr.uninstalls || 0;
  const netInstalls     = totalInstalls - totalUninstalls;
  const uninstallRate   = totalInstalls > 0 ? totalUninstalls / totalInstalls : 0;

  const trendData = trend.map((r) => ({
    date:       shortDate(r.date),
    Installs:   r.installs,
    Uninstalls: r.uninstalls,
    Net:        r.net_installs,
    Organic:    r.organic_installs,
    Inorganic:  r.inorganic_installs,
  }));

  return (
    <div className="space-y-5">
      <SectionHeader tone="coral" title="Install & uninstall health · net app base growth" />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Gross Installs"  value={fmt.num(totalInstalls)}   delta={deltas.installs} />
        <KpiCard label="Uninstalls"       value={fmt.num(totalUninstalls)} delta={deltas.uninstalls} positiveIsBad />
        <KpiCard label="Net Installs"     value={fmt.num(netInstalls)}     delta={null} />
        <KpiCard label="Uninstall Rate"   value={pct(uninstallRate)}       delta={null} positiveIsBad />
      </div>

      <SectionHeader tone="blue" title="Daily installs vs uninstalls · net growth" />
      <Card>
        <CardBody>
          <ResponsiveContainer width="100%" height={240}>
            <ComposedChart data={trendData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(trendData.length / 7) - 1)} />
              <YAxis tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Installs"   fill={C.blue + "28"} stroke={C.blue} strokeWidth={1} radius={[2,2,0,0]} />
              <Bar dataKey="Uninstalls" fill={C.red  + "28"} stroke={C.red}  strokeWidth={1} radius={[2,2,0,0]} />
              <Line dataKey="Net" stroke={C.teal} strokeWidth={2.5} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 flex-wrap">
            {[{ c: C.blue, l: "Installs" }, { c: C.red, l: "Uninstalls" }, { c: C.teal, l: "Net" }].map(({ c, l }) => (
              <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                <span style={{ background: c }} className="w-2.5 h-2.5 rounded-sm" />{l}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      <SectionHeader tone="green" title="Organic vs inorganic installs" />
      <Card>
        <CardBody>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={trendData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} interval={Math.max(0, Math.floor(trendData.length / 7) - 1)} />
              <YAxis tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="Organic"   fill={C.green  + "40"} stroke={C.green}  strokeWidth={1} radius={[2,2,0,0]} />
              <Bar dataKey="Inorganic" fill={C.purple + "40"} stroke={C.purple} strokeWidth={1} radius={[2,2,0,0]} />
            </ComposedChart>
          </ResponsiveContainer>
        </CardBody>
      </Card>

      {attribution.length > 0 && (
        <>
          <SectionHeader tone="amber" title="Install attribution by channel" />
          <Card>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-sc-gray-100 text-sc-gray-600">
                      {["Channel", "Installs", "Uninstalls", "Uninstall Rate"].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {attribution.map((r, i) => (
                      <tr key={i} className={cn("border-b border-sc-gray-100", i % 2 === 1 && "bg-sc-gray-50/50")}>
                        <td className="px-3 py-2 font-medium">{r.source}</td>
                        <td className="px-3 py-2 font-mono">{fmt.num(r.installs)}</td>
                        <td className="px-3 py-2 font-mono">{fmt.num(r.uninstalls)}</td>
                        <td className="px-3 py-2">
                          <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                            (r.uninstall_rate || 0) > 0.4 ? "bg-sc-red-light text-sc-red"
                            : (r.uninstall_rate || 0) > 0.2 ? "bg-sc-amber-light text-sc-amber"
                            : "bg-sc-green-light text-sc-green",
                          )}>
                            {pct(r.uninstall_rate)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// APP VERSIONS TAB
// ─────────────────────────────────────────────────────────────────────────────
const VERSION_COLORS = [C.green, C.blue, C.purple, C.amber, C.teal, C.coral, C.red, C.gray];

function VersionsTab({ data }) {
  const versions = data.app_versions || [];
  const maxDAU   = Math.max(...versions.map((v) => v.dau || 0), 1);

  return (
    <div className="space-y-5">
      <SectionHeader tone="purple" title="App version analytics · DAU, CVR, ATC" />

      {versions.length > 0 && (
        <Card>
          <CardBody>
            <div className="text-[12px] font-semibold mb-3">Version DAU share</div>
            <div className="space-y-2">
              {versions.slice(0, 8).map((v, i) => {
                const color = VERSION_COLORS[i % VERSION_COLORS.length];
                return (
                  <div key={v.app_version} className="flex items-center gap-3">
                    <span className="font-mono text-[10px] min-w-[72px]" style={{ color }}>{v.app_version}</span>
                    <div className="flex-1 h-3 bg-sc-gray-100 rounded overflow-hidden">
                      <div
                        style={{ width: `${((v.dau || 0) / maxDAU) * 100}%`, background: color + "55", borderLeft: `3px solid ${color}` }}
                        className="h-3 rounded"
                      />
                    </div>
                    <span className="font-mono text-[11px] min-w-[52px] text-right font-semibold">{fmt.num(v.dau)}</span>
                    <CvrBadge v={v.cvr} />
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      )}

      <SectionHeader tone="blue" title="CVR & ATC rate by version" />
      <Card>
        <CardBody>
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={versions.slice(0, 10).map((v) => ({
                version:    v.app_version,
                "CVR %":    v.cvr     != null ? +(v.cvr     * 100).toFixed(2) : 0,
                "ATC Rate": v.atc_rate != null ? +(v.atc_rate * 100).toFixed(2) : 0,
                DAU:        v.dau,
              }))}
              margin={{ top: 4, right: 50, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
              <XAxis dataKey="version" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} unit="%" />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: C.gray }} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar yAxisId="r" dataKey="DAU" fill={C.blue + "28"} stroke={C.blue} strokeWidth={1} radius={[2,2,0,0]} />
              <Line yAxisId="l" dataKey="CVR %"    stroke={C.teal}  strokeWidth={2.5} dot={{ r: 4, fill: C.teal }} />
              <Line yAxisId="l" dataKey="ATC Rate" stroke={C.amber} strokeWidth={2}   dot={{ r: 3, fill: C.amber }} strokeDasharray="4 2" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="flex gap-4 mt-2 flex-wrap">
            {[{ c: C.blue, l: "DAU" }, { c: C.teal, l: "CVR %" }, { c: C.amber, l: "ATC Rate" }].map(({ c, l }) => (
              <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                <span style={{ background: c }} className="w-2.5 h-2.5 rounded-sm" />{l}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      <SectionHeader tone="coral" title="Per-version performance matrix" />
      <Card>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-sc-gray-100 text-sc-gray-600">
                  {["Version", "DAU", "Installs", "Orders", "Revenue", "CVR", "ATC Rate", "AOV"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {versions.map((v, i) => (
                  <tr key={i} className={cn("border-b border-sc-gray-100 hover:bg-sc-gray-50", i % 2 === 1 && "bg-sc-gray-50/50")}>
                    <td className="px-3 py-2 font-mono font-semibold text-sc-purple">{v.app_version}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(v.dau)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(v.installs)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.num(v.orders)}</td>
                    <td className="px-3 py-2 font-mono font-semibold">{fmt.inr(v.revenue)}</td>
                    <td className="px-3 py-2"><CvrBadge v={v.cvr} /></td>
                    <td className="px-3 py-2 font-mono">{pct(v.atc_rate)}</td>
                    <td className="px-3 py-2 font-mono">{fmt.inr(v.aov)}</td>
                  </tr>
                ))}
                {!versions.length && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No data.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: Coming-soon placeholder
// ─────────────────────────────────────────────────────────────────────────────
function EmptyTab({ label }) {
  const meta = APP_CR_TABS.find((t) => t.label === label);
  return (
    <Card className="p-10 flex flex-col items-center justify-center text-center">
      <div className="w-3 h-3 rounded-sm mb-3" style={{ background: meta?.color }} />
      <div className="text-sm font-semibold text-text mb-1">{label}</div>
      <div className="text-xs text-muted max-w-sm">Coming soon — this tab will surface {label.toLowerCase()} metrics in a future update.</div>
    </Card>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: CVR colour badge
// ─────────────────────────────────────────────────────────────────────────────
function CvrBadge({ v }) {
  return (
    <span className={cn(
      "text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
      v > 0.05 ? "bg-sc-green-light text-sc-green"
      : v > 0.02 ? "bg-sc-blue-light text-sc-blue"
      : "bg-sc-amber-light text-sc-amber",
    )}>
      {pct(v)}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AppCRPage({ startDate, endDate, compareStart, compareEnd, hasComparison = false }) {
  const [tab, setTab] = useState("overview");

  const { data, loading, initialLoading, error, aiSummary, aiPending } = useAppCR({
    startDate,
    endDate,
    compareStart,
    compareEnd,
  });

  const { current = {}, deltas = {} } = data?.overview || {};

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">

      {/* ── Tab bar — sticky at top, identical pattern to WebCrTabs ── */}
      <AppCRTabs active={tab} onChange={setTab} />

      {/* ── Body ── */}
      <div className="mt-4 space-y-5">

        {/* AI Flash */}
        <AIFlash
          title="AppsFlyer AI insights"
          summary={aiSummary}
          pending={aiPending}
          loading={loading}
        />

        {/* Error banner */}
        {error && (
          <div className="px-4 py-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-sm">
            {error}
          </div>
        )}

        {/* Initial skeleton — no data yet */}
        {initialLoading && (
          <div className="flex items-center justify-center py-20 gap-3 text-muted text-sm">
            <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            Loading App CR data…
          </div>
        )}

        {/* KPI strip + tab content — wrapped in LoadingOverlay for re-fetches */}
        {data && (
          <LoadingOverlay loading={loading} label="Refreshing…">
            {/* KPI Strip */}
            <div className="mb-5">
              <SectionHeader
                tone="blue"
                title="Key metrics · AppsFlyer session data"
                subtitle={`${startDate} → ${endDate}`}
                className="mb-2"
              />
              <KpiStrip curr={current} deltas={deltas} hasComparison={hasComparison} />
            </div>

            {/* Tab content */}
            <div>
              {tab === "overview"  && <OverviewTab      data={data} startDate={startDate} endDate={endDate} />}
              {tab === "funnel"    && <FunnelTab         data={data} />}
              {tab === "media"     && <MediaSourcesTab   data={data} />}
              {tab === "retarget"  && <EmptyTab label="Retargeting" />}
              {tab === "cohorts"   && <EmptyTab label="Cohorts" />}
              {tab === "geo"       && <GeoTab            data={data} />}
              {tab === "installs"  && <InstallsTab       data={data} />}
              {tab === "versions"  && <VersionsTab       data={data} />}
            </div>
          </LoadingOverlay>
        )}
      </div>
    </div>
  );
}
