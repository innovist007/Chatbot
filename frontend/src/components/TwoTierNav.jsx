import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Calendar, MessageSquare, ShieldCheck, LayoutDashboard, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { NAV_STRUCTURE, ROUTE_TAB } from "@/lib/navConfig";
import { SidebarNav } from "@/components/SidebarNav";

export function TwoTierNav({
  startDate,
  endDate,
  onDateChange,
  compareMode,
  onCompareModeChange,
  onAskBot,
}) {
  const location  = useLocation();
  const { isAdmin, canAccess } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const activeTabKey  = ROUTE_TAB[location.pathname] ?? null;
  const activeSection = NAV_STRUCTURE.find((s) => s.key === activeTabKey);
  const secondNav     = (activeSection?.pages ?? []).filter((p) => canAccess(p.to));

  return (
    <>
      <SidebarNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="bg-surface sticky top-0 z-30 shadow-sm">
        {/* ── Top tier ── */}
        <div className="border-b border-border">
          <div className="max-w-[1600px] mx-auto px-4 flex items-stretch justify-between h-11">
            {/* Left: hamburger + brand + tabs */}
            <div className="flex items-stretch gap-2">
              {/* Hamburger */}
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center w-8 text-muted hover:text-text hover:bg-elevated rounded transition-colors flex-shrink-0"
                aria-label="Open navigation"
              >
                <Menu className="w-4 h-4" />
              </button>

              {/* Brand */}
              <div className="flex items-center gap-2 flex-shrink-0 pl-1">
                <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
                  <LayoutDashboard className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-sm text-text">Innovist</span>
              </div>
            </div>

            {/* Right: sync status */}
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="font-medium">Apr 1–26, 2026</span>
              <span className="text-muted/50">·</span>
              <span>synced</span>
            </div>
          </div>
        </div>

        {/* ── Second tier ── */}
        <div className="border-b border-border bg-surface/80">
          <div className="max-w-[1600px] mx-auto px-4 h-11 flex items-center justify-between">
            {/* Page tabs */}
            <nav className="flex items-center gap-0.5">
              {secondNav.map(({ to, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors whitespace-nowrap",
                      isActive
                        ? "bg-accent text-white shadow-sm"
                        : "text-muted hover:text-text hover:bg-elevated"
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>

            {/* Controls */}
            <div className="flex items-center gap-2.5">
              {/* Date range */}
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs bg-elevated/50">
                <Calendar className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => onDateChange?.({ start: e.target.value, end: endDate })}
                  className="bg-transparent outline-none w-[88px] text-text"
                />
                <span className="text-muted">→</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => onDateChange?.({ start: startDate, end: e.target.value })}
                  className="bg-transparent outline-none w-[88px] text-text"
                />
              </div>

              <div className="w-px h-5 bg-border" />

              {/* Compare mode */}
              <div className="flex items-center gap-0.5 bg-elevated rounded-md p-0.5">
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

              <div className="w-px h-5 bg-border" />

              {/* Ask bot */}
              <button
                onClick={onAskBot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-md transition-colors"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Ask bot
              </button>

              {/* Admin — super admins only */}
              {isAdmin && (
                <NavLink
                  to="/admin"
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-elevated text-text"
                        : "text-muted hover:text-text hover:bg-elevated"
                    )
                  }
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin
                </NavLink>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
