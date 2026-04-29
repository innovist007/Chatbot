import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-elevated text-text-secondary border-border",
  green:   "bg-success-light text-success border-success/20",
  amber:   "bg-warning-light text-warning border-warning/20",
  red:     "bg-danger-light text-danger border-danger/20",
  accent:  "bg-accent-light text-accent border-accent/20",
};

export function Pill({ tone = "neutral", className, children, ...props }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}