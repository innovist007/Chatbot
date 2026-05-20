import { useState, useMemo, useEffect } from "react";
import { useAcquisition } from "@/hooks/useAcquisition";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
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

const SEVEN_ROW_MAX_HEIGHT = 300;

const METRIC_OPTIONS = [
  { value: "spend",  label: "Spends" },
  { value: "roas",   label: "ROAS" },
  { value: "cpm",    label: "CPM" },
  { value: "cpc",    label: "CPC" },
  { value: "ctr",    label: "CTR" },
];

const GRANULARITY_OPTIONS = [
  { value: "day",   label: "DoD" },
  { value: "week",  label: "WoW" },
  { value: "month", label: "MoM" },
];

const COMPARE_OPTIONS = [
  { value: "DoD", label: "DoD" },
  { value: "WoW", label: "WoW" },
  { value: "MoM", label: "MoM" },
];

const FUNNEL_COLORS = ["#534AB7", "#185FA5", "#2D7BC9", "#1D9E75", "#0F6E56", "#3B6D11"];

// ------------------------------------------------------------------ helpers
function roasTone(v)  { return v == null ? "neutral" : v >= 3 ? "green" : v >= 1.5 ? "accent" : "amber"; }
function ctrTone(v)   { return v == null ? "neutral" : v >= 0.02 ? "green" : v >= 0.01 ? "accent" : "amber"; }
function deltaTone(v) { return v == null ? "neutral" : v > 0.005 ? "green" : v < -0.005 ? "red" : "neutral"; }

function SegmentGroup({ value, onChange, options, size = "sm" }) {
  return (
    <div className="flex items-center gap-0.5 bg-elevated rounded p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)}
          className={cn("rounded transition-colors font-medium",
            size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
            value === o.value ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}
        >{o.label}</button>
      ))}
    </div>
  );
}

