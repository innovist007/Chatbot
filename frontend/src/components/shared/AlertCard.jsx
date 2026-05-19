import { cn } from "@/lib/utils";

const TONES = {
  red:   "bg-danger-light/60 border-danger/30 text-danger",
  amber: "bg-warning-light/60 border-warning/30 text-warning",
  green: "bg-success-light/60 border-success/30 text-success",
  blue:  "bg-accent-soft border-accent/30 text-accent",
};

export function AlertCard({ tone = "blue", title, body }) {
  return (
    <div className={cn("p-3 rounded border", TONES[tone] || TONES.blue)}>
      <div className="text-[12px] font-semibold mb-1">{title}</div>
      <div className="text-[11px] leading-relaxed">{body}</div>
    </div>
  );
}

export function AlertsGrid({ alerts }) {
  if (!alerts?.length) {
    return <div className="text-sm text-muted py-4 text-center">No alerts.</div>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {alerts.map((a, i) => (
        <AlertCard key={i} tone={a.tone} title={a.title} body={a.body} />
      ))}
    </div>
  );
}
