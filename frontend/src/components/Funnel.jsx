import { fmt, cn } from "@/lib/utils";

export function Funnel({ steps, dropReasons }) {
  if (!steps || steps.length === 0) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }

  const sessions = steps[0].count || 1;

  return (
    <div className="space-y-0">
      {steps.map((s, i) => {
        const widthPct = Math.max(2, (s.count / sessions) * 100);
        const isFirst = i === 0;
        const hasDropReason = dropReasons && dropReasons[s.step];
        
        return (
          <div key={s.step}>
            {/* Main step row */}
            <div className="grid grid-cols-[180px_1fr_100px_100px] gap-4 py-3 items-center border-b border-border last:border-b-0">
              <div className="text-sm font-medium text-text">{s.step}</div>

              <div className="relative h-8 bg-elevated rounded overflow-hidden">
                {/* Blue gradient bar */}
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
                  style={{
                    width: `${widthPct.toFixed(2)}%`,
                    background: "linear-gradient(90deg, #3b82f6 0%, #60a5fa 100%)",
                  }}
                />
                
                {/* Numbers - dark text visible on both white and blue */}
                <div className="absolute inset-y-0 left-3 flex items-center gap-2 text-sm font-bold text-text">
                  <span>{fmt.num(s.count)}</span>
                  {!isFirst && (
                    <span className="text-text-secondary font-normal text-xs">
                      {fmt.pct(s.step_conversion)}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right text-sm tnum font-semibold text-text">
                {fmt.pct(s.overall_pct)}
              </div>
              
              <div
                className={cn(
                  "text-right text-sm tnum font-semibold flex items-center justify-end gap-1",
                  isFirst && "text-muted",
                  !isFirst && s.drop > 0.4 && "text-danger",
                  !isFirst && s.drop > 0.2 && s.drop <= 0.4 && "text-warning",
                  !isFirst && s.drop <= 0.2 && s.drop > 0 && "text-warning",
                  !isFirst && s.drop <= 0 && "text-success"
                )}
              >
                {isFirst ? "100%" : (
                  <>
                    <span className="text-danger">▼</span>
                    {fmt.pct(s.drop)}
                  </>
                )}
              </div>
            </div>

            {/* Drop reasons row - ONLY if data provided */}
            {!isFirst && hasDropReason && s.drop > 0.1 && (
              <div className="grid grid-cols-[180px_1fr] gap-4 py-2 bg-elevated/30 border-b border-border/50">
                <div className="text-xs uppercase tracking-wider font-semibold text-muted">
                  Drop reasons
                </div>
                <div className="text-xs text-text-secondary leading-relaxed">
                  {dropReasons[s.step]}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}