import { useMemo } from "react";
import { Card } from "@/components/ui/Card";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { Pill } from "@/components/ui/Pill";
import { KpiCard } from "@/components/KpiCard";
import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { RagStrip } from "@/components/shared/RagStrip";
import { AIFlash } from "@/components/shared/AIFlash";
import { MatrixHeatmap } from "@/components/shared/MatrixHeatmap";
import { AlertsGrid } from "@/components/shared/AlertCard";
import { TatGrid } from "@/components/supplychain/TatCard";
import { TatPipeline } from "@/components/supplychain/TatPipeline";
import { Waterfall } from "@/components/supplychain/Waterfall";
import { NdrFunnel } from "@/components/supplychain/NdrFunnel";
import { DeliveryDayChart } from "@/components/supplychain/DeliveryDayChart";
import { TrendControls } from "@/components/supplychain/TrendControls";
import { SCTrendChart } from "@/components/supplychain/SCTrendChart";
import { useSupplyChain } from "@/hooks/useSupplyChain";
import { fmt, cn } from "@/lib/utils";

export default function SupplyChainPage({ startDate, endDate, compareMode, onAskChat }) {
  const {
    overview, warehouseTable, courierTable, paymentTable,
    matrix, pincodes, trend, subOptions,
    loading, initialLoading, error,
    aiSummary, aiDate, aiLoading,
    granularity, setGranularity,
    segment,     setSegment,
    metric,      setMetric,
    subFilter,   setSubFilter,
  } = useSupplyChain({ startDate, endDate, compareMode });

  const cur = overview?.overview?.current || {};
  const dl = overview?.overview?.deltas || {};
  const waterfall = overview?.waterfall;
  const ndrFunnel = overview?.ndr_funnel;
  const deliveryDays = overview?.delivery_day_distribution || [];

  // RAG strip items derived from KPIs
  const ragItems = [
    { label: "Delivered revenue",       value: fmt.inr(cur.delivered_revenue), tone: "green", sub: dl.delivered_revenue != null ? `${fmt.delta(dl.delivered_revenue)} ${compareMode}` : null },
    { label: "RTO rate",                value: fmt.pct(cur.rto_pct), tone: ragTone(cur.rto_pct, 0.10, 0.15, true), sub: dl.rto_pct != null ? `${signedPP(dl.rto_pct)} ${compareMode} · target ≤10%` : null },
    { label: "NDR rate",                value: fmt.pct(cur.ndr_pct), tone: ragTone(cur.ndr_pct, 0.15, 0.20, true), sub: dl.ndr_pct != null ? `${signedPP(dl.ndr_pct)} ${compareMode}` : null },
    { label: "% orders in ETA (D0–D3)", value: fmt.pct(cur.in_eta_pct), tone: ragTone(cur.in_eta_pct, 0.80, 0.70, false), sub: dl.in_eta_pct != null ? `${signedPP(dl.in_eta_pct)} ${compareMode}` : null },
  ];

  const tatItems = [
    { tone: "amber", label: "Order → Dispatch",    value: `${(cur.order_to_dispatch_hours || 0).toFixed(1)} hrs`, sub: "SLA 8h", subTone: cur.order_to_dispatch_hours > 8 ? "red" : "green" },
    { tone: "blue",  label: "Dispatch → Pickup",   value: `${(cur.dispatch_to_pickup_days || 0).toFixed(2)} d`,   sub: "transit start" },
    { tone: "green", label: "Pickup → Delivery",   value: `${(cur.pickup_to_delivery_days || 0).toFixed(2)} d`,   sub: "transit TAT avg" },
    { tone: "red",   label: "RTO TAT",             value: `${(cur.rto_tat_days || 0).toFixed(1)} d`,              sub: "order → return" },
    { tone: "gray",  label: "1st-attempt deliv %", value: fmt.pct(cur.first_attempt_delivered_pct), sub: dl.first_attempt_delivered_pct != null ? `${signedPP(dl.first_attempt_delivered_pct)} ${compareMode}` : null },
    { tone: "gray",  label: "Re-attempt success",  value: fmt.pct(ndrFunnel?.reattempt_success_rate), sub: "of NDR re-attempts" },
  ];

  // Matrix rows (courier × warehouse RTO%)
  const matrixRows = (matrix?.matrix || []).map((r) => ({
    name: r.courier,
    rowAvg: r.avg_rto_pct,
    cells: (matrix?.warehouses || []).map((wh) => {
      const c = r.cells.find((x) => x.warehouse === wh);
      return { colKey: wh, value: c?.rto_pct };
    }),
  }));
  const matrixColumns = (matrix?.warehouses || []).map((wh) => ({ key: wh, label: wh }));
  const matrixColAvg  = (matrix?.warehouse_avg || []).map((c) => ({ colKey: c.warehouse, value: c.avg_rto_pct }));

  // Derived alerts (very simple, data-driven; no hardcoded narrative)
  const alerts = useMemo(() => buildAlerts({ overview, ndrFunnel, matrix, pincodes }), [overview, ndrFunnel, matrix, pincodes]);

  if (initialLoading && !overview) {
    return (
      <div className="space-y-4 p-6">
        {/* AI flash skeleton */}
        <div className="skeleton h-24 rounded-lg" />

        {/* RAG strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array(4).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>

        {/* Section label + KPI grid */}
        <div className="skeleton h-9 rounded-lg w-52" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {Array(7).fill(0).map((_, i) => <div key={i} className="skeleton h-24 rounded-lg" />)}
        </div>

        {/* TAT cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array(6).fill(0).map((_, i) => <div key={i} className="skeleton h-20 rounded-lg" />)}
        </div>

        {/* Pipeline + waterfall */}
        <div className="skeleton h-9 rounded-lg w-64" />
        <div className="skeleton h-20 rounded-lg" />
        <div className="skeleton h-9 rounded-lg w-48" />
        <div className="skeleton h-48 rounded-lg" />

        {/* Charts */}
        <div className="skeleton h-9 rounded-lg w-40" />
        <div className="skeleton h-64 rounded-lg" />

        {/* Spinner */}
        <div className="flex items-center gap-2 text-sm text-muted pt-1">
          <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          <span>Loading supply chain data…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">

      {/* AI Flash */}
      <AIFlash
        title="AI daily flash · Supply chain"
        summary={aiSummary}
        date={aiDate}
        loading={aiLoading}
      />

      {/* RAG Strip */}
      <LoadingOverlay loading={loading}>
        <RagStrip items={ragItems} />
      </LoadingOverlay>

      {/* Key metrics KPI grid */}
      <SectionHeader title="Key metrics" subtitle={`current · vs ${compareMode}`} tone="purple" />
      <LoadingOverlay loading={loading}>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          <KpiCard label="Total orders"           value={fmt.num(cur.total_orders)}      delta={dl.total_orders}      compareLabel={compareMode} />
          <KpiCard label="Delivered orders"      value={fmt.num(cur.delivered_orders)}  delta={dl.delivered_orders}  compareLabel={compareMode} />
          <KpiCard label="Delivered revenue"     value={fmt.inr(cur.delivered_revenue)} delta={dl.delivered_revenue} compareLabel={compareMode} />
          <KpiCard label="RTO %"                 value={fmt.pct(cur.rto_pct)}           delta={dl.rto_pct}           compareLabel={compareMode} />
          <KpiCard label="NDR rate"              value={fmt.pct(cur.ndr_pct)}           delta={dl.ndr_pct}           compareLabel={compareMode} />
          <KpiCard label="Stuck (in-transit >7d)" value={fmt.num(cur.stuck_orders)} />
          <KpiCard label="In ETA (D0–D3)"        value={fmt.pct(cur.in_eta_pct)}        delta={dl.in_eta_pct}        compareLabel={compareMode} />
        </div>
      </LoadingOverlay>

      {/* TAT cards */}
      <LoadingOverlay loading={loading}>
        <TatGrid items={tatItems} />
      </LoadingOverlay>

      {/* Fulfilment TAT pipeline — time proportional */}
      <SectionHeader title="Fulfilment TAT pipeline" subtitle="time proportional" tone="green" />
      <LoadingOverlay loading={loading}>
        <TatPipeline kpis={cur} etaPct={cur.in_eta_pct} />
      </LoadingOverlay>

      {/* Waterfall */}
      <SectionHeader title="Order waterfall" subtitle="Each step erodes the survivor share" tone="gray" />
      <LoadingOverlay loading={loading}>
        <Card className="p-4">
          <Waterfall data={waterfall} />
        </Card>
      </LoadingOverlay>

      {/* NDR → RTO funnel */}
      <SectionHeader title="NDR → RTO funnel" subtitle="Where RTO originates" tone="red" />
      <LoadingOverlay loading={loading}>
        <Card className="p-4">
          <NdrFunnel data={ndrFunnel} />
        </Card>
      </LoadingOverlay>

      {/* Trend */}
      <SectionHeader title="Trend chart" tone="purple" />
      <TrendControls
        granularity={granularity}
        onGranularityChange={setGranularity}
        segment={segment}
        onSegmentChange={setSegment}
        metric={metric}
        onMetricChange={setMetric}
        subOptions={subOptions[segment] || []}
        subFilter={subFilter}
        onSubFilterChange={setSubFilter}
      />
      <Card className="p-4">
        <SCTrendChart data={trend} />
      </Card>

      {/* Warehouse table */}
      <SectionHeader title="Warehouse performance" subtitle={`vs ${compareMode} · target RTO ≤10%`} tone="purple" />
      <LoadingOverlay loading={loading}>
        <Card className="overflow-hidden">
          <SegmentTable rows={warehouseTable} variant="warehouse" />
        </Card>
      </LoadingOverlay>

      {/* Payment table */}
      <SectionHeader title="Payment mode performance" subtitle="COD vs Prepaid" tone="amber" />
      <LoadingOverlay loading={loading}>
        <Card className="overflow-hidden">
          <SegmentTable rows={paymentTable} variant="payment" />
        </Card>
      </LoadingOverlay>

      {/* Courier table */}
      <SectionHeader title="Courier partner performance" tone="green" />
      <LoadingOverlay loading={loading}>
        <Card className="overflow-hidden">
          <SegmentTable rows={courierTable} variant="courier" />
        </Card>
      </LoadingOverlay>

      {/* Courier × WH matrix */}
      <SectionHeader title="Courier × warehouse RTO% matrix" subtitle="green ≤10% · amber 10–15% · red >15%" tone="blue" />
      <LoadingOverlay loading={loading}>
        <Card className="p-4">
          <MatrixHeatmap rows={matrixRows} columns={matrixColumns} colAvg={matrixColAvg} />
        </Card>
      </LoadingOverlay>

      {/* Top pincodes */}
      <SectionHeader title="Top pincodes by RTO volume" subtitle="Block / Flag / Monitor pending threshold spec" tone="amber" />
      <LoadingOverlay loading={loading}>
        <Card className="overflow-hidden">
          <DataTable
            getRowKey={(r) => r.pincode}
            columns={[
              { key: "pincode", label: "Pincode" },
              { key: "city", label: "City" },
              { key: "state", label: "State" },
              { key: "orders", label: "Orders", align: "right", mono: true, render: (r) => fmt.num(r.orders) },
              { key: "rto_orders", label: "RTO", align: "right", mono: true, render: (r) => fmt.num(r.rto_orders) },
              { key: "rto_pct", label: "RTO %", align: "right", mono: true, render: (r) => fmt.pct(r.rto_pct) },
              { key: "action", label: "Action", align: "right", render: (r) => r.action || "—" },
            ]}
            rows={pincodes}
          />
        </Card>
      </LoadingOverlay>

      {/* Delivery day distribution */}
      <SectionHeader title="Ordered → delivered days" subtitle="D0..D5+" tone="blue" />
      <LoadingOverlay loading={loading}>
        <Card className="p-4">
          <DeliveryDayChart data={deliveryDays} />
        </Card>
      </LoadingOverlay>

      {/* Alerts */}
      <SectionHeader title="Alerts and recommendations" tone="red" />
      <AlertsGrid alerts={alerts} />

      {error && (
        <div className="fixed bottom-4 right-4 text-[11px] text-danger bg-danger-light border border-danger/30 rounded-full px-3 py-1">
          {error}
        </div>
      )}
    </div>
  );
}

function rtoPillTone(rto) {
  if (rto == null) return "neutral";
  if (rto <= 0.10) return "green";
  if (rto <= 0.15) return "amber";
  return "red";
}

function etaPillTone(eta) {
  if (eta == null) return "neutral";
  if (eta >= 0.75) return "green";
  if (eta >= 0.70) return "amber";
  return "red";
}

function ndrPillTone(ndr) {
  if (ndr == null) return "neutral";
  if (ndr <= 0.15) return "green";
  if (ndr <= 0.20) return "amber";
  return "red";
}

function MoMDelta({ pp }) {
  if (pp == null) return <span className="text-muted">—</span>;
  const v = pp * 100;
  const isImprovement = v < 0;
  const isFlat = Math.abs(v) < 0.05;
  const arrow = isFlat ? "▬" : isImprovement ? "▼" : "▲";
  const tone = isFlat ? "text-muted" : isImprovement ? "text-success" : "text-danger";
  return (
    <span className={cn("font-semibold whitespace-nowrap", tone)}>
      {arrow} {v >= 0 ? "+" : "−"}{Math.abs(v).toFixed(1)}pp
    </span>
  );
}

function RtoTrend7d({ points }) {
  if (!points || points.length === 0) {
    return <span className="text-muted">—</span>;
  }
  const values = points.map((p) => p.rto_pct);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 70;
  const h = 22;
  const stepX = points.length > 1 ? w / (points.length - 1) : 0;
  const coords = values.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return [x, y];
  });
  const poly = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const last = coords[coords.length - 1];
  const first = values[0];
  const lastV = values[values.length - 1];
  const isImproving = lastV <= first;
  const stroke = isImproving ? "#22c55e" : "#ef4444";
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline points={poly} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={stroke} />
    </svg>
  );
}

