import { cn } from "@/lib/utils";

const TONE_DOT = {
  amber: "bg-warning",
  blue:  "bg-accent",
  green: "bg-success",
  red:   "bg-danger",
  gray:  "bg-muted",
};

export function TatCard({ tone = "gray", label, value, sub, subTone }) {
  const dot = TONE_DOT[tone] || TONE_DOT.gray;

  return (
    <div className="bg-surface border border-border rounded-lg px-4 py-3 hover:shadow-hover transition-all">
      <div className="flex items-center gap-1.5 mb-2">
        <span className={cn("w-1.5 h-1.5 rounded-full flex-shrink-0", dot)} />
        <div className="text-[11px] font-medium text-muted truncate">{label}</div>
      </div>
      <div className="text-[18px] font-bold font-mono tnum leading-none text-text">
        {value ?? "—"}
      </div>
      {sub && (
        <div className={cn(
          "text-[10px] mt-1.5 font-medium",
          subTone === "red"   && "text-danger",
          subTone === "green" && "text-success",
          subTone === "amber" && "text-warning",
          !subTone            && "text-muted"
        )}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function TatGrid({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((it, i) => (
        <TatCard key={i} {...it} />
      ))}
    </div>
  );
}
