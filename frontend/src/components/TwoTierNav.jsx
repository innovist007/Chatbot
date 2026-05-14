import { NavLink } from "react-router-dom";
import { Calendar, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

const TOP_NAV = [
  { to: "/overall", label: "Overall" },
  { to: "/d2c", label: "D2C" },
  { to: "/marketplace", label: "Marketplace" },
  { to: "/quick-commerce", label: "Quick commerce" },
  { to: "/supply", label: "Supply chain" },
  { to: "/marketing", label: "Marketing" },
  { to: "/influencer", label: "Influencer" },
  { to: "/crm", label: "Customer/CRM" },
];

const SECOND_NAV = [
  { to: "/d2c-overview", label: "Overview", enabled: true },
  { to: "/web-cr", label: "Web CR", enabled: true },
  { to: "/app-cr", label: "App CR", enabled: true },
  { to: "/rto", label: "D2C RTO", enabled: true },
  { to: "/repeat", label: "Repeat & retention", enabled: true },
  { to: "/promo", label: "Promo & basket", enabled: true },
  { to: "/supply", label: "Supply chain", enabled: true },
];

export function TwoTierNav({ 
  startDate,
  endDate,
  onDateChange, 
  compareMode, 
  onCompareModeChange,
  onAskBot 
}) {
  return (
    <div className="border-b border-border bg-surface sticky top-0 z-30 shadow-sm">
      {/* Top tier */}
      <div className="border-b border-border">
        <div className="max-w-[1600px] mx-auto px-6 h-12 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="font-semibold text-sm text-text">Innovist</div>
              <span className="text-muted">·</span>
              <div className="text-sm text-muted">Analytics</div>
            </div>

            <nav className="flex items-center gap-1">
              {TOP_NAV.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-1.5 text-[13px] font-medium rounded transition-colors",
                      isActive
                        ? "bg-elevated text-text"
                        : "text-muted hover:text-text hover:bg-elevated/50"
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium">Apr 1-26, 2026</span>
            <span>·</span>
            <span>synced</span>
          </div>
        </div>
      </div>

      {/* Second tier */}
      <div className="max-w-[1600px] mx-auto px-6 h-12 flex items-center justify-between">
        <nav className="flex items-center gap-1">
          {SECOND_NAV.map(({ to, label, enabled }) => (
            enabled !== false ? (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "px-4 py-1.5 text-[13px] font-medium rounded transition-colors",
                    isActive
                      ? "bg-accent text-white"
                      : "text-muted hover:text-text hover:bg-elevated"
                  )
                }
              >
                {label}
              </NavLink>
            ) : (
              <button
                key={to}
                disabled
                className="px-4 py-1.5 text-[13px] font-medium text-dim cursor-not-allowed"
              >
                {label}
              </button>
            )
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {/* Date range */}
          <div className="flex items-center gap-2 px-2.5 py-1 rounded border border-border text-xs">
            <Calendar className="w-3.5 h-3.5 text-muted" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onDateChange?.({ start: e.target.value, end: endDate })}
              className="bg-transparent outline-none w-[90px] text-text"
            />
            <span className="text-muted">→</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onDateChange?.({ start: startDate, end: e.target.value })}
              className="bg-transparent outline-none w-[90px] text-text"
            />
          </div>

          {/* Compare mode */}
          <div className="flex items-center gap-1 bg-elevated rounded p-0.5">
            {["DoD", "WoW", "MoM"].map((mode) => (
              <button
                key={mode}
                onClick={() => onCompareModeChange?.(mode)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium rounded transition-colors",
                  compareMode === mode
                    ? "bg-surface text-text shadow-sm"
                    : "text-muted hover:text-text"
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          {/* Ask bot button */}
          <button
            onClick={onAskBot}
            className="flex items-center gap-2 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Ask bot
          </button>
        </div>
      </div>
    </div>
  );
}