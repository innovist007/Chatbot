import { cn } from "@/lib/utils";

export const WEB_CR_TABS = [
  { key: "overview", label: "Overview", color: "var(--blue, #185FA5)" },
  { key: "funnel", label: "Funnel", color: "var(--purple, #534AB7)" },
  { key: "channels", label: "Channels", color: "var(--teal, #0F6E56)" },
  { key: "pages", label: "Pages & Products", color: "var(--amber, #854F0B)" },
  { key: "checkout", label: "Checkout", color: "var(--coral, #993C1D)" },
  { key: "payments", label: "Payments", color: "var(--green, #3B6D11)" },
  { key: "geo", label: "Geography", color: "var(--red, #A32D2D)" },
];

export function WebCrTabs({ active, onChange }) {
  return (
    <div className="sticky top-0 z-30 -mx-6 px-6 bg-bg/95 backdrop-blur border-b border-border">
      <div className="flex items-center gap-1 overflow-x-auto py-2">
        {WEB_CR_TABS.map((t) => {
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
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: t.color }}
              />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