const WAREHOUSE_COLUMNS = [
  { key: "segment", label: "Warehouse", render: (r) => <span className="font-medium text-text">{r.segment}</span> },
  { key: "orders", label: "Orders", align: "right", mono: true, render: (r) => fmt.num(r.orders) },
  { key: "delivered_pct", label: "Del %", align: "right", mono: true, render: (r) => fmt.pct(r.delivered_pct) },
  { key: "rto_pct", label: "RTO %", align: "center", render: (r) => <Pill tone={rtoPillTone(r.rto_pct)}>{fmt.pct(r.rto_pct)}</Pill> },
  { key: "mom_delta", label: "MoM Δ", align: "center", render: (r) => <MoMDelta pp={r.rto_delta_pp} /> },
  { key: "cpo", label: "CPO", align: "right", mono: true, render: () => <span className="text-muted">—</span> },
  { key: "ord_to_disp_hours", label: "Ord→Dis", align: "right", mono: true, render: (r) => `${r.ord_to_disp_hours.toFixed(1)}h` },
  { key: "disp_to_pick_days", label: "Dis→Pick", align: "right", mono: true, render: (r) => `${r.disp_to_pick_days.toFixed(1)}d` },
  { key: "pick_to_del_days", label: "Pick→Del", align: "right", mono: true, render: (r) => `${r.pick_to_del_days.toFixed(1)}d` },
  { key: "rto_tat_days", label: "RTO TAT", align: "right", mono: true, render: (r) => `${r.rto_tat_days.toFixed(1)}d` },
  { key: "in_eta_pct", label: "ETA %", align: "center", render: (r) => <Pill tone={etaPillTone(r.in_eta_pct)}>{fmt.pct(r.in_eta_pct)}</Pill> },
  { key: "target", label: "Target", align: "center", render: () => <span className="text-muted">—</span> },
  { key: "rto_trend_7d", label: "RTO trend 7d", align: "center", render: (r) => <RtoTrend7d points={r.rto_trend_7d} /> },
];

