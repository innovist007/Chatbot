import { ArrowUp, ArrowDown, Info } from "lucide-react";
import { Card } from "./ui/Card";
import { fmt, cn } from "@/lib/utils";
import { useState } from "react";

export function KpiCard({ label, value, delta, compareLabel = "MoM", insight }) {
  const [showInsight, setShowInsight] = useState(false);
  
  const direction = delta == null ? "flat" : delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";
  const tone = direction === "up" ? "success" : direction === "down" ? "danger" : "muted";
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowInsight(true)}
      onMouseLeave={() => setShowInsight(false)}
    >
      <Card className="px-4 py-3 transition-all hover:shadow-hover hover:border-accent/30">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs text-muted mb-1">{label}</div>
            <div className="text-2xl font-bold tnum text-text">{value}</div>
            {delta != null && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-semibold",
                    tone === "success" && "text-success",
                    tone === "danger" && "text-danger",
                    tone === "muted" && "text-muted"
                  )}
                >
                  {direction !== "flat" && <Icon className="w-3 h-3" />}
                  {fmt.delta(delta)}
                </span>
                <span className="text-muted">{compareLabel}</span>
              </div>
            )}
          </div>
          {insight && (
            <Info className="w-3.5 h-3.5 text-muted opacity-40 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </Card>

      {/* Hover insight tooltip - positioned on RIGHT side */}
      {insight && showInsight && (
        <div className="absolute left-full top-0 ml-3 z-50 w-64 animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-none">
          <div className="bg-surface border border-border-strong rounded-lg shadow-lifted p-3 text-xs text-text-secondary leading-relaxed">
            <div className="flex items-start gap-2">
              <div className={cn(
                "w-1 h-1 rounded-full mt-1.5 flex-shrink-0",
                tone === "success" && "bg-success",
                tone === "danger" && "bg-danger",
                tone === "muted" && "bg-muted"
              )} />
              <div>{insight}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}