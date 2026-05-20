import { cn } from "@/lib/utils";

// Uses the project's `sc-*` palette (defined in tailwind.config.js) so
// section headers match the rest of the dashboard's brand colors instead of
// looking pastel and washed-out.
const TONES = {
  purple: {
    bg: "bg-sc-purple-light",
    text: "text-sc-purple",
    dot: "bg-sc-purple",
    border: "border-sc-purple",
  },
  green: {
    bg: "bg-sc-green-light",
    text: "text-sc-green",
    dot: "bg-sc-green",
    border: "border-sc-green",
  },
  amber: {
    bg: "bg-sc-amber-light",
    text: "text-sc-amber",
    dot: "bg-sc-amber",
    border: "border-sc-amber",
  },
  red: {
    bg: "bg-sc-red-light",
    text: "text-sc-red",
    dot: "bg-sc-red",
    border: "border-sc-red",
  },
  blue: {
    bg: "bg-sc-blue-light",
    text: "text-sc-blue",
    dot: "bg-sc-blue",
    border: "border-sc-blue",
  },
  teal: {
    bg: "bg-sc-teal-light",
    text: "text-sc-teal",
    dot: "bg-sc-teal",
    border: "border-sc-teal",
  },
  coral: {
    // No sc-coral token — inline the brand-mockup coral colors.
    bg: "bg-[#FAECE7]",
    text: "text-[#993C1D]",
    dot: "bg-[#993C1D]",
    border: "border-[#993C1D]",
  },
  gray: {
    bg: "bg-sc-gray-100",
    text: "text-sc-gray-900",
    dot: "bg-sc-gray-600",
    border: "border-sc-gray-400",
  },
};

export function SectionHeader({ title, subtitle, tone = "gray", actions, className }) {
  const t = TONES[tone] || TONES.gray;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2.5 rounded-md border-l-[5px] shadow-card",
        t.bg,
        t.border,
        className,
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={cn("w-2 h-2 rounded-full flex-shrink-0", t.dot)} />
        <span
          className={cn(
            "text-sm font-bold tracking-tight truncate",
            t.text,
          )}
        >
          {title}
        </span>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {subtitle && (
          <span className={cn("text-[11px] font-medium opacity-80", t.text)}>
            {subtitle}
          </span>
        )}
        {actions}
      </div>
    </div>
  );
}
