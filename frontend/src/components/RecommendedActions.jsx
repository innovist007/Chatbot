import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function RecommendedActions({ actions, onAct }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div className="rounded-xl bg-accent-bg border border-accent/20 p-5 mb-6 shadow-[0_0_40px_-12px_rgba(59,130,246,0.2)]">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_8px_rgba(59,130,246,0.6)]" />
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
          Recommended actions · Biggest impact first
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {actions.map((a, i) => (
          <button
            key={i}
            onClick={() => onAct?.(a)}
            className={cn(
              "text-left p-4 rounded-lg",
              "bg-bg/50 border border-accent/15",
              "transition-all duration-200 group",
              "hover:border-accent/40 hover:-translate-y-1 hover:shadow-[0_8px_24px_-8px_rgba(59,130,246,0.3)]"
            )}
          >
            <div className="text-[11px] font-semibold uppercase tracking-wider text-accent mb-1.5 font-mono">
              {a.impact}
            </div>
            <div className="text-sm font-semibold text-text mb-1 group-hover:text-accent-hover transition-colors">
              {a.title}
            </div>
            <div className="text-[12px] text-muted leading-relaxed">
              {a.description}
            </div>
            <div className="mt-3 flex items-center gap-1 text-[12px] text-accent opacity-0 group-hover:opacity-100 transition-all translate-x-0 group-hover:translate-x-1">
              Investigate
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}