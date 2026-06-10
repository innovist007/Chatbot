import { ArrowUp, ArrowDown, Info } from "lucide-react";
import { Card } from "@/shared/ui/Card";
import { fmt, cn } from "@/lib/utils";

/**
 * KpiCard
 *
 * Props:
 *  label          — card title
 *  value          — formatted value string
 *  delta          — fractional change e.g. 0.12 = +12 % (null hides badge)
 *  positiveIsBad  — reverses colour logic: ▲ red, ▼ green (default false)
 *  critical       — show red border + tinted bg (e.g. ROAS < 1.0)
 *  tip            — tooltip text shown next to label via title attr
 */
export function KpiCard({ label, value, delta, positiveIsBad = false, critical = false, tip }) {
  const direction = delta == null ? "flat" : delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";

  // Determine semantic tone respecting positiveIsBad flag
  let tone = "muted";
  if (direction === "up")   tone = positiveIsBad ? "danger"  : "success";
  if (direction === "down") tone = positiveIsBad ? "success" : "danger";

  const DeltaIcon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <Card
      className={cn(
        "px-4 py-3 hover:shadow-hover transition-all cursor-default",
        critical
          ? "border-danger/50 bg-danger-light hover:border-danger"
          : "hover:border-accent/30"
      )}
    >
      <div className="flex items-center gap-1 mb-2">
        <span className="text-[11px] font-medium text-muted leading-none">{label}</span>
        {tip && (
          <span title={tip} className="text-muted cursor-help">
            <Info className="w-3 h-3" />
          </span>
        )}
      </div>
      <div className={cn("text-[22px] font-bold tnum leading-tight", critical ? "text-danger" : "text-text")}>
        {value}
      </div>
      {delta != null && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px]">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-semibold",
              tone === "success" && "text-success",
              tone === "danger"  && "text-danger",
              tone === "muted"   && "text-muted"
            )}
          >
            {direction !== "flat" && <DeltaIcon className="w-3 h-3" />}
            {fmt.delta(delta)}
          </span>
        </div>
      )}
    </Card>
  );
}
