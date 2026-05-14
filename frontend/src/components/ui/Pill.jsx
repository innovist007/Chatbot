import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-elevated text-text-secondary border-border",
  green:   "bg-success-light text-success border-success/20",
  amber:   "bg-warning-light text-warning border-warning/20",
  red:     "bg-danger-light text-danger border-danger/20",
  accent:  "bg-accent-light text-accent border-accent/20",
  // Supply Chain palette
  "sc-green":  "bg-sc-green-light text-sc-green border-sc-green-mid/40",
  "sc-amber":  "bg-sc-amber-light text-sc-amber border-sc-amber-mid/40",
  "sc-red":    "bg-sc-red-light text-sc-red border-sc-red-mid/40",
  "sc-blue":   "bg-sc-blue-light text-sc-blue border-sc-blue-mid/40",
  "sc-purple": "bg-sc-purple-light text-sc-purple border-sc-purple-mid/40",
  "sc-gray":   "bg-sc-gray-100 text-sc-gray-600 border-sc-gray-200",
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