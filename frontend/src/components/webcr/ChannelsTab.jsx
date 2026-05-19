import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardBody } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { DataTable } from "@/components/DataTable";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { fmt } from "@/lib/utils";

const CHANNEL_PALETTE = [
  "#185FA5", // blue
  "#1D9E75", // teal
  "#854F0B", // amber
  "#534AB7", // purple
  "#EF9F27", // orange
];

function crTone(cr) {
  if (cr == null) return "neutral";
  if (cr >= 0.04) return "green";
  if (cr >= 0.025) return "accent";
  return "amber";
}

function yoyCell(delta) {
  if (delta == null || Number.isNaN(delta)) {
    return <span className="text-muted">—</span>;
  }
  const positive = delta >= 0;
  return (
    <span
      className={`tnum font-semibold ${positive ? "text-success" : "text-danger"}`}
    >
      {fmt.delta(delta)}
    </span>
  );
}

function ChannelTrendChart({ trend }) {
  const data = trend?.rows || [];
  const channels = trend?.channels || [];

  if (!data.length || !channels.length) {
    return <div className="py-8 text-center text-muted text-sm">No trend data</div>;
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
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
          tick={{ fontSize: 10, fill: "#737373" }}
          tickFormatter={(v) => (v * 100).toFixed(1) + "%"}
          stroke="transparent"
          tickLine={false}
          axisLine={false}
          width={52}
          label={{
            value: "CR %",
            angle: -90,
            position: "insideLeft",
            offset: 10,
            fontSize: 10,
            fill: "#737373",
          }}
        />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs">
                <div className="text-muted mb-1.5 font-medium">{label}</div>
                {payload.map((p, i) => (
                  <div key={i} className="flex items-center gap-2 mb-0.5">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: p.color }}
                    />
                    <span className="text-text-secondary">{p.name}:</span>
                    <span className="tnum font-semibold text-text">
                      {fmt.pct(p.value, 2)}
                    </span>
                  </div>
                ))}
              </div>
            );
          }}
          cursor={{ stroke: "rgba(0,0,0,0.05)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        {channels.map((channel, i) => (
          <Line
            key={channel}
            type="monotone"
            dataKey={channel}
            name={channel}
            stroke={CHANNEL_PALETTE[i % CHANNEL_PALETTE.length]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function ChannelsTab({ data, initialLoading, loading }) {
  const rows = data?.channel_table || [];
  const trend = data?.channel_trend || { channels: [], rows: [] };

  const channelColorByName = useMemo(() => {
    const map = {};
    (trend.channels || []).forEach((c, i) => {
      map[c] = CHANNEL_PALETTE[i % CHANNEL_PALETTE.length];
    });
    return map;
  }, [trend]);

  const columns = useMemo(
    () => [
      {
        key: "channel",
        label: "Channel",
        render: (r) => (
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: channelColorByName[r.channel] || "#888780" }}
            />
            <span className="font-medium">{r.channel}</span>
          </div>
        ),
      },
      {
        key: "sessions",
        label: "Sessions",
        align: "right",
        mono: true,
        render: (r) => fmt.num(r.sessions),
      },
      {
        key: "cr",
        label: "CVR %",
        align: "right",
        render: (r) => (
          <Pill tone={crTone(r.cr)} className="text-[10px] tnum">
            {fmt.pct(r.cr, 2)}
          </Pill>
        ),
      },
      {
        key: "purchases",
        label: "Purchases",
        align: "right",
        mono: true,
        render: (r) => fmt.num(r.purchases),
      },
      {
        key: "revenue",
        label: "Revenue",
        align: "right",
        mono: true,
        render: (r) => fmt.inr(r.revenue),
      },
      {
        key: "roas",
        label: "ROAS",
        align: "right",
        render: () => <span className="text-muted">—</span>,
      },
      {
        key: "duration",
        label: "Avg Duration",
        align: "right",
        render: () => <span className="text-muted">—</span>,
      },
      {
        key: "bounce",
        label: "Bounce %",
        align: "right",
        render: () => <span className="text-muted">—</span>,
      },
      {
        key: "yoy_delta",
        label: "YoY",
        align: "right",
        render: (r) => yoyCell(r.yoy_delta),
      },
    ],
    [channelColorByName],
  );

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SectionHeader
          title="Channel group performance"
          subtitle="Sessions · CVR · Revenue · YoY"
          tone="green"
        />
        <Card>
          <CardBody className="!p-0">
            {initialLoading ? (
              <div className="skeleton h-64 m-4" />
            ) : (
              <LoadingOverlay loading={loading}>
                <DataTable columns={columns} rows={rows} getRowKey={(r) => r.channel} />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Channel CVR trend"
          subtitle="Top 5 channels by sessions · daily"
          tone="blue"
        />
        <Card>
          <CardBody>
            {initialLoading ? (
              <div className="skeleton h-72" />
            ) : (
              <LoadingOverlay loading={loading}>
                <ChannelTrendChart trend={trend} />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
