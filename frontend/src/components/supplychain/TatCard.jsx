import { cn } from "@/lib/utils";

const TONES = {
  amber: {
    wrap: "bg-sc-amber-light border-sc-amber-mid/60",
    label: "text-sc-amber",
    value: "text-sc-amber",
  },
  blue: {
    wrap: "bg-sc-blue-light border-sc-blue-mid/60",
    label: "text-sc-blue",
    value: "text-sc-blue",
  },
  green: {
    wrap: "bg-sc-green-light border-sc-green-mid/60",
    label: "text-sc-green",
    value: "text-sc-green",
  },
  red: {
    wrap: "bg-sc-red-light border-sc-red-mid/60",
    label: "text-sc-red",
    value: "text-sc-red",
  },
  gray: {
    wrap: "bg-sc-gray-50 border-sc-gray-200",
    label: "text-sc-gray-600",
    value: "text-sc-gray-900",
  },
};

export function TatCard({ tone = "gray", label, value, sub, subTone }) {
  const t = TONES[tone] || TONES.gray;
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", t.wrap)}>
      <div className={cn("text-[10px] font-medium uppercase tracking-wider mb-1", t.label)}>
        {label}
      </div>
      <div className={cn("text-base font-semibold font-mono tnum", t.value)}>
        {value ?? "—"}
      </div>
      {sub && (
        <div
          className={cn(
            "text-[10px] mt-1 font-medium",
            subTone === "red" && "text-sc-red",
            subTone === "green" && "text-sc-green",
            subTone === "amber" && "text-sc-amber",
            !subTone && "text-sc-gray-600"
          )}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function TatGrid({ items }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
      {items.map((it, i) => (
        <TatCard key={i} {...it} />
      ))}
    </div>
  );
}
