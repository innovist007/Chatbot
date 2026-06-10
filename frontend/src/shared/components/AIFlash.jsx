import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AIFlash({ title = "AI daily flash", summary, date, tags = [], loading, pending }) {
  return (
    <div className="bg-gradient-to-r from-accent-soft to-accent-light/40 border border-accent/20 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded bg-accent flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="text-[12px] font-semibold text-accent">{title}</div>
        {date && <div className="text-[11px] text-muted ml-auto">{date}</div>}
      </div>

      <div className="text-[12.5px] leading-relaxed text-text-secondary mb-2">
        {summary || (pending ? "✦ AI is analysing your data…" : loading ? "Loading…" : "—")}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t, idx) => (
            <span
              key={idx}
              className={cn(
                "text-[10px] font-medium px-2 py-0.5 rounded-full",
                t.tone === "red"   && "bg-danger-light text-danger",
                t.tone === "amber" && "bg-warning-light text-warning",
                t.tone === "green" && "bg-success-light text-success",
                t.tone === "blue"  && "bg-accent-soft text-accent",
                !t.tone            && "bg-elevated text-text-secondary"
              )}
            >
              {t.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
