import { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { X, ChevronDown, ChevronRight, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { NAV_STRUCTURE, ROUTE_TAB } from "@/lib/navConfig";

export function SidebarNav({ open, onClose }) {
  const location  = useLocation();
  const { isAdmin, canAccess } = useAuth();

  const activeTabKey = ROUTE_TAB[location.pathname] ?? null;
  const [expandedKey, setExpandedKey] = useState(activeTabKey);

  // Keep active section expanded when route changes
  useEffect(() => {
    if (activeTabKey) setExpandedKey(activeTabKey);
  }, [activeTabKey]);

  const visibleTabs = NAV_STRUCTURE.filter(({ pages }) => {
    if (isAdmin) return true;
    if (pages.length === 0) return false;
    return pages.some((p) => canAccess(p.to));
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/40 z-40 transition-opacity duration-300",
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div
        className={cn(
          "fixed top-0 left-0 h-full w-60 bg-surface border-r border-border z-50",
          "flex flex-col shadow-lifted",
          "transition-transform duration-300 ease-in-out",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 h-11 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
              <LayoutDashboard className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm text-text">Innovist</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-text hover:bg-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav accordion */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleTabs.map(({ key, label, pages }) => {
            const isActive     = activeTabKey === key;
            const isExpanded   = expandedKey === key;
            const accessiblePages = pages.filter((p) => canAccess(p.to));
            const hasPages     = accessiblePages.length > 0;

            return (
              <div key={key}>
                {/* Section header — toggles accordion */}
                <button
                  onClick={() => setExpandedKey(isExpanded ? null : key)}
                  className={cn(
                    "w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-medium transition-colors",
                    isActive
                      ? "text-accent bg-accent-soft"
                      : "text-text hover:bg-elevated"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0" />
                    )}
                    <span>{label}</span>
                  </div>
                  {hasPages && (
                    isExpanded
                      ? <ChevronDown  className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                      : <ChevronRight className="w-3.5 h-3.5 text-muted flex-shrink-0" />
                  )}
                </button>

                {/* Sub-pages — indented with a left border to show nesting */}
                {hasPages && isExpanded && (
                  <div className="ml-6 mr-3 mb-1 border-l-2 border-border pl-3">
                    {accessiblePages.map(({ to, label: pageLabel }) => (
                      <NavLink
                        key={to}
                        to={to}
                        onClick={onClose}
                        className={({ isActive: active }) =>
                          cn(
                            "flex items-center px-3 py-1.5 text-[12px] rounded-md transition-colors",
                            active
                              ? "bg-accent text-white font-medium"
                              : "text-muted hover:text-text hover:bg-elevated"
                          )
                        }
                      >
                        {pageLabel}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <p className="text-[11px] text-muted">Innovist Analytics · Dashboard</p>
        </div>
      </div>
    </>
  );
}
