import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  red:   { card: "bg-danger-light/60 border-danger/30",   text: "text-danger",  icon: AlertTriangle,   iconBg: "bg-danger-light"   },
  amber: { card: "bg-warning-light/60 border-warning/30", text: "text-warning", icon: AlertTriangle,   iconBg: "bg-warning-light"  },
  green: { card: "bg-success-light/60 border-success/30", text: "text-success", icon: CheckCircle2,    iconBg: "bg-success-light"  },
  blue:  { card: "bg-accent-soft border-accent/30",       text: "text-accent",  icon: Info,            iconBg: "bg-accent-light"   },
};

export function AlertCard({ tone = "blue", title, body }) {
  const t   = TONES[tone] || TONES.blue;
  const Icon = t.icon;
  return (
    <div className={cn("p-3.5 rounded-xl border flex gap-3", t.card)}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5", t.iconBg)}>
        <Icon className={cn("w-4 h-4", t.text)} />
      </div>
      <div className="min-w-0">
        <div className={cn("text-[12.5px] font-semibold mb-0.5", t.text)}>{title}</div>
        <div className="text-[11.5px] leading-relaxed text-text-secondary">{body}</div>
      </div>
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