function FilterPills({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[11px] text-muted font-medium shrink-0">{label}</span>
      {["All", ...(options || [])].map((opt) => {
        const isActive = opt === "All" ? value === null : value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt === "All" ? null : opt)}
            className={cn("px-2.5 py-0.5 text-[11px] font-medium rounded-full border transition-colors",
              isActive ? "bg-sc-blue text-white border-sc-blue" : "bg-surface text-text-secondary border-border hover:border-sc-blue hover:text-sc-blue")}
          >{opt}</button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------ KPI strip (7 cards)
function KpiStrip({ kpis, loading, initialLoading, compareMode }) {
  const c = kpis?.current || {};
  const d = kpis?.deltas || {};
  const cards = [
    { label: "Spend",          value: fmt.inr(c.spend),                                      delta: d.spend },
    { label: "Revenue (Attr.)", value: fmt.inr(c.revenue),                                   delta: d.revenue },
    { label: "ROAS",           value: c.roas != null ? c.roas.toFixed(2) + "×" : "—",        delta: d.roas },
    { label: "CPM",            value: fmt.inr(c.cpm),                                        delta: d.cpm },
    { label: "CTR",            value: fmt.pct(c.ctr, 2),                                     delta: d.ctr },
    { label: "CPC",            value: fmt.inr(c.cpc),                                        delta: d.cpc },
    { label: "New Customers",  value: fmt.num(c.new_customers),                              delta: d.new_customers },
  ];
  if (initialLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map((_, i) => <div key={i} className="skeleton h-24 rounded-lg" />)}
      </div>
    );
  }
  return (
    <LoadingOverlay loading={loading}>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        {cards.map(({ label, value, delta }) => (
          <KpiCard key={label} label={label} value={value} delta={delta} compareLabel={compareMode} />
        ))}
      </div>
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ funnel CVR (horizontal bars)
function FunnelCVR({ funnel, loading, initialLoading }) {
  if (initialLoading) return <div className="skeleton h-56" />;
  const steps = funnel?.steps || [];

  // log₁₀ scale so small steps (Clicks vs Impressions) still render as wide bars
  const maxLog = steps[0]?.value > 0 ? Math.log10(steps[0].value) : 1;
  const logPct = (v) => (v > 0 ? (Math.log10(v) / maxLog) * 100 : 0);

  const CTR_BENCHMARK = 0.023;
  const ATC_BENCHMARK = 0.18;

  return (
    <LoadingOverlay loading={loading}>
      <div className="space-y-2">
        {steps.map((step, i) => {
          const pct   = logPct(step.value);
          const color = FUNNEL_COLORS[i];
          const isBelowBench =
            (step.label === "Clicks" && step.rate < CTR_BENCHMARK) ||
            (step.label === "ATC"    && step.rate < ATC_BENCHMARK);
          // show value inside bar when bar is wide enough, otherwise after it
          const valueInside = pct >= 20;

          return (
            <div key={step.label} className="flex items-center gap-3">
              <div className="w-24 text-xs text-text-secondary text-right shrink-0 font-medium">
                {step.label}
              </div>
              <div className="flex-1 relative h-9 bg-elevated rounded">
                {/* bar */}
                <div
                  className="absolute left-0 top-0 h-full rounded flex items-center pl-3"
                  style={{ width: `${pct}%`, background: color, minWidth: step.value > 0 ? 4 : 0 }}
                >
                  {valueInside && (
                    <span className="text-white text-xs font-bold tnum whitespace-nowrap">
                      {fmt.num(step.value)}
                    </span>
                  )}
                </div>
                {/* value outside bar when it's too narrow */}
                {!valueInside && step.value > 0 && (
                  <span
                    className="absolute top-0 h-full flex items-center pl-2 text-text text-xs font-bold tnum whitespace-nowrap"
                    style={{ left: `${pct}%` }}
                  >
                    {fmt.num(step.value)}
                  </span>
                )}
              </div>
              <div className="w-56 text-xs shrink-0 leading-snug">
                {isBelowBench ? (
                  <span className="text-danger font-medium">{step.note}</span>
                ) : (
                  <span className="text-text-secondary">{step.note}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ fatigued ads table
function getAdStatus(freq, daysLive) {
  if (freq >= 4.5 || daysLive >= 35) return "Dead";
  if (freq >= 3.0 || daysLive >= 21) return "Fatigue";
  return "Active";
}
function getVerdict(status, daysLive) {
  if (status === "Dead") return "Replace";
  if (daysLive > 25) return "Pause";
  if (daysLive > 20) return "Refresh";
  return "Refresh soon";
}
function actionLabel(verdict) {
  if (verdict === "Replace") return "Replace now";
  if (verdict === "Pause")   return "Pause now";
  if (verdict === "Refresh") return "Refresh creative";
  return "Queue refresh";
}

function DeltaCell({ value, positiveIsBad = false }) {
  if (value == null) return <span className="text-muted">—</span>;
  const isUp = value > 0;
  const isBad = positiveIsBad ? isUp : !isUp;
  const pct = (value * 100).toFixed(0);
  return (
    <span className={cn("tnum text-xs font-semibold", isBad ? "text-danger" : "text-success")}>
      {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{pct}%
    </span>
  );
}

function FatiguedAds({ rows, loading, initialLoading }) {
  // useMemo MUST be before any conditional return (React Rules of Hooks)
  const columns = useMemo(() => [
    {
      key: "ad_name",
      label: "Ad Name",
      render: (r) => (
        <div className="min-w-0 max-w-[200px]">
          <div className="font-medium text-xs text-text truncate" title={r.ad_name}>{r.ad_name}</div>
          {(r.creative_type || r.language) && (
            <div className="text-[10px] text-muted truncate">
              {[r.creative_type, r.language && `creator @${r.language}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (r) => (
        <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded",
          r.status === "Dead"    ? "bg-sc-red-light text-sc-red" :
          r.status === "Fatigue" ? "bg-sc-amber-light text-sc-amber" :
          "bg-elevated text-muted")}
        >{r.status}</span>
      ),
    },
    { key: "days_live", label: "Days Live", align: "right",
      render: (r) => <span className={cn("tnum text-xs font-semibold", r.days_live >= 28 ? "text-danger" : r.days_live >= 14 ? "text-sc-amber" : "text-text")}>{r.days_live}d</span> },
    { key: "frequency", label: "Freq", align: "right",
      render: (r) => <span className={cn("tnum text-xs font-semibold", r.frequency >= 4 ? "text-danger" : r.frequency >= 3 ? "text-sc-amber" : "text-text")}>{(r.frequency ?? 0).toFixed(1)}</span> },
    { key: "ctr_delta_7d", label: "CTR Δ7d", align: "right", render: (r) => <DeltaCell value={r.ctr_delta_7d} positiveIsBad={false} /> },
    { key: "cpm_delta_7d", label: "CPM Δ7d", align: "right", render: (r) => <DeltaCell value={r.cpm_delta_7d} positiveIsBad={true}  /> },
    { key: "roas",    label: "ROAS",    align: "right",
      render: (r) => <Pill tone={roasTone(r.roas)} className="text-[10px] tnum">{r.roas != null ? r.roas.toFixed(2) + "×" : "—"}</Pill> },
    { key: "spend",   label: "Spend",   align: "right",
      render: (r) => <span className="text-text tnum font-mono">{fmt.inr(r.spend)}</span> },
    { key: "true_cm", label: "True CM", align: "right",
      render: () => <span className="text-muted">—</span> },
    { key: "verdict", label: "Verdict", align: "right",
      render: (r) => (
        <span className={cn("text-xs font-semibold",
          r.verdict === "Replace" || r.verdict === "Pause" ? "text-sc-red" :
          r.verdict === "Refresh" ? "text-sc-amber" : "text-muted")}>{r.verdict}</span>
      ),
    },
    { key: "action", label: "Action", align: "right",
      render: (r) => {
        const urgent  = r.verdict === "Replace" || r.verdict === "Pause";
        const refresh = r.verdict === "Refresh";
        return (
          <button className={cn(
            "text-[10px] font-semibold px-2.5 py-1 rounded whitespace-nowrap",
            urgent  ? "bg-sc-red text-white"     :
            refresh ? "bg-sc-amber text-white"   :
                      "bg-sc-gray-400 text-white",
          )}>
            {actionLabel(r.verdict)}
          </button>
        );
      },
    },
  ], []);

  if (initialLoading) return <div className="skeleton h-56" />;

  const enriched = (rows || []).map((r) => {
    const status  = getAdStatus(r.frequency, r.days_live);
    const verdict = getVerdict(status, r.days_live);
    return { ...r, status, verdict };
  });

  const deadRows    = enriched.filter((r) => r.status === "Dead");
  const fatigueRows = enriched.filter((r) => r.status === "Fatigue");
  const deadSpend   = deadRows.reduce((s, r) => s + (r.spend || 0), 0);
  const fatSpend    = fatigueRows.reduce((s, r) => s + (r.spend || 0), 0);

  return (
    <LoadingOverlay loading={loading}>
      <DataTable
        columns={columns}
        rows={enriched}
        getRowKey={(r) => `${r.campaign_name}_${r.ad_name}`}
        maxHeight={SEVEN_ROW_MAX_HEIGHT}
      />
      {(deadRows.length > 0 || fatigueRows.length > 0) && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {deadRows.length > 0 && (
            <div className="px-3 py-2.5 bg-sc-red-light border border-sc-red/20 rounded-lg text-xs text-sc-red leading-relaxed">
              <span className="font-bold">Dead ({deadRows.length} ads · {fmt.inr(deadSpend)}) → </span>
              {fmt.inr(deadSpend)}/mo wasted at low ROAS. Pause immediately and replace with fresh UGC briefs.
            </div>
          )}
          {fatigueRows.length > 0 && (
            <div className="px-3 py-2.5 bg-sc-amber-light border border-sc-amber/20 rounded-lg text-xs text-sc-amber leading-relaxed">
              <span className="font-bold">Fatigue ({fatigueRows.length} ads · {fmt.inr(fatSpend)}) → </span>
              CTR declining, CPM rising. Brief refresh variants recommended within 7 days.
            </div>
          )}
        </div>
      )}
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ trend chart
function TrendChart({ rows, metric }) {
  if (!rows?.length) return <div className="py-8 text-center text-muted text-sm">No data</div>;
  const showRoasLine = metric !== "roas";
  const data = rows.map((r) => ({
    date:    r.date?.slice(5) ?? r.date,
    spend:   +(r.spend   ?? 0).toFixed(0),
    roas:    +(r.roas    ?? 0).toFixed(2),
    cpm:     +(r.cpm     ?? 0).toFixed(2),
    cpc:     +(r.cpc     ?? 0).toFixed(2),
    ctr:     +(((r.ctr   ?? 0) * 100).toFixed(2)),
    revenue: +(r.revenue ?? 0).toFixed(0),
    orders:  r.orders ?? 0,
  }));
  const metricKey = metric;
  const leftFmt = (v) => {
    if (metric === "spend" || metric === "cpm" || metric === "cpc") return fmt.inr(v);
    if (metric === "ctr") return v + "%";
    return v + "×";
  };
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 10, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e5e5e5" vertical={false} />
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#737373" }} stroke="#d4d4d4" tickLine={false} interval="preserveStartEnd" />
        <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={leftFmt} stroke="transparent" tickLine={false} axisLine={false} width={58} />
        {showRoasLine && (
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={(v) => v + "×"} stroke="transparent" tickLine={false} axisLine={false} width={36} domain={[0, (max) => Math.max(max * 1.2, 1)]} />
        )}
        <Tooltip isAnimationActive={false} cursor={{ fill: "rgba(24,95,165,0.06)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload;
            return (
              <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs" style={{ pointerEvents: "none" }}>
                <div className="text-muted mb-1.5 font-medium">{label}</div>
                <div className="flex gap-2 mb-0.5"><span className="text-text-secondary">Spend:</span><span className="tnum font-semibold">{fmt.inr(row.spend)}</span></div>
                <div className="flex gap-2 mb-0.5"><span className="text-text-secondary">ROAS:</span><span className="tnum font-semibold">{row.roas}×</span></div>
                <div className="flex gap-2"><span className="text-text-secondary">Orders:</span><span className="tnum font-semibold">{fmt.num(row.orders)}</span></div>
              </div>
            );
          }}
        />
        <Bar yAxisId="left" dataKey={metricKey} fill="#534AB7" opacity={0.85} radius={[2, 2, 0, 0]} isAnimationActive={false} />
        {showRoasLine && <Line yAxisId="right" dataKey="roas" stroke="#185FA5" strokeWidth={2} dot={false} isAnimationActive={false} strokeDasharray="4 2" />}
      </ComposedChart>
    </ResponsiveContainer>
  );
}

// ------------------------------------------------------------------ trend section (self-contained)
function TrendSection({ startDate, endDate, filterOpts }) {
  const [granularity, setGranularity] = useState("day");
  const [metric, setMetric]           = useState("spend");
  const [creative, setCreative]       = useState(null);
  const [brand, setBrand]             = useState(null);
  const [language, setLanguage]       = useState(null);
  const [campaign, setCampaign]       = useState(null);
  const [adName, setAdName]           = useState(null);
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(false);
  const [initialLoading, setInit]     = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!rows.length) setInit(true); else setLoading(true);
    api.acquisition.trend(
      { startDate, endDate, creativeTypes: creative ? [creative] : undefined, brands: brand ? [brand] : undefined, languages: language ? [language] : undefined, campaigns: campaign ? [campaign] : undefined, adNames: adName ? [adName] : undefined },
      granularity,
    ).then((d) => { if (!cancelled) setRows(d); }).catch(() => {}).finally(() => { if (!cancelled) { setLoading(false); setInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, granularity, creative, brand, language, campaign, adName]);

  const granLabel   = GRANULARITY_OPTIONS.find((o) => o.value === granularity)?.label ?? "DoD";
  const metricLabel = METRIC_OPTIONS.find((o) => o.value === metric)?.label ?? "Spends";

  return (
    <div className="space-y-2">
      <SectionHeader title={`Performance trend · Meta · ${metricLabel} · ${granLabel}`} subtitle="Platform reported · conversion campaigns only" tone="purple"
        actions={<span className="flex items-center gap-1 text-[10px] text-muted"><span className="w-1.5 h-1.5 rounded-full bg-sc-green inline-block" />Meta API · live</span>}
      />
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted font-medium">Granularity</span>
              <SegmentGroup value={granularity} onChange={setGranularity} options={GRANULARITY_OPTIONS} size="xs" />
            </div>
            <div className="w-px h-4 bg-border" />
            <FilterPills label="Creative" options={filterOpts.creative_types} value={creative} onChange={setCreative} />
            <div className="w-px h-4 bg-border" />
            <FilterPills label="Brand" options={filterOpts.brands} value={brand} onChange={setBrand} />
            <div className="w-px h-4 bg-border" />
            <FilterPills label="Language" options={filterOpts.languages} value={language} onChange={setLanguage} />
            <div className="ml-auto flex items-center gap-1.5">
              <span className="text-[11px] text-muted font-medium">Metric</span>
              <select value={metric} onChange={(e) => setMetric(e.target.value)}
                className="text-xs border border-border rounded px-2 py-1 bg-surface text-text outline-none cursor-pointer hover:border-sc-blue transition-colors">
                {METRIC_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-muted font-medium">Filters ›</span>
            <span className="text-muted">Campaign:</span>
            <select value={campaign ?? ""} onChange={(e) => setCampaign(e.target.value || null)}
              className="border border-border rounded px-2 py-0.5 bg-surface text-text text-[11px] outline-none max-w-[180px] hover:border-sc-blue transition-colors">
              <option value="">All campaigns</option>
              {(filterOpts.campaigns || []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-muted">Ad:</span>
            <select value={adName ?? ""} onChange={(e) => setAdName(e.target.value || null)}
              className="border border-border rounded px-2 py-0.5 bg-surface text-text text-[11px] outline-none max-w-[180px] hover:border-sc-blue transition-colors">
              <option value="">All ads</option>
              {(filterOpts.ad_names || []).map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            {(campaign || adName || creative || brand || language) && (
              <button onClick={() => { setCampaign(null); setAdName(null); setCreative(null); setBrand(null); setLanguage(null); }} className="text-[11px] text-sc-red hover:underline">Clear filters</button>
            )}
          </div>
          {initialLoading ? <div className="skeleton h-64" /> : (
            <LoadingOverlay loading={loading}><TrendChart rows={rows} metric={metric} /></LoadingOverlay>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ performance table (self-contained)
function TableSection({ startDate, endDate, filterOpts, compareMode: propCompare }) {
  const [level, setLevel]         = useState("campaign");
  const [compareMode, setCompare] = useState(propCompare || "MoM");
  const [creative, setCreative]   = useState(null);
  const [brand, setBrand]         = useState(null);
  const [language, setLanguage]   = useState(null);
  const [campaign, setCampaign]   = useState(null);
  const [adName, setAdName]       = useState(null);
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [initialLoading, setInit] = useState(true);

  useEffect(() => { setCompare(propCompare || "MoM"); }, [propCompare]);

  useEffect(() => {
    let cancelled = false;
    if (!rows.length) setInit(true); else setLoading(true);
    api.acquisition.table(
      { startDate, endDate, creativeTypes: creative ? [creative] : undefined, brands: brand ? [brand] : undefined, languages: language ? [language] : undefined, campaigns: campaign ? [campaign] : undefined, adNames: adName ? [adName] : undefined },
      level, compareMode,
    ).then((d) => { if (!cancelled) setRows(d); }).catch(() => {}).finally(() => { if (!cancelled) { setLoading(false); setInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, level, compareMode, creative, brand, language, campaign, adName]);

  const columns = useMemo(() => [
    { key: "name", label: level === "campaign" ? "Campaign" : "Ad",
      render: (r) => (
        <div className="min-w-0">
          <div className="font-mono text-[11px] font-medium text-sc-blue truncate max-w-[200px]" title={r.name}>{r.name}</div>
          {level === "ad" && r.campaign && <div className="text-[10px] text-muted truncate max-w-[200px]">{r.campaign}</div>}
        </div>
      ),
    },
    { key: "stage", label: "Stage", render: (r) => r.stage ? <span className="text-xs text-text-secondary">{r.stage}</span> : <span className="text-muted">—</span> },
    { key: "spend",          label: "Spend",      align: "right", mono: true, render: (r) => fmt.inr(r.spend) },
    { key: "roas",           label: "ROAS",       align: "right", render: (r) => <Pill tone={roasTone(r.roas)} className="text-[10px] tnum">{r.roas != null ? r.roas.toFixed(2) + "×" : "—"}</Pill> },
    { key: "orders",         label: "Orders",     align: "right", mono: true, render: (r) => fmt.num(r.orders) },
    { key: "aov",            label: "AOV",        align: "right", mono: true, render: (r) => fmt.inr(r.aov) },
    { key: "disc_pct",       label: "Disc %",     align: "right", render: (r) => r.disc_pct != null ? fmt.pct(r.disc_pct, 1) : "—" },
    { key: "new_pct",        label: "New %",      align: "right", render: (r) => r.new_pct != null ? fmt.pct(r.new_pct, 1) : "—" },
    { key: "prepaid_pct",    label: "Prepaid %",  align: "right", render: (r) => r.prepaid_pct != null ? fmt.pct(r.prepaid_pct, 1) : "—" },
    { key: "rto_pct",        label: "RTO %",      align: "right", render: (r) => r.rto_pct != null ? fmt.pct(r.rto_pct, 1) : "—" },
    { key: "cac",            label: "CAC",        align: "right", mono: true, render: (r) => fmt.inr(r.cac) },
    { key: "repeat_30d_pct", label: "Repeat 30d", align: "right", render: (r) => r.repeat_30d_pct != null ? fmt.pct(r.repeat_30d_pct, 1) : "—" },
    { key: "true_cm",        label: "True CM",    align: "right", render: () => <span className="text-muted">—</span> },
    {
      key: "spend_delta", label: `${compareMode} Δ`, align: "right",
      render: (r) => {
        const v = r.spend_delta;
        if (v == null) return <span className="text-muted">—</span>;
        return <span className={cn("tnum text-xs font-semibold", v > 0 ? "text-success" : "text-danger")}>{v >= 0 ? "+" : ""}{(v * 100).toFixed(1)}%</span>;
      },
    },
  ], [level, compareMode]);

  return (
    <div className="space-y-2">
      <SectionHeader title="Performance table — campaign / ad set / ad level" subtitle="Filter via columns above · click row to drill into ad" tone="blue" />
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted font-medium">Compare</span>
              <SegmentGroup value={compareMode} onChange={setCompare} options={COMPARE_OPTIONS} size="xs" />
            </div>
            <div className="w-px h-4 bg-border" />
            <FilterPills label="Creative" options={filterOpts.creative_types} value={creative} onChange={setCreative} />
            <div className="w-px h-4 bg-border" />
            <FilterPills label="Brand" options={filterOpts.brands} value={brand} onChange={setBrand} />
            <div className="w-px h-4 bg-border" />
            <FilterPills label="Language" options={filterOpts.languages} value={language} onChange={setLanguage} />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-muted font-medium">Search ›</span>
              <select value={campaign ?? ""} onChange={(e) => setCampaign(e.target.value || null)}
                className="border border-border rounded px-2 py-0.5 bg-surface text-text text-[11px] outline-none max-w-[180px] hover:border-sc-blue transition-colors">
                <option value="">Campaign name...</option>
                {(filterOpts.campaigns || []).map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={adName ?? ""} onChange={(e) => setAdName(e.target.value || null)}
                className="border border-border rounded px-2 py-0.5 bg-surface text-text text-[11px] outline-none max-w-[180px] hover:border-sc-blue transition-colors">
                <option value="">Ad name...</option>
                {(filterOpts.ad_names || []).map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {(campaign || adName || creative || brand || language) && (
                <button onClick={() => { setCampaign(null); setAdName(null); setCreative(null); setBrand(null); setLanguage(null); }} className="text-[11px] text-sc-red hover:underline">Clear</button>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted font-medium">DRILL DOWN ›</span>
              {["campaign", "ad"].map((lvl) => (
                <button key={lvl} onClick={() => setLevel(lvl)}
                  className={cn("px-2 py-0.5 rounded border text-[11px] font-medium transition-colors capitalize",
                    level === lvl ? "bg-sc-blue text-white border-sc-blue" : "bg-surface text-muted border-border hover:border-sc-blue")}>
                  {lvl === "campaign" ? "Campaign" : "Ad"} ({level === lvl ? rows.length : "—"})
                </button>
              ))}
            </div>
          </div>
          {initialLoading ? <div className="skeleton h-64" /> : (
            <LoadingOverlay loading={loading}>
              <DataTable columns={columns} rows={rows} getRowKey={(r) => `${r.campaign ?? ""}_${r.name}`} maxHeight={SEVEN_ROW_MAX_HEIGHT} />
            </LoadingOverlay>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ main page
export default function AcquisitionPage({ startDate, endDate, compareMode }) {
  const {
    data, loading, initialLoading, error, filterOpts,
    aiSummary, aiDate, aiLoading,
  } = useAcquisition({ startDate, endDate });

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-lg font-bold text-text tracking-tight">Acquisition</h1>
        <p className="text-xs text-muted mt-0.5">Meta Ads · {startDate} → {endDate}</p>
      </div>

      {error && <div className="px-4 py-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-sm">{error}</div>}

      <AIFlash
        title="AI daily flash · Acquisition"
        summary={aiSummary}
        date={aiDate}
        loading={aiLoading}
      />

      {/* KPI strip */}
      <KpiStrip kpis={data?.kpis} loading={loading} initialLoading={initialLoading} compareMode={compareMode} />

      {/* Funnel CVR breakdown */}
      <div className="space-y-2">
        <SectionHeader
          title="Funnel CVR breakdown — where are we losing customers?"
          subtitle="Impressions → Order · Meta · period"
          tone="teal"
        />
        <Card>
          <CardBody>
            <FunnelCVR funnel={data?.funnel_cvr} loading={loading} initialLoading={initialLoading} />
          </CardBody>
        </Card>
      </div>

      {/* Fatigued ads */}
      <div className="space-y-2">
        <SectionHeader
          title="Fatigued ads — replace this week"
          subtitle={`${(data?.fatigued_ads || []).length} ads need action`}
          tone="red"
        />
        <Card>
          <CardBody className="!p-0 px-0">
            <div className="px-4 py-3">
              <FatiguedAds rows={data?.fatigued_ads} loading={loading} initialLoading={initialLoading} />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Trend — self-contained */}
      <TrendSection startDate={startDate} endDate={endDate} filterOpts={filterOpts} />

      {/* Performance table — self-contained */}
      <TableSection startDate={startDate} endDate={endDate} filterOpts={filterOpts} compareMode={compareMode} />
    </div>
  );
}
