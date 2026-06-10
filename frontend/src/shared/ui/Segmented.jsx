import { cn } from "@/lib/utils";

export function Segmented({ value, onChange, options, className }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 p-0.5 rounded bg-elevated border border-border",
        className
      )}
    >
      {options.map((opt) => {
        const v = typeof opt === "string" ? opt : opt.value;
        const label = typeof opt === "string" ? opt : opt.label;
        const active = value === v;
        return (
          <button
            key={v ?? "all"}
            onClick={() => onChange(v)}
            className={cn(
              "px-3 py-1 rounded text-xs font-medium transition-colors",
              active
                ? "bg-surface text-text shadow-sm"
                : "text-muted hover:text-text"
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}