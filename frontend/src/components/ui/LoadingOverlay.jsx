// components/LoadingOverlay.jsx

import { cn } from "@/lib/utils";

export function LoadingOverlay({ loading, children, className, label = "Loading…" }) {
  return (
    <div className={cn("relative", className)}>
      {loading && (
        <div className="absolute inset-0 z-20 rounded-xl bg-background/60 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 border-[3px] border-accent border-t-transparent rounded-full animate-spin" />
          {label && (
            <span className="text-xs font-medium text-text-secondary">{label}</span>
          )}
        </div>
      )}

      <div
        className={cn(
          "transition-opacity duration-200",
          loading && "opacity-70"
        )}
      >
        {children}
      </div>
    </div>
  );
}
