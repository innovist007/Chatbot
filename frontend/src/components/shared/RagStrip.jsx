import { cn } from "@/lib/utils";

const TONE_BAR = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-danger",
  blue: "bg-accent",
  gray: "bg-muted",
};

const TONE_TEXT = {
  green: "text-success",
  amber: "text-warning",
  red: "text-danger",
  blue: "text-accent",
  gray: "text-text",
};

export function RagStrip({ items }) {
  if (!items?.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 bg-surface border border-border rounded-lg overflow-hidden shadow-card">
      {items.map((it, idx) => {
        const barColor = TONE_BAR[it.tone] || TONE_BAR.gray;
        const textColor = TONE_TEXT[it.tone] || TONE_TEXT.gray;
        return (
          <div
            key={idx}
            className={cn(
              "relative px-4 py-3",
              idx < items.length - 1 && "border-r border-border"
            )}
          >
            <div className={cn("absolute top-0 left-0 right-0 h-0.5", barColor)} />
            <div className="text-[11px] text-muted">{it.label}</div>
            <div className={cn("text-xl font-semibold tracking-tight tnum mt-1", textColor)}>
              {it.value ?? "—"}
            </div>
            {it.sub && (
              <div className={cn("text-[11px] mt-1 font-medium", textColor)}>{it.sub}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
