import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { SectionHeader } from "@/components/shared/SectionHeader";
import { Segmented } from "@/components/ui/Segmented";
import { LoadingOverlay } from "@/components/ui/LoadingOverlay";
import { Pill } from "@/components/ui/Pill";
import { fmt } from "@/lib/utils";
import { FunnelTrendChart, SegmentedFunnelChart } from "./FunnelTrendChart";

const STEP_COLORS = [
  "#185FA5",
  "#378ADD",
  "#534AB7",
  "#7F77DD",
  "#854F0B",
  "#EF9F27",
  "#3B6D11",
  "#1D9E75",
];

const DROP_TONES = {
  red: "#A32D2D",
  amber: "#854F0B",
  green: "#3B6D11",
};

function dropTone(stepConversion, isBase) {
  if (isBase) return "neutral";
  const drop = 1 - (stepConversion ?? 1);
  if (drop >= 0.4) return "red";
  if (drop >= 0.2) return "amber";
  return "green";
}

/** SVG trapezoid funnel — wide at top, narrow at bottom. */
function ClassicFunnel({ steps }) {
  if (!steps?.length) return <div className="py-8 text-center text-muted text-sm">No funnel data</div>;

  const base = steps[0]?.count || 1;
  // sqrt scaling keeps small steps visible while preserving the funnel shape.
  const scale = (cnt) => Math.max(Math.sqrt(cnt / base), 0.08);

  const rowH = 56;
  const gap = 4;
  const viewW = 560;
  const viewH = steps.length * (rowH + gap);
  const cx = viewW / 2;

  return (
    <svg
      viewBox={`0 0 ${viewW} ${viewH}`}
      width="100%"
      style={{ maxHeight: viewH, fontFamily: "inherit" }}
      role="img"
      aria-label="Conversion funnel session to purchase"
    >
      <defs>
        <linearGradient id="funnel-shine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.16" />
          <stop offset="40%" stopColor="#fff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.06" />
        </linearGradient>
      </defs>

      {steps.map((s, i) => {
        const topW = scale(s.count) * viewW;
        const nextCount = steps[i + 1]?.count ?? s.count * 0.95;
        const botW = scale(nextCount) * viewW;
        const y = i * (rowH + gap);
        const topLeft = cx - topW / 2;
        const topRight = cx + topW / 2;
        const botLeft = cx - botW / 2;
        const botRight = cx + botW / 2;
        const color = STEP_COLORS[i % STEP_COLORS.length];
        const isBase = i === 0;
        const isFinal = i === steps.length - 1;
        const drop = isBase ? null : 1 - (s.step_conversion ?? 1);
        const tone = dropTone(s.step_conversion, isBase);
        const dropColor = DROP_TONES[tone] || "#888780";
        return (
          <g key={s.step}>
            {/* Trapezoid */}
            <path
              d={`M ${topLeft} ${y} L ${topRight} ${y} L ${botRight} ${y + rowH} L ${botLeft} ${y + rowH} Z`}
              fill={color}
            />
            <path
              d={`M ${topLeft} ${y} L ${topRight} ${y} L ${botRight} ${y + rowH} L ${botLeft} ${y + rowH} Z`}
              fill="url(#funnel-shine)"
              pointerEvents="none"
            />
            {/* Inline labels */}
            <text x={cx} y={y + rowH / 2 - 4} textAnchor="middle" fill="#fff" fontSize="12" fontWeight="600">
              {s.step}
            </text>
            <text x={cx} y={y + rowH / 2 + 12} textAnchor="middle" fill="#fff" fontSize="11" opacity="0.95">
              {fmt.num(s.count)} · {fmt.pct(s.overall_pct, 1)}
            </text>

            {/* Left: drop-off pill (hidden on the first step — nothing to compare against) */}
            {!isBase && (
              <g>
                <line
                  x1={topLeft}
                  x2="56"
                  y1={y + rowH / 2}
                  y2={y + rowH / 2}
                  stroke={dropColor}
                  strokeWidth="1"
                  strokeDasharray={tone === "red" ? "" : "2 2"}
                />
                <rect
                  x="2"
                  y={y + rowH / 2 - 9}
                  width="54"
                  height="18"
                  rx="3"
                  fill={tone === "red" ? dropColor : "#fff"}
                  stroke={dropColor}
                  strokeWidth="1"
                />
                <text
                  x="29"
                  y={y + rowH / 2 + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill={tone === "red" ? "#fff" : dropColor}
                >
                  −{(drop * 100).toFixed(1)}%
                </text>
              </g>
            )}

            {/* Right: step CR */}
            {!isBase && (
              <g>
                <line
                  x1={topRight}
                  x2={viewW - 60}
                  y1={y + rowH / 2}
                  y2={y + rowH / 2}
                  stroke="#D3D1C7"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <text
                  x={viewW - 8}
                  y={y + rowH / 2 + 4}
                  textAnchor="end"
                  fontSize="11"
                  fontWeight="600"
                  fill={color}
                >
                  {fmt.pct(s.step_conversion, 1)}
                </text>
              </g>
            )}
            {isFinal && (
              <g>
                <rect
                  x={viewW - 90}
                  y={y + rowH / 2 - 9}
                  width="84"
                  height="18"
                  rx="9"
                  fill="#0F6E56"
                />
                <text
                  x={viewW - 48}
                  y={y + rowH / 2 + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#fff"
                >
                  FINAL CR {fmt.pct(s.overall_pct, 2)}
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function FunnelMetricsTable({ steps }) {
  if (!steps?.length) return null;
  return (
    <div className="overflow-hidden border border-border rounded-lg">
      <table className="w-full text-xs">
        <thead className="bg-elevated">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">Step</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">Count</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">% of base</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">Step CR</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted">Drop-off</th>
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => {
            const isBase = i === 0;
            const isFinal = i === steps.length - 1;
            return (
              <tr
                key={s.step}
                className={
                  isFinal
                    ? "bg-emerald-50/40 dark:bg-emerald-950/10 font-semibold"
                    : i % 2
                    ? ""
                    : "bg-elevated/30"
                }
              >
                <td className="px-3 py-2">
                  <span
                    className="inline-block w-2 h-2 rounded-sm mr-2 align-middle"
                    style={{ background: STEP_COLORS[i % STEP_COLORS.length] }}
                  />
                  {s.step}
                </td>
                <td className="px-3 py-2 text-right tnum">{fmt.num(s.count)}</td>
                <td className="px-3 py-2 text-right tnum">{fmt.pct(s.overall_pct, 2)}</td>
                <td className="px-3 py-2 text-right tnum">{isBase ? "—" : fmt.pct(s.step_conversion, 1)}</td>
                <td className="px-3 py-2 text-right">
                  {isBase ? (
                    <span className="text-muted">—</span>
                  ) : isFinal ? (
                    <Pill tone="green" className="text-[10px]">FINAL</Pill>
                  ) : (
                    <Pill tone={dropTone(s.step_conversion, false)} className="text-[10px] tnum">
                      −{fmt.pct(1 - (s.step_conversion ?? 0), 1)}
                    </Pill>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ChannelFunnelChart({ rows, activeChannel }) {
  const data = useMemo(
    () =>
      (rows || []).slice(0, 10).map((r) => ({
        channel: r.channel,
        atc_rate: +(r.atc_rate * 100).toFixed(2),
        checkout_cr: +(r.checkout_cr * 100).toFixed(2),
        purchase_rate: +(r.purchase_rate * 100).toFixed(2),
        _dim: activeChannel && activeChannel !== r.channel ? true : false,
      })),
    [rows, activeChannel],
  );

  if (!data.length) return <div className="py-8 text-center text-muted text-sm">No channel data</div>;

  const opacityFor = (entry) => (entry?._dim ? 0.25 : 1);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 55 }}>
        <CartesianGrid stroke="#e5e5e5" vertical={false} />
        <XAxis
          dataKey="channel"
          tick={{ fontSize: 10, fill: "#737373", angle: -40, textAnchor: "end", dy: 6 }}
          stroke="#d4d4d4"
          tickLine={false}
          interval={0}
        />
        <YAxis tick={{ fontSize: 10, fill: "#737373" }} tickFormatter={(v) => v + "%"} stroke="transparent" tickLine={false} axisLine={false} width={42} />
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
                    <span className="tnum font-semibold text-text">{p.value}%</span>
                  </div>
                ))}
              </div>
            );
          }}
          cursor={{ fill: "rgba(0,0,0,0.02)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="atc_rate" name="ATC rate" fill="#185FA5" radius={[3, 3, 0, 0]} fillOpacity={1} shape={(props) => {
          const o = opacityFor(props.payload);
          return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={props.fill} fillOpacity={o} rx={3} />;
        }} />
        <Bar dataKey="checkout_cr" name="Checkout CR" fill="#534AB7" radius={[3, 3, 0, 0]} shape={(props) => {
          const o = opacityFor(props.payload);
          return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={props.fill} fillOpacity={o} rx={3} />;
        }} />
        <Bar dataKey="purchase_rate" name="Purchase rate" fill="#1D9E75" radius={[3, 3, 0, 0]} shape={(props) => {
          const o = opacityFor(props.payload);
          return <rect x={props.x} y={props.y} width={props.width} height={props.height} fill={props.fill} fillOpacity={o} rx={3} />;
        }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function HealthScorecard({ steps }) {
  if (!steps?.length) return null;
  const find = (name) => steps.find((s) => s.step.toLowerCase().includes(name));
  const atc = find("add to cart");
  const checkout = find("begin checkout");
  const purchase = find("purchase");

  const benchmarks = [
    { key: "atc", label: "ATC RATE", sub: "Session → Cart", value: atc?.step_conversion, bench: 0.12 },
    { key: "ck",  label: "CHECKOUT CR", sub: "Cart → Checkout", value: checkout?.step_conversion, bench: 0.55 },
    { key: "pur", label: "PURCHASE RATE", sub: "Pay info → Order", value: purchase?.step_conversion, bench: 0.75 },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {benchmarks.map((b) => {
        const v = b.value ?? 0;
        const health = b.bench ? Math.min(100, Math.round((v / b.bench) * 100)) : 0;
        const tone = health >= 90 ? "green" : health >= 70 ? "amber" : "red";
        const status = health >= 90 ? "Healthy" : health >= 70 ? "Watch" : "Below par";
        return (
          <Card key={b.key} className="px-4 py-3">
            <div className="flex justify-between items-start mb-2">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">{b.label}</div>
                <div className="text-[10px] text-muted">{b.sub}</div>
              </div>
              <Pill tone={tone} className="text-[10px]">{status}</Pill>
            </div>
            <div className="text-xl font-bold tnum">{fmt.pct(v, 1)}</div>
            <div className="mt-2 h-1.5 rounded-full bg-elevated overflow-hidden relative">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${health}%`, background: tone === "green" ? "#10b981" : tone === "amber" ? "#f59e0b" : "#ef4444" }}
              />
            </div>
            <div className="flex justify-between text-[9px] text-muted mt-1">
              <span>Health {health}</span>
              <span>Bench {fmt.pct(b.bench, 0)}</span>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function DeviceFunnelColumn({ device, tone }) {
  const palette = {
    mobile:  { color: "#185FA5", bg: "bg-sky-50 dark:bg-sky-950/20", text: "text-sky-700 dark:text-sky-400" },
    desktop: { color: "#534AB7", bg: "bg-purple-50 dark:bg-purple-950/20", text: "text-purple-700 dark:text-purple-400" },
    tablet:  { color: "#EF9F27", bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400" },
  };
  const p = palette[tone] || palette.mobile;
  if (!device) {
    return (
      <div>
        <div className={`flex items-center justify-between px-2 py-1.5 rounded ${p.bg} mb-2`}>
          <span className={`text-xs font-semibold capitalize ${p.text}`}>{tone}</span>
          <span className="text-[10px] text-muted">No data</span>
        </div>
        <div className="text-[11px] text-muted py-4 text-center">No sessions for this device</div>
      </div>
    );
  }
  const steps = device.steps || [];
  return (
    <div>
      <div className={`flex items-center justify-between px-2 py-1.5 rounded ${p.bg} mb-2`}>
        <span className={`text-xs font-semibold capitalize ${p.text}`}>{device.device}</span>
        <span className="text-[10px] text-text-secondary">
          {fmt.num(device.sessions)} sessions · <span className="font-semibold">{fmt.pct(device.cr, 2)}</span> CR
        </span>
      </div>
      <div className="space-y-1.5">
        {steps.map((s, i) => {
          const w = Math.max(s.overall_pct * 100, 2);
          const drop = i === 0 ? null : 1 - (s.step_conversion ?? 1);
          const dropClr = drop == null ? "" : drop >= 0.4 ? "text-danger" : drop >= 0.25 ? "text-warning" : "text-success";
          return (
            <div key={s.step}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-text-secondary">{s.step}</span>
                <span className="tnum font-medium">{fmt.num(s.count)}</span>
              </div>
              <div className="h-3 bg-elevated rounded relative overflow-hidden">
                <div
                  className="h-3 rounded text-[9px] font-semibold text-white pl-1.5 flex items-center"
                  style={{ width: `${w}%`, background: p.color }}
                >
                  {w > 18 ? `${(s.overall_pct * 100).toFixed(2)}%` : ""}
                </div>
              </div>
              {drop != null && (
                <div className={`text-right text-[9px] font-semibold ${dropClr}`}>−{(drop * 100).toFixed(1)}%</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HourlyHeatmap({ rows }) {
  if (!rows?.length) return <div className="py-8 text-center text-muted text-sm">No heatmap data</div>;
  const matrix = {};
  let maxCr = 0;
  for (const r of rows) {
    const dow = r.dow;
    const hr = r.hour;
    if (dow == null || hr == null) continue;
    matrix[dow] = matrix[dow] || {};
    matrix[dow][hr] = r.cr || 0;
    if ((r.cr || 0) > maxCr) maxCr = r.cr || 0;
  }
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const dowOrder = [2, 3, 4, 5, 6, 7, 1];
  const labelMap = { 1: "Sun", 2: "Mon", 3: "Tue", 4: "Wed", 5: "Thu", 6: "Fri", 7: "Sat" };

  const toBg = (v) => {
    if (v == null) return "#F1EFE8";
    const intensity = maxCr > 0 ? Math.min(v / maxCr, 1) : 0;
    if (intensity >= 0.85) return "#085041";
    if (intensity >= 0.6) return "#1D9E75";
    if (intensity >= 0.35) return "#9FE1CB";
    if (intensity >= 0.1) return "#EAF3DE";
    return "#F1EFE8";
  };
  const toFg = (v) => {
    if (v == null) return "#2C2C2A";
    const intensity = maxCr > 0 ? v / maxCr : 0;
    return intensity >= 0.6 ? "#fff" : "#2C2C2A";
  };

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        {/* min-w-max lets each of the 24 hour-columns keep natural width — no squashing */}
        <table className="min-w-max text-[11px] border-collapse">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-muted whitespace-nowrap w-14">Day ↓ / Hr →</th>
              {hours.map((h) => (
                <th key={h} className="px-1 py-2 text-center font-semibold text-muted whitespace-nowrap min-w-[32px]">
                  {h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dowOrder.map((d) => (
              <tr key={d}>
                <td className="px-3 py-2 text-left font-semibold bg-elevated border border-border whitespace-nowrap">{labelMap[d]}</td>
                {hours.map((h) => {
                  const v = matrix[d]?.[h];
                  return (
                    <td key={h} className="p-0.5 border border-white min-w-[32px]" style={{ background: toBg(v) }}>
                      <span className="flex items-center justify-center text-[10px] font-semibold tnum h-8 whitespace-nowrap" style={{ color: toFg(v) }}>
                        {v == null ? "—" : (v * 100).toFixed(1)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Right-edge fade hints more columns can be scrolled */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}

function PageMicroFunnelTable({ rows }) {
  const filtered = rows || [];

  if (!filtered.length) return <div className="py-8 text-center text-muted text-sm">No matching pages</div>;

  return (
    <div className="relative">
      <div className="overflow-x-auto rounded-lg border border-border">
      <table className="min-w-[600px] w-full text-xs">
        <thead className="bg-elevated">
          <tr>
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">Landing page</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">Sessions</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">PDP views</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">Add to cart</th>
            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">PDP → ATC bar</th>
            <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">ATC rate</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((r, i) => {
            const rate = r.atc_rate ?? 0;
            const tone = rate >= 0.15 ? "green" : rate >= 0.08 ? "amber" : "red";
            const barColor = tone === "green" ? "#1D9E75" : tone === "amber" ? "#EF9F27" : "#A32D2D";
            const widthPct = Math.min((rate / 0.25) * 100, 100);
            return (
              <tr key={r.landing_page + i} className={i % 2 ? "" : "bg-elevated/30"}>
                <td
                  className="px-3 py-2 font-mono text-[11px] font-medium text-sc-blue truncate max-w-[260px]"
                  title={r.landing_page}
                >
                  {r.landing_page}
                </td>
                <td className="px-3 py-2 text-right tnum">{fmt.num(r.sessions)}</td>
                <td className="px-3 py-2 text-right tnum">{fmt.num(r.views)}</td>
                <td className="px-3 py-2 text-right tnum font-semibold">{fmt.num(r.add_to_cart)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-elevated rounded overflow-hidden min-w-[80px]">
                      <div className="h-2 rounded" style={{ width: `${widthPct}%`, background: barColor }} />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <Pill tone={tone} className="text-[10px] tnum">{fmt.pct(rate, 1)}</Pill>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {/* Right-edge fade hints more columns exist */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-bg to-transparent rounded-r-lg" />
    </div>
  );
}

function FilterDropdown({ value, onChange, options, allLabel, className = "" }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`px-2.5 py-1 text-xs border border-border rounded bg-surface outline-none focus:border-accent min-w-[180px] ${className}`}
    >
      <option value="">{allLabel}</option>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

/**
 * Pills for top N options + an "Others" dropdown for the rest.
 * `rankedOptions` is the full list ordered by importance (e.g. sessions desc).
 */
function PillsWithOthers({ value, onChange, rankedOptions, topN = 5, allLabel = "All" }) {
  const top = (rankedOptions || []).slice(0, topN);
  const rest = (rankedOptions || []).slice(topN);
  const isOther = value != null && !top.includes(value);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Segmented
        value={isOther ? "__other__" : value}
        onChange={(v) => {
          if (v === "__other__") return;
          onChange(v);
        }}
        options={[
          { value: null, label: allLabel },
          ...top.map((o) => ({ value: o, label: o })),
        ]}
      />
      {rest.length > 0 && (
        <select
          value={isOther ? value : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={`px-2.5 py-1 text-xs border rounded outline-none ${
            isOther
              ? "border-sky-400 bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 font-medium"
              : "border-border bg-surface text-text"
          }`}
        >
          <option value="">{isOther ? value : `Others (${rest.length})`}</option>
          {rest.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function FunnelFilters({ filters, setters, filterOpts, topLandingPages, topChannels, topContentGroups }) {
  const activeChips = [];
  if (filters.device) activeChips.push({ key: "device", label: `Device: ${filters.device}`, clear: () => setters.setDevice(null) });
  if (filters.channel) activeChips.push({ key: "channel", label: `Channel: ${filters.channel}`, clear: () => setters.setChannel(null) });
  if (filters.visitor) activeChips.push({ key: "visitor", label: `Visitor: ${filters.visitor}`, clear: () => setters.setVisitor(null) });
  if (filters.landingPage) activeChips.push({ key: "landingPage", label: `Page: ${filters.landingPage}`, clear: () => setters.setLandingPage(null) });
  if (filters.campaign) activeChips.push({ key: "campaign", label: `Campaign: ${filters.campaign}`, clear: () => setters.setCampaign(null) });
  if (filters.contentGroup) activeChips.push({ key: "contentGroup", label: `Content: ${filters.contentGroup}`, clear: () => setters.setContentGroup(null) });

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-elevated/50 border border-border rounded">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Device</span>
        <Segmented
          value={filters.device}
          onChange={setters.setDevice}
          options={[
            { value: null, label: "All" },
            { value: "mobile", label: "Mobile" },
            { value: "desktop", label: "Desktop" },
            { value: "tablet", label: "Tablet" },
          ]}
        />
        <div className="w-px h-4 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Channel</span>
        <PillsWithOthers
          value={filters.channel}
          onChange={setters.setChannel}
          rankedOptions={topChannels}
          topN={5}
        />
        <div className="w-px h-4 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Visitor</span>
        <Segmented
          value={filters.visitor}
          onChange={setters.setVisitor}
          options={[
            { value: null, label: "All" },
            { value: "new", label: "New" },
            { value: "returning", label: "Returning" },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-elevated/50 border border-border rounded">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Landing page</span>
        <FilterDropdown
          value={filters.landingPage}
          onChange={setters.setLandingPage}
          options={topLandingPages || []}
          allLabel={`All pages (top ${(topLandingPages || []).length})`}
        />
        <div className="w-px h-4 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Campaign</span>
        <FilterDropdown
          value={filters.campaign}
          onChange={setters.setCampaign}
          options={filterOpts.campaigns || []}
          allLabel={`All campaigns (${(filterOpts.campaigns || []).length})`}
        />
        <div className="w-px h-4 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">Content group</span>
        <PillsWithOthers
          value={filters.contentGroup}
          onChange={setters.setContentGroup}
          rankedOptions={topContentGroups}
          topN={5}
        />
      </div>

      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="text-[10px] font-medium text-muted">Active filters:</span>
          {activeChips.map((c) => (
            <span
              key={c.key}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-[10px] font-medium"
            >
              {c.label}
              <button type="button" onClick={c.clear} className="text-sky-500 hover:text-sky-700 leading-none">×</button>
            </span>
          ))}
          <button
            type="button"
            onClick={setters.resetAll}
            className="ml-auto px-3 py-1 rounded-full border border-border text-[10px] font-medium text-muted hover:bg-elevated"
          >
            ↻ Reset filters
          </button>
        </div>
      )}
    </div>
  );
}

export function FunnelTab({ data, initialLoading, loading, filters, setters, filterOpts }) {
  const funnel = data?.funnel || [];
  const byChannel = data?.funnel_by_channel || [];
  const byDevice = data?.funnel_by_device || [];
  const heatmap = data?.funnel_heatmap || [];
  const pageFunnel = data?.page_funnel || [];
  const topLandingPages = data?.top_landing_pages || [];
  const topChannels = data?.top_channels || [];
  const topContentGroups = data?.top_content_groups || [];

  // New: daily funnel trend data
  const funnelTrend = data?.funnel_trend || [];
  const channelFunnelTrend = data?.channel_funnel_trend || { channels: [], rows: [] };
  const lpFunnelTrend = data?.landing_page_funnel_trend || { pages: [], rows: [] };

  const activeChannel = filters?.channel || null;

  const baseSessions = funnel[0]?.count || 0;
  const finalPurchases = funnel[funnel.length - 1]?.count || 0;
  const overallCr = baseSessions ? finalPurchases / baseSessions : 0;
  const biggestLeak = useMemo(() => {
    let worst = null;
    for (let i = 1; i < funnel.length; i++) {
      const drop = 1 - (funnel[i].step_conversion ?? 1);
      if (!worst || drop > worst.drop) worst = { from: funnel[i - 1].step, to: funnel[i].step, drop };
    }
    return worst;
  }, [funnel]);

  const findDevice = (key) => byDevice.find((d) => (d.device || "").toLowerCase().includes(key));

  return (
    <div className="space-y-6">
      <FunnelFilters
        filters={filters || {}}
        setters={setters || {}}
        filterOpts={filterOpts || {}}
        topLandingPages={topLandingPages}
        topChannels={topChannels}
        topContentGroups={topContentGroups}
      />

      <div className="space-y-2">
        <SectionHeader
          title="Full conversion funnel — session to purchase"
          subtitle={`${baseSessions ? fmt.num(baseSessions) : "—"} → ${finalPurchases ? fmt.num(finalPurchases) : "—"} · overall CR ${fmt.pct(overallCr, 2)}`}
          tone="purple"
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Funnel shape</CardTitle>
            </CardHeader>
            <CardBody>
              {initialLoading ? (
                <div className="skeleton h-80" />
              ) : (
                <LoadingOverlay loading={loading}>
                  <ClassicFunnel steps={funnel} />
                </LoadingOverlay>
              )}
            </CardBody>
          </Card>
          <div className="space-y-3">
            {initialLoading ? (
              <div className="skeleton h-80" />
            ) : (
              <LoadingOverlay loading={loading}>
                <FunnelMetricsTable steps={funnel} />
                {biggestLeak && biggestLeak.drop > 0 && (
                  <div className="px-3 py-2 rounded-lg bg-warning-light border border-warning/20 text-warning text-xs">
                    <strong>Biggest leak:</strong> {biggestLeak.from} → {biggestLeak.to} loses{" "}
                    <span className="tnum font-semibold">−{fmt.pct(biggestLeak.drop, 1)}</span> of users.
                  </div>
                )}
              </LoadingOverlay>
            )}
          </div>
        </div>
      </div>

      {/* ── Daily overall funnel trend ── */}
      <div className="space-y-2">
        <SectionHeader
          title="Daily funnel — Sessions → Purchase"
          subtitle="Each line = that step as % of sessions · click legend to show/hide"
          tone="blue"
        />
        <Card>
          <CardBody>
            {initialLoading ? (
              <div className="skeleton h-64" />
            ) : (
              <LoadingOverlay loading={loading}>
                <FunnelTrendChart rows={funnelTrend} height={260} />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Top 5 channels daily funnel ── */}
      <div className="space-y-2">
        <SectionHeader
          title="Daily funnel by channel — top 5 sources"
          subtitle="Pick a channel · shows sessions + all funnel steps for that source"
          tone="purple"
        />
        <Card>
          <CardBody>
            {initialLoading ? (
              <div className="skeleton h-64" />
            ) : (
              <LoadingOverlay loading={loading}>
                <SegmentedFunnelChart
                  data={channelFunnelTrend}
                  height={260}
                />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      {/* ── Top 10 landing pages daily funnel ── */}
      <div className="space-y-2">
        <SectionHeader
          title="Daily funnel by landing page — top 10 pages"
          subtitle="Pick a landing page · shows sessions + all funnel steps for that page"
          tone="green"
        />
        <Card>
          <CardBody>
            {initialLoading ? (
              <div className="skeleton h-64" />
            ) : (
              <LoadingOverlay loading={loading}>
                <SegmentedFunnelChart
                  data={lpFunnelTrend}
                  height={260}
                  labelFormatter={(p) => {
                    const path = p.replace(/^https?:\/\/[^/]+/, "");
                    return path || p;
                  }}
                />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Funnel step health scorecard"
          subtitle="vs industry benchmark · health ≥ 80% target"
          tone="amber"
        />
        {initialLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array(4).fill(0).map((_, i) => <Card key={i} className="px-4 py-3"><div className="skeleton h-24" /></Card>)}
          </div>
        ) : (
          <LoadingOverlay loading={loading}>
            <HealthScorecard steps={funnel} />
          </LoadingOverlay>
        )}
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Funnel comparison by device — where does each device leak?"
          subtitle="Mobile · Desktop · Tablet · each % of own base"
          tone="blue"
        />
        <Card>
          <CardBody>
            {initialLoading ? (
              <div className="skeleton h-72" />
            ) : (
              <LoadingOverlay loading={loading}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <DeviceFunnelColumn device={findDevice("mobile")} tone="mobile" />
                  <DeviceFunnelColumn device={findDevice("desktop")} tone="desktop" />
                  <DeviceFunnelColumn device={findDevice("tablet")} tone="tablet" />
                </div>
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Conversion heatmap — day-of-week × hour-of-day"
          subtitle="When does the funnel convert best?"
          tone="purple"
        />
        <Card>
          <CardBody>
            {initialLoading ? (
              <div className="skeleton h-64" />
            ) : (
              <LoadingOverlay loading={loading}>
                <HourlyHeatmap rows={heatmap} />
                <div className="flex items-center gap-2 mt-3 text-[10px] text-muted">
                  <span>CR scale:</span>
                  <div className="flex items-center gap-0.5">
                    <span className="inline-block w-4 h-3" style={{ background: "#F1EFE8" }} />
                    <span className="inline-block w-4 h-3" style={{ background: "#EAF3DE" }} />
                    <span className="inline-block w-4 h-3" style={{ background: "#9FE1CB" }} />
                    <span className="inline-block w-4 h-3" style={{ background: "#1D9E75" }} />
                    <span className="inline-block w-4 h-3" style={{ background: "#085041" }} />
                  </div>
                  <span>low → high · values are CR %</span>
                </div>
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="space-y-2">
        <SectionHeader
          title="Page-level micro-funnels — PDP → ATC"
          subtitle="How efficiently does each landing page convert PDP views into add-to-cart?"
          tone="green"
        />
        <Card>
          <CardBody className="!p-0">
            {initialLoading ? (
              <div className="skeleton h-64 m-4" />
            ) : (
              <LoadingOverlay loading={loading}>
                <PageMicroFunnelTable rows={pageFunnel} />
              </LoadingOverlay>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
