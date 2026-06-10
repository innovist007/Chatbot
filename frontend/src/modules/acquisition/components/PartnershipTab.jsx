import { useState, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { Card, CardBody } from "@/shared/ui/Card";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { AIFlash } from "@/shared/components/AIFlash";
import { AlertCard } from "@/shared/components/AlertCard";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { KpiCard } from "@/shared/components/KpiCard";
import { Pill } from "@/shared/ui/Pill";
import { api } from "@/lib/api";
import { fmt, cn } from "@/lib/utils";

const COMMISSION_TARGET = 250;

// ------------------------------------------------------------------ tone helpers
function roasTone(v)   { return v == null ? "neutral" : v >= 3 ? "green" : v >= 2 ? "accent" : "amber"; }
function rtoTone(v)    { return v == null ? "neutral" : v <= 0.09 ? "green" : v <= 0.12 ? "accent" : "red"; }
function commTone(v)   { return v == null ? "neutral" : v <= COMMISSION_TARGET ? "green" : v <= 350 ? "amber" : "red"; }

// map raw source keys → display labels + brand colors
const SOURCE_META = {
  gpay:    { name: "Google Pay", color: "#0F6E56" },
  phonepe: { name: "PhonePe",    color: "#534AB7" },
  paytm:   { name: "Paytm",      color: "#185FA5" },
};

function sourceName(src) {
  return SOURCE_META[src?.toLowerCase()]?.name ?? (src ? src.charAt(0).toUpperCase() + src.slice(1) : "—");
}

// ------------------------------------------------------------------ KPI strip
function KpiStrip({ kpis, loading, initialLoading }) {
  const c = kpis?.current ?? {};
  const d = kpis?.deltas  ?? {};

  const cards = [
    { label: "Total Commission",   value: fmt.inr(c.spend),                                  delta: d.spend },
    { label: "Revenue Attributed", value: fmt.inr(c.revenue),                                delta: d.revenue },
    { label: "Blended ROAS",       value: c.roas   != null ? c.roas.toFixed(2) + "×" : "—", delta: d.roas },
    { label: "Avg CAC",            value: fmt.inr(c.cac),                                    delta: d.cac },
    { label: "Total Orders",       value: fmt.num(c.orders),                                 delta: d.orders },
    { label: "New Customers",      value: fmt.num(c.new_customers),                          delta: d.new_customers },
    { label: "New %",              value: fmt.pct(c.new_pct, 1),                             delta: d.new_pct },
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
          <KpiCard key={label} label={label} value={value} delta={delta} />
        ))}
      </div>
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ partner comparison table
function PartnerTable({ partners, loading, initialLoading }) {
  // useMemo must run before any conditional return (Rules of Hooks)
  const totals = useMemo(() => {
    if (!partners?.length) return null;
    const sum = (key) => partners.reduce((s, r) => s + (r[key] ?? 0), 0);
    const wAvg = (key, wKey) => {
      const wSum = sum(wKey);
      if (!wSum) return null;
      return partners.reduce((s, r) => s + (r[key] ?? 0) * (r[wKey] ?? 0), 0) / wSum;
    };
    const totalOrders  = sum("orders");
    const totalSpend   = sum("spend");
    const totalRevenue = sum("revenue");
    const totalNewC    = sum("new_customers");
    return {
      _isTotal:             true,
      name:                 "Blended",
      spend:                totalSpend,
      revenue:              totalRevenue,
      roas:                 totalRevenue / (totalSpend || 1),
      orders:               totalOrders,
      aov:                  totalRevenue / (totalOrders || 1),
      new_customers:        totalNewC,
      new_pct:              totalNewC    / (totalOrders || 1),
      disc_pct:             wAvg("disc_pct",    "orders"),
      prepaid_pct:          wAvg("prepaid_pct", "orders"),
      rto_pct:              wAvg("rto_pct",     "orders"),
      cac:                  totalSpend   / (totalNewC   || 1),
      commission_per_order: totalSpend   / (totalOrders || 1),
      spend_delta:          null,
    };
  }, [partners]);

  if (initialLoading) return <div className="skeleton h-44 rounded-lg m-4" />;

  const rows = partners ?? [];

  const th = "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap text-right first:text-left";
  const td = "px-3 py-2.5 text-[11px] text-right first:text-left";

  const renderRow = (r, isTotal = false) => (
    <tr
      key={r.name}
      className={cn(
        "border-b border-border last:border-b-0",
        isTotal
          ? "bg-sc-blue-light font-semibold text-sc-blue border-t border-sc-blue/20"
          : "hover:bg-elevated transition-colors"
      )}
    >
      <td className={cn(td, "font-medium")}>
        <div className="flex items-center gap-2">
          {!isTotal && (
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ background: SOURCE_META[r.sub?.toLowerCase()]?.color ?? "#888" }}
            />
          )}
          {r.name}
        </div>
      </td>
      <td className={td}>{fmt.inr(r.spend)}</td>
      <td className={td}>{fmt.num(r.orders)}</td>
      <td className={td}>{fmt.inr(r.revenue)}</td>
      <td className={td}>
        <Pill tone={isTotal ? "neutral" : roasTone(r.roas)} className="text-[10px] tnum">
          {r.roas != null ? r.roas.toFixed(2) + "×" : "—"}
        </Pill>
      </td>
      <td className={td}>{fmt.inr(r.aov)}</td>
      <td className={td}>{r.disc_pct    != null ? fmt.pct(r.disc_pct,    1) : "—"}</td>
      <td className={td}>{fmt.num(r.new_customers)}</td>
      <td className={td}>{r.new_pct     != null ? fmt.pct(r.new_pct,     1) : "—"}</td>
      <td className={td}>{r.prepaid_pct != null ? fmt.pct(r.prepaid_pct, 1) : "—"}</td>
      <td className={td}>
        <Pill tone={isTotal ? "neutral" : rtoTone(r.rto_pct)} className="text-[10px] tnum">
          {r.rto_pct != null ? fmt.pct(r.rto_pct, 1) : "—"}
        </Pill>
      </td>
      <td className={td}>{fmt.inr(r.cac)}</td>
      <td className={td}>
        <Pill tone={isTotal ? "neutral" : commTone(r.commission_per_order)} className="text-[10px] tnum">
          {r.commission_per_order != null ? fmt.inr(r.commission_per_order) : "—"}
        </Pill>
      </td>
      <td className={td}>
        {!isTotal && r.spend_delta != null ? (
          <span className={cn("tnum text-xs font-semibold", r.spend_delta > 0 ? "text-success" : "text-danger")}>
            {r.spend_delta > 0 ? "▲ +" : "▼ "}{(Math.abs(r.spend_delta) * 100).toFixed(1)}%
          </span>
        ) : "—"}
      </td>
    </tr>
  );

  return (
    <LoadingOverlay loading={loading}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="bg-sc-gray-100 border-b border-sc-gray-200">
              {["Partner","Commission","Orders","Revenue","ROAS","AOV","Disc %","New Custs","New %","Prepaid %","RTO %","CAC","Comm/Order","WoW Δ"].map((h, i) => (
                <th key={h} className={cn(th, i === 0 && "text-left")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => renderRow(r, false))}
            {totals && renderRow(totals, true)}
          </tbody>
        </table>
      </div>
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ trend chart
function TrendChart({ trend, loading, initialLoading }) {
  if (initialLoading) return <div className="skeleton h-[220px] rounded-lg" />;
  if (!trend?.length) return <div className="py-8 text-center text-muted text-sm">No trend data</div>;

  return (
    <LoadingOverlay loading={loading}>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={trend} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e5e5" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#737373" }} stroke="#d4d4d4" tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: "#737373" }} stroke="transparent" tickLine={false} axisLine={false} width={40} tickFormatter={(v) => fmt.num(v)} />
          <Tooltip
            isAnimationActive={false}
            cursor={{ stroke: "rgba(15,110,86,0.15)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs" style={{ pointerEvents: "none" }}>
                  <div className="text-muted mb-1.5 font-medium">{label}</div>
                  {payload.map((p) => (
                    <div key={p.dataKey} className="flex gap-2 mb-0.5">
                      <span className="font-medium" style={{ color: p.color }}>{sourceName(p.dataKey)}:</span>
                      <span className="tnum font-semibold">{fmt.num(p.value)}</span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {Object.entries(SOURCE_META).map(([key, meta]) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              name={meta.name}
              stroke={meta.color}
              strokeWidth={2.5}
              dot={{ r: 3, fill: meta.color }}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {/* legend */}
      <div className="flex items-center gap-4 mt-2 flex-wrap">
        {Object.entries(SOURCE_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="w-3 h-0.5 rounded-full" style={{ background: meta.color }} />
            {meta.name}
          </span>
        ))}
      </div>
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ commission efficiency bars
function CommissionBars({ partners, loading, initialLoading }) {
  if (initialLoading) return <div className="skeleton h-40 rounded-lg" />;
  if (!partners?.length) return <div className="py-6 text-center text-muted text-sm">No data</div>;

  return (
    <LoadingOverlay loading={loading}>
      <div className="space-y-5">
        {partners.map((p) => {
          const val   = p.commission_per_order ?? 0;
          const tone  = commTone(val);
          const color = tone === "green" ? "#0F6E56" : tone === "amber" ? "#854F0B" : "#A32D2D";
          // bar width: target = 50% of bar; scale proportionally capped at 100%
          const barPct = Math.min((val / (COMMISSION_TARGET * 2)) * 100, 100);
          const isOver = val > COMMISSION_TARGET;

          return (
            <div key={p.name}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-text">{p.name}</span>
                <span className="text-xs font-semibold tnum" style={{ color }}>{fmt.inr(val)}/order</span>
              </div>
              <div className="relative h-2.5 bg-elevated rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${barPct}%`, background: color }}
                />
                {/* target marker at 50% */}
                <div className="absolute top-0 bottom-0 w-px bg-danger/50" style={{ left: "50%" }} />
              </div>
              <div className="mt-0.5 text-[10px]">
                {isOver
                  ? <span className="text-danger font-medium">{Math.round(((val - COMMISSION_TARGET) / COMMISSION_TARGET) * 100)}% above target ↑</span>
                  : <span className="text-success font-medium">Within target ✓</span>
                }
              </div>
            </div>
          );
        })}
        <div className="text-[10px] text-muted pt-1 border-t border-border">
          Target ≤ {fmt.inr(COMMISSION_TARGET)}/order · vertical line = target
        </div>
      </div>
    </LoadingOverlay>
  );
}

// ------------------------------------------------------------------ main export
export function PartnershipTab({ startDate, endDate, compareStart, compareEnd, aiSummary, aiDate, aiLoading }) {
  const [data,           setData]   = useState(null);
  const [loading,        setLoad]   = useState(false);
  const [initialLoading, setInit]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!data) setInit(true); else setLoad(true);
    api.acquisition.partnership({ startDate, endDate, compareStart, compareEnd })
      .then((d)  => { if (!cancelled) setData(d); })
      .catch(()  => {})
      .finally(() => { if (!cancelled) { setLoad(false); setInit(false); } });
    return () => { cancelled = true; };
  }, [startDate, endDate, compareStart, compareEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      {/* Shared AI flash — same summary across all Acquisition tabs */}
      <AIFlash
        title="AI daily flash · Acquisition"
        summary={aiSummary}
        date={aiDate}
        loading={aiLoading}
      />

      {/* KPI strip */}
      <KpiStrip
        kpis={data?.kpis}
        loading={loading}
        initialLoading={initialLoading}
      />

      {/* Partner comparison table */}
      <div className="space-y-2">
        <SectionHeader
          title="Partner comparison — all metrics side-by-side"
          subtitle="GPay · PhonePe · Paytm · period Δ"
          tone="teal"
        />
        <Card>
          <CardBody className="!p-0">
            <PartnerTable
              partners={data?.partners}
              loading={loading}
              initialLoading={initialLoading}
            />
          </CardBody>
        </Card>
      </div>

      {/* Trend + Commission efficiency */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <SectionHeader
            title="Partner orders trend · MoM"
            subtitle="Last 6 months by partner"
            tone="teal"
          />
          <Card>
            <CardBody>
              <TrendChart
                trend={data?.trend}
                loading={loading}
                initialLoading={initialLoading}
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-2">
          <SectionHeader
            title="Commission efficiency · ₹ per order"
            subtitle={`Target ≤ ₹${COMMISSION_TARGET}/order`}
            tone="amber"
          />
          <Card>
            <CardBody>
              <CommissionBars
                partners={data?.partners}
                loading={loading}
                initialLoading={initialLoading}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-2">
        <SectionHeader title="Partnership insights & recommendations" tone="teal" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <AlertCard
            tone="green"
            title="Double down on Google Pay"
            body="GPay commission/order is the lowest across partners. CVR and RTO are both best-in-class. Negotiate exclusive banner placement and target higher order volume in the next billing cycle."
          />
          <AlertCard
            tone="red"
            title="Pause Paytm or renegotiate to CPA"
            body="Paytm has the lowest CVR and highest commission/order — 91% above target. New% also declining. Pause fixed-fee deal or move to performance-only (CPA) before next renewal."
          />
          <AlertCard
            tone="amber"
            title="New % declining across partners"
            body="Existing customers increasingly using payment apps for cashback arbitrage. Restrict cashback eligibility to first 2 orders only to restore acquisition efficiency."
          />
        </div>
      </div>
    </div>
  );
}