const PAYMENT_COLUMNS = (totalOrders) => [
  { key: "segment", label: "Payment", render: (r) => <span className="font-medium text-text">{r.segment}</span> },
  { key: "orders", label: "Orders", align: "right", mono: true, render: (r) => fmt.num(r.orders) },
  { key: "share_pct", label: "Share %", align: "right", mono: true, render: (r) => totalOrders > 0 ? fmt.pct(r.orders / totalOrders) : "—" },
  { key: "rto_pct", label: "RTO %", align: "center", render: (r) => <Pill tone={rtoPillTone(r.rto_pct)}>{fmt.pct(r.rto_pct)}</Pill> },
  { key: "mom_delta", label: "MoM Δ", align: "center", render: (r) => <MoMDelta pp={r.rto_delta_pp} /> },
  { key: "cpo", label: "CPO", align: "right", mono: true, render: () => <span className="text-muted">—</span> },
  { key: "ord_to_disp_hours", label: "Ord→Dis", align: "right", mono: true, render: (r) => `${r.ord_to_disp_hours.toFixed(1)}h` },
  { key: "disp_to_pick_days", label: "Dis→Pick", align: "right", mono: true, render: (r) => `${r.disp_to_pick_days.toFixed(1)}d` },
  { key: "pick_to_del_days", label: "Pick→Del", align: "right", mono: true, render: (r) => `${r.pick_to_del_days.toFixed(1)}d` },
  { key: "rto_tat_days", label: "RTO TAT", align: "right", mono: true, render: (r) => `${r.rto_tat_days.toFixed(1)}d` },
  { key: "in_eta_pct", label: "ETA %", align: "center", render: (r) => <Pill tone={etaPillTone(r.in_eta_pct)}>{fmt.pct(r.in_eta_pct)}</Pill> },
  { key: "ndr_rate", label: "NDR rate", align: "center", render: (r) => <Pill tone={ndrPillTone(r.ndr_pct)}>{fmt.pct(r.ndr_pct)}</Pill> },
  { key: "first_attempt_pct", label: "1st att del %", align: "right", mono: true, render: () => <span className="text-muted">—</span> },
];

