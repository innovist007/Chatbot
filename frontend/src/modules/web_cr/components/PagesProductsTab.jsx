import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
} from "recharts";
import { Card, CardBody } from "@/shared/ui/Card";
import { Pill } from "@/shared/ui/Pill";
import { DataTable } from "@/shared/components/DataTable";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { fmt } from "@/lib/utils";

// 7 visible rows ≈ 7 * 36px + ~30px header + a hair of padding
const SEVEN_ROW_MAX_HEIGHT = 300;

const CONTENT_GROUP_COLORS = [
  "#185FA5", // blue
  "#534AB7", // purple
  "#1D9E75", // teal
  "#854F0B", // amber
  "#EF9F27", // orange
  "#A32D2D", // red
  "#0F6E56", // dark teal
  "#993C1D", // coral
  "#888780", // gray
  "#D3D1C7", // light gray
];

function crTone(cr) {
  if (cr == null) return "neutral";
  if (cr >= 0.04) return "green";
  if (cr >= 0.02) return "accent";
  return "amber";
}

function atcTone(rate) {
  if (rate == null) return "neutral";
  if (rate >= 0.12) return "green";
  if (rate >= 0.09) return "accent";
  return "amber";
}

function CampaignTrendCell() {
  return <span className="text-muted">—</span>;
}

