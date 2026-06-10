import { cn } from "@/lib/utils";

export const APP_CR_TABS = [
  { key: "overview",   label: "Overview",              color: "#185FA5" },
  { key: "funnel",     label: "App Funnel",             color: "#534AB7" },
  { key: "media",      label: "Media Sources",          color: "#0F6E56" },
  { key: "retarget",   label: "Retargeting",            color: "#854F0B" },
  { key: "cohorts",    label: "Cohorts",                color: "#993C1D" },
  { key: "geo",        label: "Geography",              color: "#A32D2D" },
  { key: "installs",   label: "Installs & Uninstalls",  color: "#993C1D" },
  { key: "versions",   label: "App Versions",           color: "#534AB7" },
];

export function AppCRTabs({ active, onChange }) {
  return (
    <div className="sticky top-0 z-30 -mx-6 px-6 bg-bg/95 backdrop-blur border-b border-border">
      <div className="relative">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide py-2">
          {APP_CR_TABS.map((t) => {
            const isActive = active === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onChange(t.key)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "bg-blue-50 text-blue-700"
                    : "text-muted hover:text-text hover:bg-elevated",
                )}
              >
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ background: t.color }}
                />
                {t.label}
              </button>
            );
          })}
        </div>
        {/* Right-edge fade hints that more tabs can be scrolled */}
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-bg/95 to-transparent" />
      </div>
    </div>
  );
}
