import { cn } from "@/lib/utils";

const SLA_DISPATCH_HOURS = 8;

export function TatPipeline({ kpis, etaPct }) {
  const d0h    = Number(kpis?.order_to_dispatch_hours  || 0);
  const d1h    = Number(kpis?.dispatch_to_pickup_days  || 0) * 24;
  const d2h    = Number(kpis?.pickup_to_delivery_days  || 0) * 24;
  const rtoDays = Number(kpis?.rto_tat_days            || 0);
  const totalH = d0h + d1h + d2h;

  const pct = (h) => (totalH > 0 ? (h / totalH) * 100 : 0);
  const dispatchOverSla = d0h > SLA_DISPATCH_HOURS;

  const segments = [
    {
      key:      "d0",
      caption:  "D0",
      tone:     dispatchOverSla
        ? "bg-warning-light border-warning text-warning"
        : "bg-warning-light/70 border-warning/50 text-warning",
      text:     `${d0h.toFixed(1)}h${dispatchOverSla ? " ⚠" : ""}`,
      width:    Math.max(pct(d0h), 6),
      minWidth: 60,
    },
    {
      key:      "d1",
      caption:  "D1",
      tone:     "bg-accent-soft border-accent/50 text-accent",
      text:     `${(d1h / 24).toFixed(1)}d`,
      width:    Math.max(pct(d1h), 5),
      minWidth: 50,
    },
    {
      key:      "d2d3",
      caption:  "D2 → D3",
      tone:     "bg-success-light border-success/50 text-success",
      text:     `${(d2h / 24).toFixed(1)} days transit`,
      width:    Math.max(pct(d2h), 25),
      minWidth: 100,
    },
  ];

  const inEtaText =
    typeof etaPct === "number"
      ? `ETA ${etaPct >= 0.8 ? "✓" : "·"} ${(etaPct * 100).toFixed(0)}%`
      : null;

  return (
    <div className="rounded-lg border border-border bg-surface px-4 py-3">
      {/* overflow-x-auto keeps the pipeline scroll inside this card,
          preventing it from causing page-level horizontal overflow */}
      <div className="overflow-x-auto">
        <div className="min-w-[420px]">
          {/* Pipeline bar row */}
          <div className="flex items-center gap-2">
            <div className="w-16 text-right text-[10px] text-muted font-medium flex-shrink-0">
              Order placed
            </div>

            <div className="flex-1 flex items-stretch gap-1.5">
              {segments.map((seg) => (
                <div
                  key={seg.key}
                  className={cn(
                    "h-9 rounded border flex items-center justify-center px-2 text-[11px] font-semibold truncate",
                    seg.tone
                  )}
                  style={{ width: `${seg.width}%`, minWidth: seg.minWidth }}
                  title={seg.text}
                >
                  {seg.text}
                </div>
              ))}

              <div className="h-9 w-20 flex-shrink-0 rounded bg-success text-white text-[11px] font-semibold flex items-center justify-center">
                Delivered
              </div>

              <div className="w-2 flex-shrink-0" />

              <div className="h-9 rounded border border-danger/40 bg-danger-light text-danger text-[11px] font-semibold px-3 flex items-center justify-center flex-shrink-0 whitespace-nowrap">
                RTO +{rtoDays.toFixed(0)}d
              </div>
            </div>
          </div>

          {/* Caption row */}
          <div className="flex items-center gap-2 mt-1">
            <div className="w-16 flex-shrink-0" />
            <div className="flex-1 flex items-stretch gap-1.5">
              {segments.map((seg) => (
                <div
                  key={seg.key}
                  className="text-[9px] text-muted text-center"
                  style={{ width: `${seg.width}%`, minWidth: seg.minWidth }}
                >
                  {seg.caption}
                </div>
              ))}
              <div className="w-20 flex-shrink-0 text-[9px] text-success text-center font-semibold">
                {inEtaText || "ETA"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {dispatchOverSla && (
        <div className="text-[11px] text-muted mt-2">
          Dispatch TAT is the primary bottleneck —{" "}
          <span className="text-warning font-semibold">
            {d0h.toFixed(1)}h vs {SLA_DISPATCH_HOURS}h SLA
          </span>
          . Reduce by moving same-day cut-off{" "}
          {Math.max(1, Math.round(d0h - SLA_DISPATCH_HOURS))}h earlier.
        </div>
      )}
    </div>
  );
}