function ContentGroupChart({ rows }) {
  if (!rows?.length) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }
  const data = rows
    .map((r) => ({
      name: r.content_group,
      cr: +((r.cr ?? 0) * 100).toFixed(2),
      sessions: r.sessions,
    }))
    .sort((a, b) => b.cr - a.cr);
  return (
    <ResponsiveContainer width="100%" height={290}>
      <BarChart data={data} margin={{ top: 18, right: 16, left: 0, bottom: 55 }}>
        <CartesianGrid stroke="#e5e5e5" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#737373", angle: -40, textAnchor: "end", dy: 6 }}
          stroke="#d4d4d4"
          tickLine={false}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "#737373" }}
          tickFormatter={(v) => v + "%"}
          stroke="transparent"
          tickLine={false}
          axisLine={false}
          width={42}
          domain={[0, (max) => Math.max(max * 1.15, 1)]}
        />
        <Tooltip
          trigger="hover"
          isAnimationActive={false}
          cursor={{ fill: "rgba(24,95,165,0.08)" }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0].payload;
            return (
              <div
                className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs"
                style={{ pointerEvents: "none" }}
              >
                <div className="text-muted mb-1.5 font-medium">{label}</div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-text-secondary">CVR:</span>
                  <span className="tnum font-semibold text-text">{row.cr}%</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-secondary">Sessions:</span>
                  <span className="tnum font-semibold text-text">{fmt.num(row.sessions)}</span>
                </div>
              </div>
            );
          }}
        />
        <Bar
          dataKey="cr"
          radius={[3, 3, 0, 0]}
          isAnimationActive={false}
          shape={(props) => {
            const color = CONTENT_GROUP_COLORS[props.index % CONTENT_GROUP_COLORS.length];
            return (
              <rect
                x={props.x}
                y={props.y}
                width={props.width}
                height={props.height}
                fill={color}
                rx={3}
              />
            );
          }}
        >
          <LabelList
            dataKey="cr"
            position="top"
            formatter={(v) => `${v}%`}
            style={{ fontSize: 11, fontWeight: 600, fill: "#2C2C2A" }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PagesProductsTab({ data, initialLoading, loading }) {
  const landingPages = data?.landing_pages || [];
  const contentGroups = data?.content_group_cr || [];
  const productPages = data?.product_pages || [];
  const campaigns = data?.top_campaigns || [];

  const landingPageColumns = useMemo(
    () => [
      {
        key: "landing_page",
        label: "Landing page",
        render: (r) => (
          <span className="font-mono text-[11px] font-medium text-sc-blue">
            {r.landing_page}
          </span>
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
        key: "bounce",
        label: "Bounce %",
        align: "right",
        render: () => <span className="text-muted">—</span>,
      },
      {
        key: "revenue",
        label: "Revenue",
        align: "right",
        mono: true,
        render: (r) => fmt.inr(r.revenue),
      },
    ],
    [],
  );

  const productPageColumns = useMemo(
    () => [
      {
        key: "landing_page",
        label: "Product page",
        render: (r) => (
          <span className="font-mono text-[11px] font-medium text-sc-blue">
            {r.landing_page}
          </span>
        ),
      },
      {
        key: "pdp_views",
        label: "PDP views",
        align: "right",
        mono: true,
        render: (r) => fmt.num(r.pdp_views),
      },
      {
        key: "atc_rate",
        label: "ATC rate",
        align: "right",
        render: (r) => (
          <Pill tone={atcTone(r.atc_rate)} className="text-[10px] tnum">
            {fmt.pct(r.atc_rate, 1)}
          </Pill>
        ),
      },
      {
        key: "cr",
        label: "Purchase CVR",
        align: "right",
        render: (r) => (
          <Pill tone={crTone(r.cr)} className="text-[10px] tnum">
            {fmt.pct(r.cr, 2)}
          </Pill>
        ),
      },
      {
        key: "revenue",
        label: "Revenue",
        align: "right",
        mono: true,
        render: (r) => fmt.inr(r.revenue),
      },
      {
        key: "atc_bar",
        label: "ATC bar",
        align: "center",
        render: (r) => {
          const widthPct = Math.min(((r.atc_rate ?? 0) / 0.2) * 100, 100);
          const bg = r.atc_rate >= 0.12 ? "#1D9E75" : r.atc_rate >= 0.09 ? "#185FA5" : "#854F0B";
          return (
            <div className="flex items-center gap-2 min-w-[100px]">
              <div className="flex-1 h-2 bg-elevated rounded overflow-hidden">
                <div className="h-2 rounded" style={{ width: `${widthPct}%`, background: bg }} />
              </div>
              <span className="text-[10px] tnum text-muted">{fmt.pct(r.atc_rate, 1)}</span>
            </div>
          );
        },
      },
      {
        key: "yoy",
        label: "YoY",
        align: "right",
        render: () => <span className="text-muted">—</span>,
      },
    ],
    [],
  );

  const campaignColumns = useMemo(
    () => [
      {
        key: "campaign",
        label: "Campaign",
        render: (r) => (
          <span className="font-mono text-[11px]">{r.campaign}</span>
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
        key: "add_to_cart",
        label: "ATC",
        align: "right",
        mono: true,
        render: (r) => fmt.num(r.add_to_cart),
      },
      {
        key: "begin_checkout",
        label: "Begin Checkout",
        align: "right",
        mono: true,
        render: (r) => fmt.num(r.begin_checkout),
      },
      {
        key: "purchases",
        label: "Purchases",
        align: "right",
        mono: true,
        render: (r) => fmt.num(r.purchases),
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
        key: "aov",
        label: "AOV",
        align: "right",
        mono: true,
        render: (r) => fmt.inr(r.aov),
      },
      {
        key: "revenue",
        label: "Revenue",
        align: "right",
        mono: true,
        render: (r) => fmt.inr(r.revenue),
      },
      {
        key: "trend",
        label: "Trend",
        align: "right",
        render: () => <CampaignTrendCell />,
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <div className="space-y-2">
          <SectionHeader
            title="Top landing pages by CVR"
            subtitle="Sorted by sessions · scroll for more"
            tone="amber"
          />
          <Card>
            <CardBody className="!p-0">
              {initialLoading ? (
                <div className="skeleton h-64 m-4" />
              ) : (
                <LoadingOverlay loading={loading}>
                  <DataTable
                    columns={landingPageColumns}
                    rows={landingPages}
                    getRowKey={(r) => r.landing_page}
                    maxHeight={SEVEN_ROW_MAX_HEIGHT}
                  />
                </LoadingOverlay>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-2">
          <SectionHeader
            title="Content group CVR breakdown"
            subtitle="Homepage · Products · Skin Care · Others"
            tone="blue"
          />
          <Card>
            <CardBody>
              {initialLoading ? (
                <div className="skeleton h-48" />
              ) : (
                <LoadingOverlay loading={loading}>
                  <ContentGroupChart rows={contentGroups} />
                </LoadingOverlay>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Product page analytics — PDP views · ATC rate · Purchase CVR"
          subtitle="Scroll for more product pages"
          tone="purple"
        />
        <Card>
          <CardBody className="!p-0">
            {initialLoading ? (
              <div className="skeleton h-64 m-4" />
            ) : (
              <LoadingOverlay loading={loading}>
                <DataTable
                  columns={productPageColumns}
                  rows={productPages}
                  getRowKey={(r) => r.landing_page}
                  maxHeight={SEVEN_ROW_MAX_HEIGHT}
                />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Top campaigns — ranked by revenue"
          subtitle="Scroll for more campaigns"
          tone="red"
        />
        <Card>
          <CardBody className="!p-0">
            {initialLoading ? (
              <div className="skeleton h-64 m-4" />
            ) : (
              <LoadingOverlay loading={loading}>
                <DataTable
                  columns={campaignColumns}
                  rows={campaigns}
                  getRowKey={(r) => r.campaign}
                  maxHeight={SEVEN_ROW_MAX_HEIGHT}
                />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
