/**
 * FunnelTrendChart  — sessions bars + all 6 funnel step lines for one series.
 * SegmentedFunnelChart — same chart but with a dropdown to pick which
 *                         channel / landing page to display.
 */
import { useState } from "react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { fmt } from "@/lib/utils";

// ── Funnel step definitions ──────────────────────────────────────────────────
const STEPS = [
  { key: "atc_rate",        label: "Add to cart",   color: "#185FA5", dash: ""    },
  { key: "view_cart_rate",  label: "View cart",     color: "#534AB7", dash: "4 2" },
  { key: "checkout_rate",   label: "Begin checkout",color: "#854F0B", dash: ""    },
  { key: "shipping_rate",   label: "Shipping info", color: "#EF9F27", dash: "4 2" },
  { key: "payment_rate",    label: "Payment info",  color: "#1D9E75", dash: ""    },
  { key: "purchase_rate",   label: "Purchase",      color: "#A32D2D", dash: ""    },
];

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en", { month: "short", day: "numeric" });
}

// ── Core chart (reused by both components) ───────────────────────────────────
function FunnelChart({ rows = [], height = 260, hiddenSteps, onToggleStep }) {
  if (!rows.length)
    return <div className="py-12 text-center text-muted text-sm">No data for this selection</div>;

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 8, right: 28, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e5e5e5" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: "#737373" }}
            tickFormatter={fmtDate}
            stroke="#d4d4d4"
            tickLine={false}
            minTickGap={20}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: "#737373" }}
            tickFormatter={(v) => (v * 100).toFixed(0) + "%"}
            stroke="transparent" tickLine={false} axisLine={false}
            width={44}
            label={{ value: "% of sessions", angle: -90, position: "insideLeft", offset: 12, fontSize: 10, fill: "#a0a0a0" }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: "#737373" }}
            tickFormatter={(v) => fmt.num(v)}
            stroke="transparent" tickLine={false} axisLine={false}
            width={50}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="bg-surface border border-border rounded-lg shadow-lifted px-3 py-2 text-xs max-w-[200px]">
                  <div className="font-semibold text-muted mb-1.5">{fmtDate(label)}</div>
                  {payload.map((p, i) => (
                    <div key={i} className="flex items-center justify-between gap-3 mb-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
                        <span className="text-muted truncate">{p.name}</span>
                      </div>
                      <span className="tnum font-semibold text-text">
                        {p.name === "Sessions" ? fmt.num(p.value) : fmt.pct(p.value, 1)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
            cursor={{ fill: "rgba(0,0,0,0.02)" }}
          />

          {/* Session bars */}
          <Bar yAxisId="right" dataKey="sessions" name="Sessions"
            fill="#D3D1C7" radius={[2, 2, 0, 0]} maxBarSize={20} />

          {/* Funnel step lines */}
          {STEPS.map((s) =>
            hiddenSteps?.has(s.key) ? null : (
              <Line
                key={s.key}
                yAxisId="left"
                type="monotone"
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={1.8}
                strokeDasharray={s.dash}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
            )
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Custom toggleable legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1">
        {/* Sessions chip */}
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="inline-block w-3 h-3 rounded-sm bg-[#D3D1C7]" />
          Sessions
        </span>
        {STEPS.map((s) => (
          <button
            key={s.key}
            onClick={() => onToggleStep?.(s.key)}
            className={`flex items-center gap-1.5 text-[11px] transition-opacity ${
              hiddenSteps?.has(s.key) ? "opacity-30" : "opacity-100"
            }`}
          >
            <span
              className="inline-block"
              style={{
                width: 18,
                height: s.dash ? 0 : 2,
                borderTop: s.dash ? `2px dashed ${s.color}` : `2px solid ${s.color}`,
                borderRadius: 2,
              }}
            />
            <span style={{ color: s.color }}>{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── 1. Overall daily funnel (no selector) ────────────────────────────────────
export function FunnelTrendChart({ rows = [], height = 260 }) {
  const [hidden, setHidden] = useState(new Set());
  const toggle = (key) =>
    setHidden((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });

  return <FunnelChart rows={rows} height={height} hiddenSteps={hidden} onToggleStep={toggle} />;
}

// ── 2. Per-channel or per-page funnel with dropdown selector ─────────────────
// `data` shape: { names: string[], series: { [name]: [{date, sessions, atc_rate, ...}] } }
export function SegmentedFunnelChart({ data = {}, height = 260, labelFormatter }) {
  const names   = data.names  || [];
  const series  = data.series || {};

  const [selected, setSelected] = useState(() => names[0] || null);
  const [hidden,   setHidden]   = useState(new Set());

  const toggle = (key) =>
    setHidden((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });

  // When names change (data loaded) reset selection if current is no longer valid
  const activeName = names.includes(selected) ? selected : names[0] || null;
  const rows = activeName ? (series[activeName] || []) : [];

  const displayLabel = (name) =>
    labelFormatter ? labelFormatter(name) : name;

  if (!names.length)
    return <div className="py-12 text-center text-muted text-sm">No data available</div>;

  return (
    <div className="space-y-3">
      {/* Selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-muted flex-shrink-0">Select:</span>
        <select
          value={activeName || ""}
          onChange={(e) => { setSelected(e.target.value); setHidden(new Set()); }}
          className="flex-1 max-w-[420px] px-2.5 py-1.5 text-xs border border-border rounded-md bg-surface text-text outline-none focus:border-accent"
        >
          {names.map((n) => (
            <option key={n} value={n}>{displayLabel(n)}</option>
          ))}
        </select>
      </div>

      <FunnelChart rows={rows} height={height} hiddenSteps={hidden} onToggleStep={toggle} />
    </div>
  );
}
