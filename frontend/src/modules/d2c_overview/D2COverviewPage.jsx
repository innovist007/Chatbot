import { useMemo, useState, useEffect, useRef } from "react";
import {
  ResponsiveContainer, ComposedChart, LineChart,
  PieChart, Bar, Line, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useD2COverview } from "@/modules/d2c_overview/useD2COverview";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { AIFlash } from "@/shared/components/AIFlash";
import { KpiCard } from "@/shared/components/KpiCard";
import { Card, CardBody } from "@/shared/ui/Card";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { fmt, cn } from "@/lib/utils";
import { api } from "@/lib/api";

// ─── helpers ─────────────────────────────────────────────────────────────────
const C = {
  blue:"#185FA5", purple:"#534AB7", teal:"#0F6E56", green:"#3B6D11",
  amber:"#854F0B", red:"#A32D2D", coral:"#993C1D", gray:"#888780",
};
const pct   = (n, dp=1) => n == null || isNaN(n) ? "—" : `${Number(n).toFixed(dp)}%`;
const days  = (h) => h == null ? "—" : `${(h/24).toFixed(1)}d`;
const daysD = (d) => d == null ? "—" : `${Number(d).toFixed(1)}d`;

function ChartTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-sc-gray-900 text-white text-[11px] rounded-md px-3 py-2 shadow-lg min-w-[140px]">
      <div className="font-semibold mb-1.5 text-sc-gray-200">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 mb-0.5">
          <span style={{ background:p.color }} className="w-2 h-2 rounded-sm flex-shrink-0" />
          <span className="opacity-70">{p.name}:</span>
          <span className="font-mono font-semibold ml-auto pl-2">{p.value ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ─── P&L waterfall ────────────────────────────────────────────────────────────
function PnLWaterfall({ sa }) {
  if (!sa?.mrp_revenue) return <div className="py-4 text-center text-muted text-sm">No waterfall data.</div>;

  const mrp      = sa.mrp_revenue   || 0;
  const gross    = sa.gross_revenue || 0;
  const net      = sa.net_revenue   || 0;
  const cogs     = sa.cogs          || 0;
  const logistics= sa.logistics     || 0;
  const spends   = sa.total_spend   || 0;
  const cm2      = sa.cm2           || 0;
  const discAmt  = mrp - gross;
  const maxVal   = Math.max(mrp, 1);
  const bar = (v) => Math.max(1, Math.min(100, Math.abs(v) / maxVal * 100));

  const rows = [
    { label: "MRP Revenue",    val: mrp,      w: bar(mrp),      left: 0,                    color: "#85B7EB", fg: "#042C53", right: `${fmt.inr(mrp)} · 100%` },
    { label: "− Discounts",    val: -discAmt, w: bar(discAmt),  left: bar(mrp - discAmt),   color: "#E76F8A", fg: "#4B1528", right: `−${pct(mrp>0?discAmt/mrp*100:0)} of MRP` },
    { label: "= Net Revenue",  val: net,      w: bar(net),      left: 0,                    color: "#74C69D", fg: "#173404", right: `${fmt.inr(net)} · ${pct(mrp>0?net/mrp*100:0)}`, bold:true },
    { label: "− COGS",         val: -cogs,    w: bar(cogs),     left: bar(net - cogs),      color: "#C084FC", fg: "#3B0764", right: `−${pct(net>0?cogs/net*100:0)} of net` },
    { label: "− Logistics",    val: -logistics,w:bar(logistics), left: bar(net-cogs-logistics),color:"#F4A261",fg:"#412402", right: `−${pct(net>0?logistics/net*100:0)} of net` },
    { label: "− Mktg spend",   val: -spends,  w: bar(spends),   left: bar(Math.max(cm2,0)), color: "#F0997B", fg: "#4A1B0C", right: `−${pct(net>0?spends/net*100:0)} of net` },
    { label: cm2>=0?"= CM2 ✓":"= CM2 ✗", val: cm2, w: Math.max(1.5, bar(cm2)), left: 0, color: cm2>=0?"#3B6D11":"#7E2222", fg: cm2>=0?"#EAF3DE":"#FDEDF0", right: `${fmt.inr(cm2)} · ${pct(net>0?cm2/net*100:0)}`, bold:true },
  ];

  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-3">
          <div className={cn("text-[11px] w-28 text-right flex-shrink-0", r.bold ? "font-semibold text-text" : "text-muted")}>{r.label}</div>
          <div className="flex-1 h-6 rounded relative" style={{ background:"#E8E7E0" }}>
            <div className="absolute top-0 h-full rounded flex items-center px-2 text-[10px] font-semibold whitespace-nowrap overflow-hidden"
              style={{ left:`${r.left}%`, width:`${r.w}%`, background:r.color, color:r.fg }}>
              {fmt.inr(Math.abs(r.val))}
            </div>
          </div>
          <div className={cn("text-[11px] min-w-[160px] font-mono", r.bold ? "font-semibold text-text" : "text-muted")}>{r.right}</div>
        </div>
      ))}
    </div>
  );
}

