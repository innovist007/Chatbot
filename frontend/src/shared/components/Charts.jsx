import {
  ResponsiveContainer,
  AreaChart,
  Area,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { fmt } from "@/lib/utils";

const ACCENT = "#3b82f6";
const SUCCESS = "#22c55e";

const axisStyle = {
  fontSize: 11,
  fill: "#737373",
  fontFamily: "Inter, sans-serif",
};
const gridStyle = { stroke: "#e5e5e5" };

function CustomTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs">
      <div className="text-muted mb-1.5 font-medium">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-0.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-text-secondary">{p.name}:</span>
          <span className="tnum font-semibold text-text">
            {formatter ? formatter(p.value, p.dataKey) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrendChart({ data, avg, height = 280 }) {
  if (!data || data.length === 0)
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="crGradLight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity={0.2} />
            <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid {...gridStyle} vertical={false} />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          tickFormatter={(d) => {
            const dt = new Date(d);
            return dt.toLocaleDateString("en", { month: "short", day: "numeric" });
          }}
          stroke="#d4d4d4"
          tickLine={false}
        />
        <YAxis
          tick={axisStyle}
          tickFormatter={(v) => (v * 100).toFixed(1) + "%"}
          stroke="transparent"
          tickLine={false}
          axisLine={false}
          width={50}
        />
        <Tooltip
          content={
            <CustomTooltip
              formatter={(v, k) =>
                k === "cr" ? fmt.pct(v, 2)
                : k === "revenue" ? fmt.inr(v)
                : fmt.num(v)
              }
            />
          }
          cursor={{ stroke: "#d4d4d4", strokeWidth: 1 }}
        />
        {avg != null && (
          <ReferenceLine
            y={avg}
            stroke="#a3a3a3"
            strokeDasharray="4 4"
            label={{ value: "avg", position: "right", fill: "#737373", fontSize: 10 }}
          />
        )}
        <Area
          type="monotone"
          dataKey="cr"
          name="CR"
          stroke={ACCENT}
          strokeWidth={2.5}
          fill="url(#crGradLight)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function HourChart({ data, height = 280 }) {
  if (!data || data.length === 0)
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid {...gridStyle} vertical={false} />
        <XAxis
          dataKey="hour"
          tick={axisStyle}
          tickFormatter={(h) => `${h}h`}
          stroke="#d4d4d4"
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tick={axisStyle}
          tickFormatter={(v) => fmt.num(v)}
          stroke="transparent"
          tickLine={false}
          axisLine={false}
          width={52}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tick={{ ...axisStyle, fill: SUCCESS }}
          tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
          stroke="transparent"
          tickLine={false}
          axisLine={false}
          width={44}
        />
        <Tooltip
          content={
            <CustomTooltip
              formatter={(v, k) => (k === "cr" ? fmt.pct(v, 2) : fmt.num(v))}
            />
          }
          cursor={{ fill: "rgba(0,0,0,0.02)" }}
        />
        <Bar
          yAxisId="left"
          dataKey="sessions"
          name="Sessions"
          fill="#dbeafe"
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="right"
          type="monotone"
          dataKey="cr"
          name="CR"
          stroke={SUCCESS}
          strokeWidth={3}
          dot={{ r: 3.5, fill: SUCCESS, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}