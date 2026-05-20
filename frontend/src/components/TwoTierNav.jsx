import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { Calendar, MessageSquare, ShieldCheck, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";

// Each top tab with its second-nav pages
const NAV_STRUCTURE = [
  { key: "overall",        label: "Overall",        defaultTo: null, pages: [] },
  {
    key: "d2c",
    label: "D2C",
    defaultTo: "/d2c-overview",
    pages: [
      { to: "/d2c-overview", label: "Overview" },
      { to: "/web-cr",       label: "Web CR" },
      { to: "/app-cr",       label: "App CR" },
      { to: "/rto",          label: "D2C RTO" },
      { to: "/repeat",       label: "Repeat & retention" },
      { to: "/promo",        label: "Promo & basket" },
      { to: "/supply",       label: "Supply chain" },
      { to: "/acquisition",  label: "Acquisition" },
    ],
  },
  { key: "marketplace",    label: "Marketplace",    defaultTo: null, pages: [] },
  { key: "quick-commerce", label: "Quick commerce", defaultTo: null, pages: [] },
  { key: "marketing",      label: "Marketing",      defaultTo: null, pages: [] },
  { key: "influencer",     label: "Influencer",     defaultTo: null, pages: [] },
  { key: "crm",            label: "Customer/CRM",   defaultTo: null, pages: [] },
];

// Which top tab each route belongs to
const ROUTE_TAB = {
  "/d2c-overview": "d2c",
  "/web-cr":       "d2c",
  "/app-cr":       "d2c",
  "/rto":          "d2c",
  "/repeat":       "d2c",
  "/promo":        "d2c",
  "/supply":       "d2c",
  "/acquisition":  "d2c",
};

export function TwoTierNav({
  startDate,
  endDate,
  onDateChange,
  compareMode,
  onCompareModeChange,
  onAskBot,
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, canAccess } = useAuth();

  const activeTabKey  = ROUTE_TAB[location.pathname] ?? null;
  const activeSection = NAV_STRUCTURE.find((s) => s.key === activeTabKey);
  const secondNav     = (activeSection?.pages ?? []).filter((p) => canAccess(p.to));

  // Only show top-level tabs where the user can access at least one child page
  const visibleTabs = NAV_STRUCTURE.filter(({ pages }) => {
    if (isAdmin) return true;
    if (pages.length === 0) return false;
    return pages.some((p) => canAccess(p.to));
  });

  return (
    <div className="bg-surface sticky top-0 z-30 shadow-sm">
      {/* ── Top tier ── */}
      <div className="border-b border-border">
        <div className="max-w-[1600px] mx-auto px-6 flex items-stretch justify-between h-11">
          {/* Left: brand + tabs */}
          <div className="flex items-stretch gap-3">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
                <LayoutDashboard className="w-4 h-4 text-white" />
              </div>
              <span className="font-semibold text-sm text-text">Innovist</span>
            </div>

            {/* Tab buttons — full height so border-b sits at container bottom */}
            <nav className="flex items-stretch gap-0.5">
              {visibleTabs.map(({ key, label, defaultTo }) => {
                const isActive = activeTabKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => defaultTo && navigate(defaultTo)}
                    className={cn(
                      "relative px-3 text-[13px] font-medium transition-colors border-b-2 -mb-px",
                      isActive
                        ? "text-text border-accent"
                        : "text-muted hover:text-text border-transparent hover:border-border"
                    )}
                  >
                    {label}
                  </button>
                );
              })}
            </nav>
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
        <div className="max-w-[1600px] mx-auto px-6 h-11 flex items-center justify-between">
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

            {/* Divider */}
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

            {/* Divider */}
            <div className="w-px h-5 bg-border" />

            {/* Ask bot */}
            <button
              onClick={onAskBot}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-md transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Ask bot
            </button>

            {/* Admin link — only for super admins */}
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
  );
}
