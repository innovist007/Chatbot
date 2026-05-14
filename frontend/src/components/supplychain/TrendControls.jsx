import { cn } from "@/lib/utils";

const SEGMENTS = [
  { key: "overall",   label: "Overall"   },
  { key: "warehouse", label: "Warehouse" },
  { key: "courier",   label: "Courier"   },
  { key: "payment",   label: "Payment"   },
  { key: "daytype",   label: "Day type"  },
];

const METRICS = [
  { key: "rto",                label: "RTO %" },
  { key: "orders",             label: "Total orders" },
  { key: "eta",                label: "ETA fulfil %" },
  { key: "ndr",                label: "NDR rate %" },
  { key: "delivered_revenue",  label: "Delivered revenue" },
];

const GRANULARITY = ["DoD", "WoW", "MoM"];

export function TrendControls({
  granularity,
  onGranularityChange,
  segment,
  onSegmentChange,
  metric,
  onMetricChange,
  subOptions,        // string[] of distinct values for current segment
  subFilter,         // "all" or specific value
  onSubFilterChange,
}) {
  return (
    <div className="space-y-2">
      {/* Row 1: granularity + segment + metric */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 bg-elevated/60 border border-border rounded">
        <PillRow label="Granularity" options={GRANULARITY.map((g) => ({ key: g, label: g }))} value={granularity} onChange={onGranularityChange} />
        <Divider />
        <PillRow label="Segment" options={SEGMENTS} value={segment} onChange={onSegmentChange} />
        <Divider />
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted font-medium">Metric</span>
          <select
            value={metric}
            onChange={(e) => onMetricChange(e.target.value)}
            className="text-[11px] px-2 py-0.5 border border-border rounded bg-surface text-text"
          >
            {METRICS.map((m) => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: sub-pills (distinct values for the chosen segment) */}
      {segment !== "overall" && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-accent-soft/60 border border-accent/30 rounded">
          <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">
            {SEGMENTS.find((s) => s.key === segment)?.label} ›
          </span>
          <PillRow
            options={[{ key: "all", label: "All" }, ...(subOptions || []).map((o) => ({ key: o, label: o }))]}
            value={subFilter || "all"}
            onChange={onSubFilterChange}
            size="sm"
          />
          <span className="text-[10px] text-muted ml-auto">
            ← All = overlay · pick one = single line
          </span>
        </div>
      )}
    </div>
  );
}

function PillRow({ label, options, value, onChange, size = "md" }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {label && <span className="text-[10px] text-muted font-medium">{label}</span>}
      <div className="flex gap-1 flex-wrap">
        {options.map((opt) => (
          <button
            key={opt.key}
            onClick={() => onChange(opt.key)}
            className={cn(
              "rounded-full border transition-colors font-medium",
              size === "sm" ? "px-2.5 py-0.5 text-[10px]" : "px-3 py-0.5 text-[11px]",
              value === opt.key
                ? "bg-accent text-white border-accent"
                : "bg-surface text-text-secondary border-border hover:bg-elevated"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Divider() {
  return <span className="hidden md:inline w-px h-4 bg-border" />;
}
