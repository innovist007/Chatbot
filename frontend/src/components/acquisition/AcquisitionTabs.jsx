import { cn } from "@/lib/utils";

export const ACQUISITION_TABS = [
  { key: "overview",    label: "Overview",        color: "#185FA5" },
  { key: "meta",        label: "Meta Ads",         color: "#534AB7" },
  { key: "google",      label: "Google Ads",       color: "#185FA5" },
  { key: "partnership", label: "Partnerships",     color: "#0F6E56" },
  { key: "quality",     label: "Customer Quality", color: "#854F0B" },
  { key: "actions",     label: "Action Center",    color: "#993C1D" },
];

export function AcquisitionTabs({ active, onChange }) {
  return (
    <div className="sticky top-0 z-30 -mx-6 px-6 bg-bg/95 backdrop-blur border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {ACQUISITION_TABS.map((t) => {
          const isActive = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                  : "text-muted hover:text-text hover:bg-elevated"
              )}
            >
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: t.color }} />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