// ─── Cohort heatmap ───────────────────────────────────────────────────────────
function CohortHeatmap({ heatmap }) {
  const pivot = useMemo(() => {
    if (!heatmap?.length) return null;
    const cohorts = [...new Set(heatmap.map(r => r.cohort_month))].sort().slice(-8);
    return cohorts.map(c => ({
      cohort: c,
      cells: [0,1,2,3,4,5,6,7,8].map(m => {
        const row = heatmap.find(r => r.cohort_month === c && r.month_n === m);
        return row ? row.retention_pct : null;
      }),
    }));
  }, [heatmap]);

  if (!pivot) return <div className="py-4 text-center text-muted text-sm">No cohort data.</div>;

  const bg = (v, m) => {
    if (m === 0) return C.purple;
    if (v == null) return "#F1EFE8";
    if (v >= 20) return "#3B6D11"; if (v >= 12) return "#639922";
    if (v >= 7)  return "#97C459"; if (v >= 3)  return "#C0DD97";
    return "#F1EFE8";
  };
  const fg = (v, m) => {
    if (m === 0) return "#fff";
    if (v == null) return "#D3D1C7";
    return v >= 12 ? "#EAF3DE" : "#27500A";
  };

  return (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[11px] min-w-[600px] w-full">
        <thead>
          <tr>
            <th className="px-3 py-1.5 bg-elevated text-left font-semibold text-muted text-[10px]">Cohort</th>
            {[0,1,2,3,4,5,6,7,8].map(m => (
              <th key={m} className="px-2 py-1.5 bg-elevated text-center font-semibold text-muted text-[10px]">M{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {pivot.map(({ cohort, cells }) => (
            <tr key={cohort}>
              <td className="px-3 py-1 font-medium text-muted border-b border-border">{cohort}</td>
              {cells.map((v, i) => (
                <td key={i} className="p-0.5 border border-white rounded">
                  <span className="flex items-center justify-center text-[10px] font-semibold h-7 min-w-[38px] rounded"
                    style={{ background: bg(v,i), color: fg(v,i) }}>
                    {i === 0 ? "100%" : v == null ? "—" : `${v}%`}
                  </span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── P&L filter pill ──────────────────────────────────────────────────────────
function FilterPill({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-0.5 bg-elevated rounded-md p-0.5">
      {options.map(o => (
        <button key={o} onClick={() => onChange(o)}
          className={cn("px-2.5 py-1 rounded text-[11px] font-medium transition-colors whitespace-nowrap",
            value === o ? "bg-surface text-text shadow-sm" : "text-muted hover:text-text")}>
          {o}
        </button>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════
export default function D2COverviewPage({ startDate, endDate, compareStart, compareEnd, hasComparison }) {

  const {
    salesAds, kpisLoading,
    meta, metaTrend, metaLoading,
    retKm, ltvcac, cohortHm, pnlTrend, retLoading,
    sc, scRtoTrend: scRto, courier, webCrTrend, appCrTrend, supLoading,
    aiSummary, aiPending,
    loading, error,
  } = useD2COverview({ startDate, endDate, compareStart, compareEnd });

  // ── safe defaults ──────────────────────────────────────────────
  const sa   = salesAds?.current || {};
  const sad  = salesAds?.deltas  || {};
  const trend = metaTrend;

  // ── Web / App CR from supply summary ──────────────────────────
  const webCR = useMemo(() => {
    if (!webCrTrend?.length) return null;
    const tot = webCrTrend.reduce((a, r) => ({ s: a.s + (r.sessions||0), p: a.p + (r.purchases||0) }), { s: 0, p: 0 });
    return tot.s > 0 ? (tot.p / tot.s) * 100 : null;
  }, [webCrTrend]);
  const webSessions = useMemo(() => webCrTrend?.reduce((s, r) => s + (r.sessions||0), 0) || 0, [webCrTrend]);
  const appCR = useMemo(() => {
    const rows = appCrTrend?.filter(r => r.cvr_pct != null) || [];
    return rows.length ? rows.reduce((s, r) => s + r.cvr_pct, 0) / rows.length * 100 : null;
  }, [appCrTrend]);

  // ── delta helper (sales_ads) ───────────────────────────────────
  const ds = (k) => hasComparison ? (sad[k] ?? null) : null;

  // ── P&L trend filter state (gran / brand / platform / seg) ─────
  const [pnlGran,     setPnlGran]     = useState("month");
  const [pnlBrand,    setPnlBrand]    = useState("All");
  const [pnlPlatform, setPnlPlatform] = useState("All");
  const [pnlSeg,      setPnlSeg]      = useState("All");
  const [pnlRows,     setPnlRows]     = useState([]);
  const [pnlLoading,  setPnlLoading]  = useState(false);
  const pnlSeedRef  = useRef(false);
  const granMountRef= useRef(true);

  useEffect(() => {
    if (!pnlSeedRef.current && pnlTrend.length > 0) {
      pnlSeedRef.current = true;
      setPnlRows(pnlTrend);
    }
  });

  useEffect(() => {
    if (granMountRef.current) { granMountRef.current = false; return; }
    if (!startDate || !endDate) return;
    setPnlLoading(true);
    api.d2cOverview.pnlTrend({ startDate, endDate, granularity: pnlGran })
      .then(d => setPnlRows(d || []))
      .catch(() => {})
      .finally(() => setPnlLoading(false));
  }, [pnlGran, startDate, endDate]);

  const pnlBrands    = useMemo(() => ["All", ...new Set(pnlRows.map(r => r.brand).filter(Boolean))],    [pnlRows]);
  const pnlPlatforms = useMemo(() => ["All", ...new Set(pnlRows.map(r => r.platform).filter(Boolean))], [pnlRows]);

  const trendChart = useMemo(() => {
    const filtered = pnlRows.filter(r =>
      (pnlBrand    === "All" || r.brand    === pnlBrand)    &&
      (pnlPlatform === "All" || r.platform === pnlPlatform) &&
      (pnlSeg      === "All" || r.customer_type === pnlSeg)
    );
    const byPeriod = {};
    filtered.forEach(r => {
      const lbl = (r.period || "").slice(0, 7);
      if (!lbl) return;
      if (!byPeriod[lbl]) byPeriod[lbl] = { label:lbl, new_rev:0, repeat_rev:0, discount:0 };
      if (r.customer_type === "New")   byPeriod[lbl].new_rev    += r.revenue  || 0;
      else                             byPeriod[lbl].repeat_rev += r.revenue  || 0;
      byPeriod[lbl].discount += r.discount || 0;
    });
    const metaMap = Object.fromEntries(trend.map(r => [(r.date||"").slice(0,7), r]));
    return Object.values(byPeriod).sort((a,b) => a.label > b.label ? 1 : -1).map(row => ({
      ...row,
      new_rev:    row.new_rev    > 0 ? Math.round(row.new_rev    / 1e5) : null,
      repeat_rev: row.repeat_rev > 0 ? Math.round(row.repeat_rev / 1e5) : null,
      discount:   row.discount   > 0 ? Math.round(row.discount   / 1e5) : null,
      cm2: metaMap[row.label]?.cm2 ? Math.round(metaMap[row.label].cm2 / 1e5) : null,
    }));
  }, [pnlRows, pnlBrand, pnlPlatform, pnlSeg, trend]);

  // ── Web + App CR monthly merge ─────────────────────────────────
  const crChart = useMemo(() => {
    const webMap = {};
    webCrTrend.forEach(r => {
      const m = (r.date||"").slice(0,7); if (!m) return;
      if (!webMap[m]) webMap[m] = { s:0, p:0 };
      webMap[m].s += Number(r.sessions  || 0);
      webMap[m].p += Number(r.purchases || 0);
    });
    const appMap = {};
    appCrTrend.forEach(r => {
      const m = (r.date||"").slice(0,7); if (!m) return;
      if (!appMap[m]) appMap[m] = { sum:0, n:0 };
      if (r.cvr_pct != null) { appMap[m].sum += Number(r.cvr_pct); appMap[m].n++; }
    });
    const months = [...new Set([...Object.keys(webMap), ...Object.keys(appMap)])].sort();
    return months.map(m => ({
      label: m,
      web: webMap[m]?.s > 0 ? +((webMap[m].p / webMap[m].s) * 100).toFixed(2) : null,
      app: appMap[m]?.n > 0 ? +(appMap[m].sum / appMap[m].n).toFixed(2) : null,
    }));
  }, [webCrTrend, appCrTrend]);

  // ── CAC / LTV chart ────────────────────────────────────────────
  const cacChart = ltvcac.map(r => ({ label: r.cohort_month, ltv: r.ltv_90d, cac: r.cac }));

  // ── Courier donut ──────────────────────────────────────────────
  const DONUT_COLORS = [C.blue, C.amber, C.teal, C.gray, C.red, C.purple];
  const total = courier.reduce((s,r) => s + (r.orders||0), 0) || 1;
  const courierData = [...courier]
    .sort((a,b) => (b.orders||0) - (a.orders||0))
    .slice(0, 6)
    .map((r, i) => ({
      name: `${r.segment||"Unknown"} ${Math.round((r.orders||0)/total*100)}%`,
      value: r.orders || 0,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    }));

  // ── RTO monthly chart ──────────────────────────────────────────
  const rtoChart = useMemo(() => {
    if (!scRto?.buckets?.length) return [];
    const vals = scRto.series?.find(s => s.name === "Overall")?.values || [];
    return scRto.buckets.map((b, i) => ({
      label: b,
      rto:   vals[i] != null ? +(vals[i] * 100).toFixed(2) : null,
    }));
  }, [scRto]);

  const dayCount = useMemo(() => {
    if (!startDate || !endDate) return 0;
    return Math.round((new Date(endDate) - new Date(startDate)) / 86400000) + 1;
  }, [startDate, endDate]);

  if (error) return (
    <div className="flex items-center justify-center py-20 text-danger text-sm">{String(error)}</div>
  );

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto space-y-6">

      {/* AI Flash */}
      <AIFlash title="AI daily flash · D2C" summary={aiSummary} pending={aiPending} loading={loading} />

      {/* ── HEALTH RAG ─────────────────────────────────────────── */}
      <LoadingOverlay loading={kpisLoading}>
        <div>
          <SectionHeader tone="red" title="Business health" subtitle={`${startDate} → ${endDate} · ${dayCount}d`} className="mb-3" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Net Revenue"   value={fmt.inr(sa.net_revenue)} delta={ds("net_revenue")} />
            <KpiCard label="CM2 %"         value={pct((sa.cm2_pct||0)*100)} delta={ds("cm2_pct")}
              critical={(sa.cm2_pct||0) < 0.05} tip="Target 10%" />
            <KpiCard label="Spend / Order" value={fmt.inr(sa.spend_per_order)} delta={ds("spend_per_order")}
              positiveIsBad tip="Total spend ÷ orders" />
            <KpiCard label="RTO Rate"      value={sc.rto_pct != null ? pct(sc.rto_pct*100) : "—"} delta={null}
              positiveIsBad critical={(sc.rto_pct||0) > 0.20} />
          </div>
        </div>
      </LoadingOverlay>

      {/* ── BURN EQUATION ──────────────────────────────────────── */}
      {sa.mrp_revenue > 0 && (
        <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 rounded-lg border border-danger/20 bg-danger-light text-[11px]">
          {[
            { txt: `MRP ${fmt.inr(sa.mrp_revenue)}`, cls: "bg-sc-blue-light text-sc-blue" },
            { txt: `−${pct((sa.discount_pct||0)*100)} disc →`, cls: "text-warning font-semibold" },
            { txt: `Net ${fmt.inr(sa.net_revenue)}`, cls: "bg-success-light text-success" },
            { txt: `−${pct(sa.net_revenue>0?(sa.total_spend/sa.net_revenue)*100:0)} spend →`, cls: "text-danger font-semibold" },
            { txt: `CM2 ${fmt.inr(sa.cm2)}`, cls: (sa.cm2||0) >= 0 ? "bg-success-light text-success" : "bg-danger-light text-danger" },
          ].map((n, i) => (
            <span key={i} className={cn("px-2 py-0.5 rounded font-semibold font-mono", n.cls)}>{n.txt}</span>
          ))}
          <span className="ml-auto text-muted italic">
            ₹100 net → ₹{sa.net_revenue>0?((sa.total_spend/sa.net_revenue)*100).toFixed(0):"—"} spend → ₹{sa.net_revenue>0?((sa.cm2/sa.net_revenue)*100).toFixed(0):"—"} CM2
          </span>
        </div>
      )}

      {/* ── UNIT ECONOMICS ─────────────────────────────────────── */}
      <LoadingOverlay loading={kpisLoading}>
        <div className="space-y-4">
          <SectionHeader tone="amber" title="Unit economics" subtitle="MRP → Net → CM2" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            <KpiCard label="MRP Revenue"      value={fmt.inr(sa.mrp_revenue)} delta={ds("mrp_revenue")} />
            <KpiCard label="Net Revenue"       value={fmt.inr(sa.net_revenue)} delta={ds("net_revenue")} />
            <KpiCard label="Discount %"        value={pct((sa.discount_pct||0)*100)} delta={ds("discount_pct")} positiveIsBad />
            <KpiCard label="CM2"               value={`${fmt.inr(sa.cm2)} · ${pct((sa.cm2_pct||0)*100)}`} delta={ds("cm2_pct")} />
            <KpiCard label="ASP"               value={fmt.inr(sa.asp)} delta={ds("asp")} tip="Avg Selling Price = Revenue ÷ Units" />
            <KpiCard label="AOV"               value={fmt.inr(sa.aov)} delta={ds("aov")} tip="Revenue ÷ Orders" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Total Spends"  value={fmt.inr(sa.total_spend)} delta={ds("total_spend")} positiveIsBad
              critical={(sa.total_spend||0)/(sa.net_revenue||1) > 0.45} />
            <KpiCard label="Total Units"   value={fmt.num(sa.total_units)} delta={ds("total_units")} />
            <KpiCard label="CM / Order"    value={fmt.inr(sa.true_cm_per_order)} delta={ds("true_cm_per_order")} tip="CM2 ÷ Orders" />
            <KpiCard label="Spend / Order" value={fmt.inr(sa.spend_per_order)} delta={ds("spend_per_order")} positiveIsBad tip="Total spend ÷ Orders" />
          </div>
        </div>
      </LoadingOverlay>

      {/* ── P&L WATERFALL ──────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader tone="red" title="P&L waterfall — where every rupee goes"
          subtitle="MRP → Discounts → Net → COGS → Logistics → Spend → CM2" />
        <Card>
          <CardBody>
            <LoadingOverlay loading={kpisLoading}>
              <PnLWaterfall sa={sa} />
            </LoadingOverlay>
          </CardBody>
        </Card>
      </div>

      {/* ── NET REV TREND (new vs repeat) ──────────────────────── */}
      <div className="space-y-3">
        <SectionHeader tone="purple"
          title={`Net revenue: new vs repeat — ${pnlGran === "month" ? "MoM" : pnlGran === "week" ? "WoW" : "DoD"}`}
          subtitle="v_order_fact · order_seq=1 New, ≥2 Repeat" />

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center px-3 py-2 bg-elevated/60 rounded-lg border border-border text-[11px]">
          <span className="font-semibold text-muted uppercase tracking-wide text-[9px]">Granularity</span>
          <FilterPill options={["day","week","month"]} value={pnlGran}
            onChange={v => setPnlGran(v)} />
          <div className="w-px h-4 bg-border" />
          <span className="font-semibold text-muted uppercase tracking-wide text-[9px]">Brand</span>
          <select value={pnlBrand} onChange={e => setPnlBrand(e.target.value)}
            className="text-[10px] rounded px-2 py-1 border border-border bg-surface text-text outline-none focus:border-sc-blue">
            {pnlBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="w-px h-4 bg-border" />
          <span className="font-semibold text-muted uppercase tracking-wide text-[9px]">Platform</span>
          <FilterPill options={pnlPlatforms} value={pnlPlatform} onChange={setPnlPlatform} />
          <div className="w-px h-4 bg-border" />
          <span className="font-semibold text-muted uppercase tracking-wide text-[9px]">Segment</span>
          <FilterPill options={["All","New","Repeat"]} value={pnlSeg} onChange={setPnlSeg} />
          {pnlLoading && <span className="ml-auto text-[9px] text-muted animate-pulse">refreshing…</span>}
        </div>

        <Card>
          <CardBody>
            <LoadingOverlay loading={pnlLoading}>
              <div className="flex flex-wrap gap-4 mb-3">
                {[
                  { c:C.purple, l:"Repeat rev (₹L)" },
                  { c:"#85B7EB",l:"New rev (₹L)" },
                  { c:C.green,  l:"CM2 (₹L, meta)" },
                  { c:C.red,    l:"Discount (₹L)" },
                ].map(({ c, l }) => (
                  <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                    <span style={{ background:c }} className="w-2.5 h-2.5 rounded-sm" />{l}
                  </span>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <ComposedChart data={trendChart} margin={{ top:4, right:45, left:0, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false}
                    interval={Math.max(0, Math.floor(trendChart.length / 7) - 1)} />
                  <YAxis yAxisId="L" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false}
                    tickFormatter={v => v>=100?`${(v/100).toFixed(0)}Cr`:`${v}L`} />
                  <YAxis yAxisId="R" orientation="right" tick={{ fontSize:10, fill:C.green }} tickLine={false} axisLine={false}
                    tickFormatter={v => `${v}L`} />
                  <Tooltip content={<ChartTip />} />
                  <Bar yAxisId="L" dataKey="repeat_rev" stackId="rev" fill={C.purple+"CC"} radius={[0,0,0,0]} name="Repeat rev (₹L)" />
                  <Bar yAxisId="L" dataKey="new_rev"    stackId="rev" fill="#85B7EBCC"      radius={[3,3,0,0]} name="New rev (₹L)" />
                  <Line yAxisId="R" type="monotone" dataKey="cm2"      stroke={C.green} strokeWidth={2}
                    strokeDasharray="6 3" dot={{ r:3, fill:C.green }} name="CM2 (₹L)" connectNulls />
                  <Line yAxisId="L" type="monotone" dataKey="discount" stroke={C.red}   strokeWidth={1.5}
                    dot={{ r:2 }} name="Discount (₹L)" connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </LoadingOverlay>
          </CardBody>
        </Card>
      </div>

      {/* ── ACQUISITION ────────────────────────────────────────── */}
      <LoadingOverlay loading={metaLoading}>
        <div className="space-y-3">
          <SectionHeader tone="blue" title="Acquisition" subtitle="CAC · Meta ROAS · Funnel" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="D2C CAC"       value={fmt.inr(cacChart.at(-1)?.cac)} />
            <KpiCard label="New Customers" value={fmt.num(cacChart.at(-1) ? cacChart.at(-1).ntb_count || (meta.new_customers||0) : 0)} />
            <KpiCard label="Meta ROAS"     value={meta.shopify_roas_pre != null ? `${meta.shopify_roas_pre.toFixed(2)}×` : "—"} />
            <KpiCard label="Blended MER"   value="—" tip="Not available" />
          </div>
          {meta.ga_sessions > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard label="Sessions"    value={fmt.num(meta.ga_sessions)} />
              <KpiCard label="Add to Cart" value={fmt.num(meta.ga_atc)} />
              <KpiCard label="Checkout"    value={fmt.num(meta.ga_checkout)} />
              <KpiCard label="Orders"      value={fmt.num(meta.orders)} />
            </div>
          )}
          {/* Two charts side-by-side matching the design reference */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* P&L trend — net rev & spends (bars) · CM2 (line) — MoM */}
            {trend.length > 0 && (() => {
              const pnlMeta = trend.map(r => ({
                label: (r.date||"").slice(0, 7),
                net:   r.rev_post ? Math.round(r.rev_post / 1e5) : null,
                spend: r.spend    ? Math.round(r.spend    / 1e5) : null,
                cm2:   r.cm2      ? +(r.cm2 / 1e5).toFixed(1)   : null,
              }));
              return (
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <span className="text-[12px] font-semibold">P&L trend — net rev &amp; spends (bars) · CM2 (line) — MoM</span>
                      <div className="flex gap-3">
                        {[{ c:"#74C69D", l:"Net rev" }, { c:"#F4A261", l:"Spends" }, { c:C.green, l:"CM2 (₹L)", d:true }].map(({ c, l, d }) => (
                          <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                            <span style={{ display:"inline-block", width:14, height:d?2:10, background:d?"transparent":c,
                              borderTop:d?`2px dashed ${c}`:"none", borderRadius:d?0:2 }} />
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={pnlMeta} margin={{ top:4, right:45, left:0, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="L" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false}
                          tickFormatter={v => v >= 100 ? `${(v/100).toFixed(0)}Cr` : `${v}L`} />
                        <YAxis yAxisId="R" orientation="right" tick={{ fontSize:10, fill:C.green }} tickLine={false} axisLine={false}
                          tickFormatter={v => `${v}L`} />
                        <Tooltip content={<ChartTip />} />
                        <Bar yAxisId="L" dataKey="net"   fill="#74C69DCC" radius={[3,3,0,0]} name="Net rev (₹L)" />
                        <Bar yAxisId="L" dataKey="spend" fill="#F4A261CC" radius={[3,3,0,0]} name="Spends (₹L)" />
                        <Line yAxisId="R" type="monotone" dataKey="cm2" stroke={C.green} strokeWidth={2}
                          strokeDasharray="6 3" dot={{ r:4, fill:C.green }} name="CM2 (₹L)" connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              );
            })()}

            {/* CAC & new customers — MoM */}
            {cacChart.length > 0 && (() => {
              const ncData = ltvcac.map(r => ({
                label: r.cohort_month,
                nc:    r.ntb_count  ? +(r.ntb_count / 1000).toFixed(1) : null,
                cac:   r.cac        ? Math.round(r.cac)                 : null,
              }));
              return (
                <Card>
                  <CardBody>
                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                      <span className="text-[12px] font-semibold">CAC &amp; new customers — MoM</span>
                      <div className="flex gap-3">
                        {[{ c:"#85B7EB", l:"New customers (K)" }, { c:C.amber, l:"CAC (₹)", d:true }].map(({ c, l, d }) => (
                          <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                            <span style={{ display:"inline-block", width:14, height:d?2:10, background:d?"transparent":c,
                              borderTop:d?`2px dashed ${c}`:"none", borderRadius:d?0:2 }} />
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={ncData} margin={{ top:4, right:45, left:0, bottom:0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false} />
                        <YAxis yAxisId="L" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false}
                          tickFormatter={v => `${v}K`} />
                        <YAxis yAxisId="R" orientation="right" tick={{ fontSize:10, fill:C.amber }} tickLine={false} axisLine={false}
                          tickFormatter={v => `₹${v}`} />
                        <Tooltip content={<ChartTip />} />
                        <Bar yAxisId="L" dataKey="nc"  fill="#85B7EBCC" radius={[3,3,0,0]} name="New customers (K)" />
                        <Line yAxisId="R" type="monotone" dataKey="cac" stroke={C.amber} strokeWidth={2}
                          strokeDasharray="6 3" dot={{ r:4, fill:C.amber }} name="CAC (₹)" connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </CardBody>
                </Card>
              );
            })()}
          </div>
        </div>
      </LoadingOverlay>

      {/* ── RETENTION ──────────────────────────────────────────── */}
      <LoadingOverlay loading={retLoading}>
        <div className="space-y-3">
          <SectionHeader tone="teal" title="Retention" subtitle="LTV · Repeat · Cohort M0–M8" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Repeat Rate"       value={retKm.repeat_rate_30d != null ? pct(retKm.repeat_rate_30d) : "—"} />
            <KpiCard label="90-day LTV"        value={fmt.inr(retKm.realized_ltv_90d)} />
            <KpiCard label="Avg Orders / Cust" value={retKm.avg_order_frequency ? `${Number(retKm.avg_order_frequency).toFixed(2)}×` : "—"} />
            <KpiCard label="CAC Payback"       value={retKm.cac_payback_days ? `${Math.round(retKm.cac_payback_days)}d` : "—"} positiveIsBad />
          </div>
          <Card>
            <CardBody>
              <div className="text-[12px] font-semibold mb-3">Cohort retention heatmap — M0 to M8</div>
              <CohortHeatmap heatmap={cohortHm} />
            </CardBody>
          </Card>
        </div>
      </LoadingOverlay>

      {/* ── SUPPLY CHAIN ───────────────────────────────────────── */}
      <LoadingOverlay loading={supLoading}>
        <div className="space-y-3">
          <SectionHeader tone="amber" title="Supply chain & ops" subtitle="CPO · Dispatch · TAT · SLA · RTO" />
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <KpiCard label="CPO (logistics)"  value={fmt.inr(meta.logistics && meta.orders ? meta.logistics/meta.orders : null)} />
            <KpiCard label="Order→Dispatch"   value={days(sc.order_to_dispatch_hours)} />
            <KpiCard label="Order→Delivered"  value={daysD((sc.order_to_dispatch_hours||0)/24+(sc.dispatch_to_pickup_days||0)+(sc.pickup_to_delivery_days||0))} />
            <KpiCard label="SLA Breach"       value={sc.in_eta_pct != null ? pct((1-sc.in_eta_pct)*100) : "—"}
              positiveIsBad critical={(1-(sc.in_eta_pct||1)) > 0.05} tip="Limit 5%" />
            <KpiCard label="RTO Rate"         value={sc.rto_pct != null ? pct(sc.rto_pct*100) : "—"} positiveIsBad />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* RTO MoM */}
            {rtoChart.length > 0 && (
              <Card>
                <CardBody>
                  <div className="text-[12px] font-semibold mb-3">RTO % — MoM</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={rtoChart} margin={{ top:4, right:10, left:0, bottom:0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false}
                        tickFormatter={v=>`${v}%`} domain={[0,"auto"]} />
                      <Tooltip content={<ChartTip />} />
                      <Line type="monotone" dataKey="rto" stroke={C.red} strokeWidth={2.5}
                        dot={{ r:4, fill:C.red }} name="RTO %" connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>
            )}

            {/* Courier split */}
            {courierData.length > 0 && (
              <Card>
                <CardBody>
                  <div className="text-[12px] font-semibold mb-3">Courier split</div>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={courierData} dataKey="value" innerRadius="52%" outerRadius="88%" paddingAngle={2} strokeWidth={0}>
                        {courierData.map((d, i) => <Cell key={i} fill={d.color} />)}
                      </Pie>
                      <Tooltip formatter={(v) => [`${Math.round(v/total*100)}%`]} />
                      <Legend layout="vertical" verticalAlign="middle" align="right"
                        wrapperStyle={{ fontSize:11, color:"#5F5E5A" }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </LoadingOverlay>

      {/* ── WEB & APP ──────────────────────────────────────────── */}
      <LoadingOverlay loading={supLoading}>
        <div className="space-y-3">
          <SectionHeader tone="blue" title="Web & app" subtitle="CR · Sessions · MoM trend" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Web CR"      value={webCR  != null ? pct(webCR,2)  : "—"} />
            <KpiCard label="Web Sessions"value={fmt.num(webSessions)} />
            <KpiCard label="App CR"      value={appCR  != null ? pct(appCR,2)  : "—"} />
            <KpiCard label="App Sessions" value={fmt.num(appCrTrend?.reduce((s,r) => s+(r.sessions||0), 0) || 0)} />
          </div>
          {crChart.length > 0 && (
            <Card>
              <CardBody>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[12px] font-semibold">Web CR vs App CR — MoM</span>
                  <div className="flex gap-4">
                    {[{ c:C.gray, l:"Web CR %", d:true }, { c:C.blue, l:"App CR %" }].map(({ c, l, d }) => (
                      <span key={l} className="flex items-center gap-1.5 text-[10px] text-muted">
                        <span style={{ display:"inline-block", width:20, height:2,
                          background:d?"transparent":c, borderTop:d?`2px dashed ${c}`:"none" }} />
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={crChart} margin={{ top:4, right:10, left:0, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8E7E0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize:10, fill:C.gray }} tickLine={false} axisLine={false}
                      tickFormatter={v=>`${v}%`} domain={[0,"auto"]} />
                    <Tooltip content={<ChartTip />} formatter={v=>[`${v}%`]} />
                    <Line type="monotone" dataKey="web" stroke={C.gray} strokeWidth={2}
                      strokeDasharray="6 3" dot={{ r:3 }} name="Web CR %" connectNulls />
                    <Line type="monotone" dataKey="app" stroke={C.blue} strokeWidth={2.5}
                      dot={{ r:4, fill:C.blue }} name="App CR %" connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </CardBody>
            </Card>
          )}
        </div>
      </LoadingOverlay>

    </div>
  );
}
