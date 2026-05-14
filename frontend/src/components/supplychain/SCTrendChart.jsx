import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine,
} from "recharts";
import { fmt } from "@/lib/utils";

const PALETTE = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#0ea5e9", "#10b981"];

/**
 * trend payload from /supply-chain/trend:
 *  { buckets: string[], series: [{ name, values }], segment, metric, granularity, sub_filter }
 *
 * - When series.length > 1: render LineChart (overlay).
 * - When series.length == 1: render BarChart (single).
 */
export function SCTrendChart({ data, height = 280 }) {
  if (!data?.buckets?.length || !data?.series?.length) {
    return <div className="text-sm text-muted py-12 text-center">No data</div>;
  }

  const single = data.series.length === 1;
  const formatValue = makeValueFormatter(data.metric);

  // Pivot to recharts row format: [{ bucket, name1: val, name2: val, ... }]
  const rows = data.buckets.map((b, i) => {
    const row = { bucket: b };
    data.series.forEach((s) => { row[s.name] = s.values[i] ?? null; });
    return row;
  });

  const sla = metricSLA(data.metric);

  return (
    <ResponsiveContainer width="100%" height={height}>
      {single ? (
        <BarChart data={rows} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="2 3" vertical={false} stroke="#e5e5e5" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} tickFormatter={formatValue} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={formatValue} />
          <Bar dataKey={data.series[0].name} fill={PALETTE[0]} radius={[4, 4, 0, 0]} />
          {sla != null && <ReferenceLine y={sla} stroke="#ef4444" strokeDasharray="4 3" />}
        </BarChart>
      ) : (
        <LineChart data={rows} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="2 3" vertical={false} stroke="#e5e5e5" />
          <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} tickFormatter={formatValue} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6 }} formatter={formatValue} />
          <Legend wrapperStyle={{ fontSize: 11 }} iconSize={10} />
          {data.series.map((s, i) => (
            <Line
              key={s.name}
              type="monotone"
              dataKey={s.name}
              stroke={PALETTE[i % PALETTE.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 4 }}
            />
          ))}
          {sla != null && <ReferenceLine y={sla} stroke="#ef4444" strokeDasharray="4 3" />}
        </LineChart>
      )}
    </ResponsiveContainer>
  );
}

function makeValueFormatter(metric) {
  switch (metric) {
    case "rto":
    case "eta":
    case "ndr":
      return (v) => fmt.pct(v);
    case "delivered_revenue":
      return (v) => fmt.inr(v);
    default:
      return (v) => fmt.num(v);
  }
}

function metricSLA(metric) {
  // Soft default SLAs for visual reference.
  if (metric === "rto") return 0.10;
  if (metric === "ndr") return 0.15;
  if (metric === "eta") return 0.80;
  return null;
}
