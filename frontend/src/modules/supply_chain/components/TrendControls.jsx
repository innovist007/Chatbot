import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const SEGMENTS = [
  { key: "overall",   label: "Overall"   },
  { key: "warehouse", label: "Warehouse" },
  { key: "courier",   label: "Courier"   },
  { key: "payment",   label: "Payment"   },
  { key: "daytype",   label: "Day type"  },
  { key: "product",   label: "Product"   },
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

      {/* Row 2: sub-filter */}
      {segment !== "overall" && segment !== "product" && (
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

      {/* Product segment — single-line native dropdown */}
      {segment === "product" && (
        <div className="flex items-center gap-2 px-3 py-2 bg-accent-soft/60 border border-accent/30 rounded">
          <span className="text-[10px] text-accent font-semibold uppercase tracking-wider whitespace-nowrap">Product ›</span>
          <ProductSearch value={subFilter || "all"} onChange={onSubFilterChange} />
        </div>
      )}
    </div>
  );
}

function ProductSearch({ value, onChange }) {
  const [options,  setOptions]  = useState([]);
  const [query,    setQuery]    = useState("");
  const [open,     setOpen]     = useState(false);
  const wrapRef                 = useRef(null);

  // selected is an array derived from comma-separated value string
  const selected = value && value !== "all"
    ? value.split(",").map(v => v.trim()).filter(Boolean)
    : [];

  useEffect(() => {
    api.supplyChain.segmentOptions("product")
      .then((opts) => setOptions(opts || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handle(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = options.filter(o =>
    !query.trim() || o.toLowerCase().includes(query.toLowerCase())
  );

  function toggle(product) {
    const next = selected.includes(product)
      ? selected.filter(p => p !== product)
      : [...selected, product];
    onChange(next.length ? next.join(",") : "all");
  }

  function clearAll() { onChange("all"); setQuery(""); }

  const label = selected.length === 0
    ? "Select products…"
    : selected.length === 1
      ? selected[0]
      : `${selected.length} products selected`;

  return (
    <div ref={wrapRef} className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-2 border rounded px-2.5 py-1.5 text-[11px] bg-surface min-w-[260px] max-w-[400px] text-left",
          open ? "border-accent" : "border-border"
        )}
      >
        <svg className="w-3 h-3 text-muted flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <span className={cn("flex-1 truncate", selected.length ? "text-text" : "text-muted")}>{label}</span>
        {selected.length > 0 && (
          <span
            onClick={(e) => { e.stopPropagation(); clearAll(); }}
            className="text-muted hover:text-danger text-[13px] leading-none flex-shrink-0"
          >×</span>
        )}
        <svg className={cn("w-3 h-3 text-muted flex-shrink-0 transition-transform", open && "rotate-180")} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 bg-surface border border-border rounded-lg shadow-xl">
          {/* Search */}
          <div className="p-2 border-b border-border">
            <input
              autoFocus
              type="text"
              placeholder="Search products…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="w-full text-[11px] px-2.5 py-1.5 border border-border rounded bg-elevated outline-none focus:border-accent text-text"
            />
          </div>

          {/* Actions */}
          {selected.length > 0 && (
            <div className="px-3 py-1.5 border-b border-border flex items-center justify-between">
              <span className="text-[10px] text-accent font-medium">{selected.length} selected</span>
              <button onClick={clearAll} className="text-[10px] text-muted hover:text-danger">Clear all</button>
            </div>
          )}

          {/* List */}
          <div className="max-h-56 overflow-y-auto">
            {options.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted text-center">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11px] text-muted text-center">No results for "{query}"</div>
            ) : filtered.map(o => (
              <label
                key={o}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-1.5 cursor-pointer hover:bg-elevated border-b border-border/30 last:border-0",
                  selected.includes(o) && "bg-accent/5"
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(o)}
                  onChange={() => toggle(o)}
                  className="accent-accent w-3 h-3 flex-shrink-0"
                />
                <span className={cn(
                  "text-[11px] truncate",
                  selected.includes(o) ? "text-accent font-medium" : "text-text"
                )}>{o}</span>
              </label>
            ))}
          </div>
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