function VolShare({ orders, total }) {
  if (!total || total <= 0) return <span className="text-muted">—</span>;
  const pct = (orders / total) * 100;
  const barW = Math.max(Math.min(pct, 100), 1);
  return (
    <div className="flex items-center gap-2 justify-center">
      <div className="w-16 h-2 bg-elevated rounded overflow-hidden">
        <div className="h-2 bg-accent rounded" style={{ width: `${barW}%` }} />
      </div>
      <span className="text-[10px] font-semibold text-accent tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

const COURIER_COLUMNS = (totalOrders) => [
  { key: "segment", label: "Courier", render: (r) => <span className="font-medium text-text">{r.segment}</span> },
  { key: "orders", label: "Orders", align: "right", mono: true, render: (r) => fmt.num(r.orders) },
  { key: "rto_pct", label: "RTO %", align: "center", render: (r) => <Pill tone={rtoPillTone(r.rto_pct)}>{fmt.pct(r.rto_pct)}</Pill> },
  { key: "mom_delta", label: "MoM Δ", align: "center", render: (r) => <MoMDelta pp={r.rto_delta_pp} /> },
  { key: "cod_tat", label: "COD TAT", align: "right", mono: true, render: () => <span className="text-muted">—</span> },
  { key: "cod_sla", label: "SLA?", align: "center", render: () => <span className="text-muted">—</span> },
  { key: "rto_tat_days", label: "RTO TAT", align: "right", mono: true, render: (r) => `${r.rto_tat_days.toFixed(1)}d` },
  { key: "rto_sla", label: "SLA?", align: "center", render: () => <span className="text-muted">—</span> },
  { key: "pre_tat", label: "Pre TAT", align: "right", mono: true, render: () => <span className="text-muted">—</span> },
  { key: "cpo", label: "CPO", align: "right", mono: true, render: () => <span className="text-muted">—</span> },
  { key: "ndr_pct", label: "NDR %", align: "right", mono: true, render: (r) => fmt.pct(r.ndr_pct) },
  { key: "in_eta_pct", label: "ETA %", align: "center", render: (r) => <Pill tone={etaPillTone(r.in_eta_pct)}>{fmt.pct(r.in_eta_pct)}</Pill> },
  { key: "vol_share", label: "Vol share", align: "center", render: (r) => <VolShare orders={r.orders} total={totalOrders} /> },
];

function SegmentTable({ rows, variant }) {
  const totalOrders = (rows || []).reduce((a, r) => a + (r.orders || 0), 0);
  let columns;
  if (variant === "warehouse") columns = WAREHOUSE_COLUMNS;
  else if (variant === "payment") columns = PAYMENT_COLUMNS(totalOrders);
  else columns = COURIER_COLUMNS(totalOrders);
  return (
    <DataTable
      getRowKey={(r) => r.segment}
      columns={columns}
      rows={rows}
    />
  );
}

function ragTone(value, good, ok, lowerIsBetter) {
  if (value == null) return "gray";
  if (lowerIsBetter) {
    if (value <= good) return "green";
    if (value <= ok) return "amber";
    return "red";
  }
  if (value >= good) return "green";
  if (value >= ok) return "amber";
  return "red";
}

function signedPP(delta) {
  if (delta == null) return "—";
  const v = delta * 100;
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "pp";
}

function buildAlerts({ overview, ndrFunnel, matrix, pincodes }) {
  const list = [];
  const cur = overview?.overview?.current || {};

  if (cur.rto_pct != null && cur.rto_pct > 0.12) {
    list.push({
      tone: "red",
      title: `RTO at ${fmt.pct(cur.rto_pct)} — above 10% target`,
      body: `${fmt.num(cur.rto_orders)} RTO orders this period. Review courier × warehouse hotspots and top pincodes.`,
    });
  }
  if (ndrFunnel?.ndr_to_rto_rate > 0.5) {
    list.push({
      tone: "red",
      title: `${fmt.pct(ndrFunnel.ndr_to_rto_rate)} of NDR converts to RTO`,
      body: `Lift re-attempt success: IVR + WhatsApp follow-up within 2h of first failed delivery. Current re-attempt success: ${fmt.pct(ndrFunnel.reattempt_success_rate)}.`,
    });
  }
  if (cur.order_to_dispatch_hours > 8) {
    list.push({
      tone: "amber",
      title: `Dispatch TAT ${cur.order_to_dispatch_hours.toFixed(1)}h — above 8h SLA`,
      body: `Audit picking at the slowest warehouses. Earlier same-day cut-off typically recovers 1–2 hours.`,
    });
  }
  // Worst courier×warehouse cell
  let worst = null;
  (matrix?.matrix || []).forEach((row) => {
    row.cells.forEach((cell) => {
      if (cell.orders >= 50 && (worst == null || cell.rto_pct > worst.rto_pct)) {
        worst = { courier: row.courier, warehouse: cell.warehouse, rto_pct: cell.rto_pct, orders: cell.orders };
      }
    });
  });
  if (worst && worst.rto_pct > 0.15) {
    list.push({
      tone: "red",
      title: `${worst.courier} × ${worst.warehouse} RTO ${fmt.pct(worst.rto_pct)}`,
      body: `${fmt.num(worst.orders)} orders in this lane. Consider shifting volume to a better-performing courier for the same warehouse.`,
    });
  }
  // Top RTO pincode
  if (pincodes && pincodes[0] && pincodes[0].rto_pct > 0.25) {
    const p = pincodes[0];
    list.push({
      tone: "amber",
      title: `Pincode ${p.pincode} (${p.city || "—"}) RTO ${fmt.pct(p.rto_pct)}`,
      body: `${fmt.num(p.rto_orders)} RTO orders. Flag at checkout once threshold rules are finalised.`,
    });
  }
  // Bright spot
  if (cur.in_eta_pct > 0.75) {
    list.push({
      tone: "green",
      title: `ETA fulfilment ${fmt.pct(cur.in_eta_pct)}`,
      body: `Most orders delivered within D0–D3 window. Push more volume to the fastest couriers to keep this trajectory.`,
    });
  }
  return list;
}
