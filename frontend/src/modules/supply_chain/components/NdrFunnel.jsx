import { fmt, cn } from "@/lib/utils";

export function NdrFunnel({ data }) {
  if (!data?.total_orders) {
    return <div className="text-sm text-muted py-8 text-center">No data</div>;
  }
  const total = data.total_orders;
  const steps = [
    { label: "All orders",              orders: total,                         share: 1,                                    tone: "blue"     },
    { label: "NDR raised",              orders: data.ndr_raised,               share: data.ndr_raised / (total || 1),       tone: "red"      },
    { label: "Re-attempted",            orders: data.reattempted,              share: data.reattempted / (total || 1),      tone: "amber"    },
    { label: "Delivered on re-attempt", orders: data.delivered_on_reattempt,   share: data.delivered_on_reattempt / (total || 1), tone: "green" },
    { label: "→ RTO",                   orders: data.ndr_to_rto,               share: data.ndr_to_rto / (total || 1),       tone: "red-dark" },
  ];

  const ndrToRtoRate  = data.ndr_to_rto_rate  || 0;
  const reattemptRate = data.reattempt_rate    || 0;
  const ndrRaised     = data.ndr_raised        || 0;
  const targetReattempt = 0.75;
  const savable = Math.max(0, Math.round(ndrRaised * (targetReattempt - reattemptRate) * 0.6));

  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <FunnelRow key={i} {...s} />
      ))}
      <div className="mt-3 rounded border border-danger/30 bg-danger-light px-3.5 py-2.5 text-[11px] text-danger leading-relaxed">
        <span className="font-semibold">Key insight:</span>{" "}
        {fmt.pct(ndrToRtoRate)} of NDR orders become RTO. Improving re-attempt rate from{" "}
        <span className="font-semibold">{fmt.pct(reattemptRate)}</span> →{" "}
        <span className="font-semibold">{fmt.pct(targetReattempt)}</span> saves ~{fmt.num(savable)} orders/month.
        Lever: IVR call + WhatsApp message within 2h of first failed delivery attempt.
      </div>
    </div>
  );
}

const TONE = {
  blue:       "bg-accent",
  red:        "bg-danger",
  amber:      "bg-warning",
  green:      "bg-success",
  "red-dark": "bg-danger/90",
};

const LABEL_TONE = {
  blue:       "text-accent",
  red:        "text-danger",
  amber:      "text-warning",
  green:      "text-success",
  "red-dark": "text-danger",
};

function FunnelRow({ label, orders, share, tone }) {
  const pctWidth  = Math.max(share * 100, 2);
  const numInside = pctWidth >= 14;

  return (
    <div className="flex items-center gap-2">
      {/* Label */}
      <div className={cn("w-24 sm:w-40 text-right text-[10px] sm:text-[11px] flex-shrink-0 font-medium", LABEL_TONE[tone])}>
        {label}
      </div>

      {/* Bar — overflow:hidden so bar edges are clean */}
      <div className="flex-1 h-6 bg-elevated rounded overflow-hidden min-w-0">
        <div
          className={cn("h-6 flex items-center px-2 text-[11px] font-semibold text-white", TONE[tone])}
          style={{ width: `${pctWidth}%` }}
        >
          {numInside && fmt.num(orders)}
        </div>
      </div>

      {/* Number as a flex sibling — always visible, never clipped */}
      {!numInside && (
        <span className={cn("flex-shrink-0 text-[11px] font-semibold whitespace-nowrap", LABEL_TONE[tone])}>
          {fmt.num(orders)}
        </span>
      )}
    </div>
  );
}
