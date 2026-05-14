import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";
import { fmt } from "@/lib/utils";

const DEVICE_COLORS = {
  mobile: "#185FA5",
  desktop: "#534AB7",
  tablet: "#EF9F27",
  default: "#888780",
};

function colorFor(device) {
  const k = (device || "").toLowerCase();
  return DEVICE_COLORS[k] || DEVICE_COLORS.default;
}

export function DeviceCrCard({ rows }) {
  if (!rows?.length) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }

  const totalSessions = rows.reduce((a, r) => a + (r.sessions || 0), 0);

  const chartData = rows.map((r) => ({
    device: r.device,
    cr: r.cr || 0,
  }));

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e5e5" vertical={false} />
          <XAxis
            dataKey="device"
            tick={{ fontSize: 11, fill: "#737373", textTransform: "capitalize" }}
            stroke="#d4d4d4"
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#737373" }}
            tickFormatter={(v) => (v * 100).toFixed(1) + "%"}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
            width={50}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs">
                  <div className="text-muted mb-1 font-medium capitalize">{label}</div>
                  <div className="tnum font-semibold text-text">{fmt.pct(payload[0].value, 2)} CR</div>
                </div>
              );
            }}
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
          />
          <Bar dataKey="cr" name="CR" radius={[4, 4, 0, 0]}>
            {chartData.map((d, i) => (
              <Cell key={i} fill={colorFor(d.device)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {rows.map((r) => {
          const share = totalSessions ? (r.sessions || 0) / totalSessions : 0;
          const color = colorFor(r.device);
          return (
            <div
              key={r.device}
              className="rounded border px-2.5 py-2 text-center"
              style={{ borderColor: `${color}33`, background: `${color}0F` }}
            >
              <div className="text-[9px] font-semibold uppercase tracking-wide" style={{ color }}>
                {r.device}
              </div>
              <div className="text-base font-semibold tnum" style={{ color }}>
                {fmt.pct(r.cr, 2)}
              </div>
              <div className="text-[10px] text-muted">{(share * 100).toFixed(0)}% of sessions</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
