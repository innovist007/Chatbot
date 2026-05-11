// components/LoadingOverlay.jsx

import { cn } from "@/lib/utils";

export function LoadingOverlay({ loading, children, className }) {
  return (
    <div className={cn("relative", className)}>
      {loading && (
        <div className="absolute inset-0 z-20 rounded-xl bg-background/40 backdrop-blur-[1px] flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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