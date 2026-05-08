import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { KpiCard } from "@/components/KpiCard";
import { DataTable } from "@/components/DataTable";
import { AISummary } from "@/components/AISummary";
import { api } from "@/lib/api";
import { fmt } from "@/lib/utils";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

function generateD2CInsight(metricName, delta) {
  if (!delta || Math.abs(delta) < 0.001) return `${metricName} stable.`;
  const mag = Math.abs(delta * 100).toFixed(1);
  const insights = {
    "Net revenue": delta > 0 ? `Revenue up ${mag}%.` : `Revenue down ${mag}%.`,
    "Orders": delta > 0 ? `Orders up ${mag}%.` : `Orders down ${mag}%.`,
    "AOV": delta > 0 ? `AOV up ${mag}%.` : `AOV down ${mag}%.`,
  };
  return insights[metricName] || `${metricName} changed ${mag}%.`;
}

export default function D2COverviewPage({ onAskChat, startDate, endDate, compareMode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.d2c.overview({ startDate, endDate })
      .then((d) => { if (!cancelled) setData(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [startDate, endDate]);

  const o = data?.overview;
  const c = o?.current ?? {};
  const d = o?.deltas ?? {};

  const summary = `D2C net revenue ${fmt.inr(c.net_revenue)} (${((d.net_revenue || 0) * 100).toFixed(1)}% MoM)`;

  return (
    <div className="p-6 max-w-[1600px] mx-auto">
      <AISummary summary={summary} title="AI SUMMARY · D2C OVERVIEW" />
      
      <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Headline</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading ? Array(8).fill(0).map((_, i) => <div key={i} className="h-24 bg-surface rounded animate-pulse" />) : (
          <>
            <KpiCard label="Net revenue" value={fmt.inr(c.net_revenue)} delta={d.net_revenue} compareLabel={compareMode} insight={generateD2CInsight("Net revenue", d.net_revenue)} />
            <KpiCard label="Orders" value={fmt.num(c.orders)} delta={d.orders} compareLabel={compareMode} insight={generateD2CInsight("Orders", d.orders)} />
            <KpiCard label="AOV" value={fmt.inr(c.aov)} delta={d.aov} compareLabel={compareMode} insight={generateD2CInsight("AOV", d.aov)} />
            <KpiCard label="Delivery rate" value={fmt.pct(c.delivery_rate)} delta={d.delivery_rate} compareLabel={compareMode} />
            <KpiCard label="RTO rate" value={fmt.pct(c.rto_rate)} delta={d.rto_rate} compareLabel={compareMode} />
            <KpiCard label="Prepaid %" value={fmt.pct(c.prepaid_pct)} delta={d.prepaid_pct} compareLabel={compareMode} />
            <KpiCard label="Daily avg orders" value={fmt.num(c.daily_avg_orders)} delta={d.daily_avg_orders} compareLabel={compareMode} />
            <KpiCard label="Daily avg revenue" value={fmt.inr(c.daily_avg_revenue)} delta={d.daily_avg_revenue} compareLabel={compareMode} />
          </>
        )}
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle>Web vs App comparison</CardTitle></CardHeader>
        <CardBody className="!p-0">
          {loading ? <div className="h-40 mx-5 my-5 bg-elevated rounded animate-pulse" /> : (
            <DataTable 
              rows={data?.by_platform || []} 
              getRowKey={(r) => r.platform}
              columns={[
                { key: "platform", label: "Platform", render: (r) => <span className="font-medium">{r.platform}</span> },
                { key: "orders", label: "Orders", align: "right", mono: true, render: (r) => fmt.num(r.orders) },
                { key: "revenue", label: "Revenue", align: "right", mono: true, render: (r) => fmt.inr(r.revenue) },
                { key: "aov", label: "AOV", align: "right", mono: true, render: (r) => fmt.inr(r.aov) },
                { key: "delivery_rate", label: "Delivery %", align: "right", render: (r) => fmt.pct(r.delivery_rate) },
                { key: "rto_rate", label: "RTO %", align: "right", render: (r) => fmt.pct(r.rto_rate) },
                { key: "prepaid_pct", label: "Prepaid %", align: "right", render: (r) => fmt.pct(r.prepaid_pct) },
              ]}
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>D2C revenue trend · last 30 days</CardTitle></CardHeader>
        <CardBody>
          {loading ? <div className="h-64 bg-elevated rounded animate-pulse" /> : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data?.revenue_trend || []}>
                <defs>
                  <linearGradient id="webGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#93c5fd" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#93c5fd" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="appGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="date" stroke="#737373" tick={{ fill: '#737373', fontSize: 12 }} />
                <YAxis stroke="#737373" tick={{ fill: '#737373', fontSize: 12 }} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}K`} />
                <Tooltip 
                  contentStyle={{ background: '#fff', border: '1px solid #e5e5e5', borderRadius: '8px' }}
                  labelStyle={{ color: '#171717', fontWeight: 600 }}
                  formatter={(value) => [`₹${value.toLocaleString()}`, '']}
                />
                <Legend />
                <Area type="monotone" dataKey="web_revenue" stackId="1" stroke="#93c5fd" fill="url(#webGrad)" name="Web" />
                <Area type="monotone" dataKey="app_revenue" stackId="1" stroke="#3b82f6" fill="url(#appGrad)" name="App" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardBody>
      </Card>
    </div>
  );
}