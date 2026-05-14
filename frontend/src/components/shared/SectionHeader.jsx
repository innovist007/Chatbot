import { cn } from "@/lib/utils";

const TONES = {
  purple: { bg: "bg-purple-50 dark:bg-purple-950/20", text: "text-purple-700 dark:text-purple-400" },
  green:  { bg: "bg-emerald-50 dark:bg-emerald-950/20", text: "text-emerald-700 dark:text-emerald-400" },
  amber:  { bg: "bg-amber-50 dark:bg-amber-950/20", text: "text-amber-700 dark:text-amber-400" },
  red:    { bg: "bg-rose-50 dark:bg-rose-950/20", text: "text-rose-700 dark:text-rose-400" },
  blue:   { bg: "bg-sky-50 dark:bg-sky-950/20", text: "text-sky-700 dark:text-sky-400" },
  gray:   { bg: "bg-elevated", text: "text-text-secondary" },
};

export function SectionHeader({ title, subtitle, tone = "gray", actions, className }) {
  const t = TONES[tone] || TONES.gray;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-3 py-1.5 rounded",
        t.bg,
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("text-[11px] font-semibold uppercase tracking-wider", t.text)}>
          {title}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {subtitle && <span className="text-[11px] text-muted">{subtitle}</span>}
        {actions}
      </div>
    </div>
  );
}
