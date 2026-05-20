import { ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "./ui/Card";
import { fmt, cn } from "@/lib/utils";

export function KpiCard({ label, value, delta, compareLabel = "MoM" }) {
  const direction = delta == null ? "flat" : delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";
  const tone      = direction === "up" ? "success" : direction === "down" ? "danger" : "muted";
  const DeltaIcon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <Card className="px-4 py-3 hover:shadow-hover hover:border-accent/30 transition-all cursor-default">
      <div className="text-[11px] font-medium text-muted mb-2">{label}</div>
      <div className="text-[22px] font-bold tnum text-text leading-tight">{value}</div>
      {delta != null && (
        <div className="mt-1.5 flex items-center gap-1 text-[11px]">
          <span className={cn(
            "inline-flex items-center gap-0.5 font-semibold",
            tone === "success" && "text-success",
            tone === "danger"  && "text-danger",
            tone === "muted"   && "text-muted"
          )}>
            {direction !== "flat" && <DeltaIcon className="w-3 h-3" />}
            {fmt.delta(delta)}
          </span>
          <span className="text-muted">{compareLabel}</span>
        </div>
      )}
    </Card>
  );
}
