import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Segmented } from "@/components/ui/Segmented";
import { fmt } from "@/lib/utils";

const COLORS = {
  all: "#185FA5",
  new: "#534AB7",
  returning: "#1D9E75",
  sessions: "#D3D1C7",
};

const SEGMENT_META = {
  all: { crKey: "cr", sessKey: "sessions", lineColor: COLORS.all, lineName: "Overall CR" },
  new: { crKey: "new_cr", sessKey: "new_sessions", lineColor: COLORS.new, lineName: "New CR" },
  returning: { crKey: "returning_cr", sessKey: "returning_sessions", lineColor: COLORS.returning, lineName: "Returning CR" },
};

function groupWeekly(rows) {
  if (!rows?.length) return [];
  const buckets = [];
  let currentStart = null;
  let bucket = null;
  for (const r of rows) {
    const dt = new Date(r.date);
    const dayIdx = (dt.getDay() + 6) % 7;
    const monday = new Date(dt);
    monday.setDate(dt.getDate() - dayIdx);
    const key = monday.toISOString().slice(0, 10);
    if (key !== currentStart) {
      currentStart = key;
      bucket = {
        date: key,
        sessions: 0,
        purchases: 0,
        revenue: 0,
        new_sessions: 0,
        new_purchases: 0,
        returning_sessions: 0,
        returning_purchases: 0,
      };
      buckets.push(bucket);
    }
    bucket.sessions += r.sessions || 0;
    bucket.purchases += r.purchases || 0;
    bucket.revenue += r.revenue || 0;
    bucket.new_sessions += r.new_sessions || 0;
    bucket.new_purchases += r.new_purchases || 0;
    bucket.returning_sessions += r.returning_sessions || 0;
    bucket.returning_purchases += r.returning_purchases || 0;
  }
  return buckets.map((b) => ({
    ...b,
    cr: b.sessions ? b.purchases / b.sessions : 0,
    new_cr: b.new_sessions ? b.new_purchases / b.new_sessions : 0,
    returning_cr: b.returning_sessions ? b.returning_purchases / b.returning_sessions : 0,
  }));
}

export function CrTrendChart({ data, height = 280 }) {
  const [granularity, setGranularity] = useState("daily");
  const [segment, setSegment] = useState("all");

  const series = useMemo(() => {
    if (!data?.length) return [];
    return granularity === "weekly" ? groupWeekly(data) : data;
  }, [data, granularity]);

  if (!data?.length) {
    return <div className="py-12 text-center text-muted text-sm">No data</div>;
  }

  const meta = SEGMENT_META[segment];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-xs text-muted">Granularity</span>
        <Segmented
          value={granularity}
          onChange={setGranularity}
          options={[
            { value: "daily", label: "Daily" },
            { value: "weekly", label: "Weekly" },
          ]}
        />
        <div className="w-px h-4 bg-border mx-1" />
        <span className="text-xs text-muted">Segment</span>
        <Segmented
          value={segment}
          onChange={setSegment}
          options={[
            { value: "all", label: "All visitors" },
            { value: "new", label: "New" },
            { value: "returning", label: "Returning" },
          ]}
        />
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={series} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e5e5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#737373" }}
            tickFormatter={(d) => {
              const dt = new Date(d);
              return dt.toLocaleDateString("en", { month: "short", day: "numeric" });
            }}
            stroke="#d4d4d4"
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#737373" }}
            tickFormatter={(v) => (v * 100).toFixed(1) + "%"}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            width={52}
            label={{ value: "CR %", angle: -90, position: "insideLeft", offset: 10, fontSize: 10, fill: "#737373" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "#737373" }}
            tickFormatter={(v) => fmt.num(v)}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs">
                  <div className="text-muted mb-1.5 font-medium">{label}</div>
                  {payload.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 mb-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                      <span className="text-text-secondary">{p.name}:</span>
                      <span className="tnum font-semibold text-text">
                        {String(p.dataKey).endsWith("cr") ? fmt.pct(p.value, 2) : fmt.num(p.value)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
            cursor={{ fill: "rgba(0,0,0,0.02)" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            yAxisId="right"
            dataKey={meta.sessKey}
            name="Sessions"
            fill={COLORS.sessions}
            radius={[3, 3, 0, 0]}
          />
          {segment === "all" ? (
            <>
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="cr"
                name="Overall CR"
                stroke={COLORS.all}
                strokeWidth={2.5}
                dot={{ r: 2.5, fill: COLORS.all, strokeWidth: 0 }}
                activeDot={{ r: 5 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="new_cr"
                name="New CR"
                stroke={COLORS.new}
                strokeWidth={1.5}
                strokeDasharray="2 2"
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="returning_cr"
                name="Returning CR"
                stroke={COLORS.returning}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                dot={false}
                activeDot={{ r: 4 }}
              />
            </>
          ) : (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey={meta.crKey}
              name={meta.lineName}
              stroke={meta.lineColor}
              strokeWidth={2.5}
              dot={{ r: 2.5, fill: meta.lineColor, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
