import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { fmt } from "@/lib/utils";

const ETA_BUCKETS = new Set(["D0", "D1", "D2", "D3"]);

/**
 * data: [{ bucket, orders }]
 */
export function DeliveryDayChart({ data, height = 220 }) {
  if (!data?.length) {
    return <div className="text-sm text-muted py-8 text-center">No data</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
        <XAxis dataKey="bucket" tick={{ fontSize: 11, fill: "#737373" }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fontSize: 11, fill: "#737373" }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => fmt.num(v)}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 6 }}
          formatter={(v) => fmt.num(v)}
        />
        <ReferenceLine
          x="D3"
          stroke="#22c55e"
          strokeDasharray="4 3"
          label={{ value: "ETA boundary", position: "top", fill: "#22c55e", fontSize: 10 }}
        />
        <Bar dataKey="orders" radius={[4, 4, 0, 0]}>
          {data.map((d) => (
            <Cell key={d.bucket} fill={ETA_BUCKETS.has(d.bucket) ? "#3b82f6" : "#a3a3a3"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
