import { fmt, cn } from "@/lib/utils";

const STEP_TONE = {
  Cancelled:    { bar: "bg-warning",  text: "text-warning" },
  RTO:          { bar: "bg-danger",   text: "text-danger"  },
  Others:       { bar: "bg-dim",      text: "text-muted"   },
  "In-transit": { bar: "bg-accent",   text: "text-accent"  },
  Delivered:    { bar: "bg-success",  text: "text-success" },
};

export function Waterfall({ data }) {
  if (!data?.total_orders) {
    return <div className="text-sm text-muted py-8 text-center">No data</div>;
  }
  const total = data.total_orders;
  const order = ["Cancelled", "RTO", "Others", "In-transit"];
  const byLabel = Object.fromEntries((data.steps || []).map((s) => [s.label, s]));
  let runningShare = 1;
  const rows = order.map((label) => {
    const s = byLabel[label] || { orders: 0, share: 0, revenue: 0 };
    const before = runningShare;
    runningShare -= s.share || 0;
    return { ...s, label, before, after: runningShare };
  });
  const delivered = byLabel["Delivered"] || { orders: 0, share: 0, revenue: 0 };

  return (
    <div className="space-y-1.5">
      {/* Total */}
      <Row label="Total orders" bold>
        <Bar pct={100} tone="bg-accent" text={`${fmt.num(total)} · 100%`} textInside />
      </Row>

      {/* Erosion steps */}
      {rows.map((s) => {
        const tone = STEP_TONE[s.label] || STEP_TONE.Others;
        const barPct = (s.share || 0) * 100;
        const numText = `−${fmt.num(s.orders)}`;
        const inside = barPct >= 18;
        return (
          <Row key={s.label} label={`− ${s.label}`} labelColor={tone.text}>
            <Bar pct={barPct} tone={tone.bar} text={numText} textInside={inside} textColor={tone.text} />
          </Row>
        );
      })}

      {/* Delivered survivor */}
      <Row label="= Delivered" bold labelColor="text-success">
        <Bar
          pct={(delivered.share || 0) * 100}
          tone="bg-success"
          text={`${fmt.num(delivered.orders)} · ${fmt.pct(delivered.share)}`}
          textInside
        />
      </Row>

      <RevenueErosion byLabel={byLabel} delivered={delivered} />
    </div>
  );
}

function Bar({ pct, tone, text, textInside, textColor }) {
  const safePct = Math.max(pct, pct > 0 ? 1 : 0);
  return (
    <div className="flex items-center gap-2 w-full">
      {/* Bar grows left-to-right */}
      <div className="flex-1 h-7 bg-elevated rounded overflow-hidden min-w-0">
        <div
          className={cn("h-7 flex items-center px-2 text-[10px] font-semibold text-white whitespace-nowrap overflow-hidden", tone)}
          style={{ width: `${safePct}%`, minWidth: safePct > 0 ? "6px" : 0 }}
        >
          {textInside && text}
        </div>
      </div>
      {/* Number as flex sibling — always visible */}
      {!textInside && (
        <span className={cn("flex-shrink-0 text-[10px] font-semibold whitespace-nowrap", textColor || "text-muted")}>
          {text}
        </span>
      )}
    </div>
  );
}

function RevenueErosion({ byLabel, delivered }) {
  const cancelledRev = byLabel?.Cancelled?.revenue || 0;
  const rtoRev       = byLabel?.RTO?.revenue       || 0;
  const deliveredRev = delivered?.revenue          || 0;
  const totalGmv     = cancelledRev + rtoRev + deliveredRev;
  if (totalGmv <= 0) return null;

  const cancelledPct = (cancelledRev / totalGmv) * 100;
  const rtoPct       = (rtoRev       / totalGmv) * 100;

  return (
    <>
      <hr className="border-t border-border my-2" />
      <Row label="− Cancelled rev" labelColor="text-warning">
        <Bar pct={cancelledPct} tone="bg-warning" text={`−${fmt.inr(cancelledRev)}`}
          textInside={cancelledPct >= 10} textColor="text-warning" />
      </Row>
      <Row label="− RTO rev loss" labelColor="text-danger">
        <Bar pct={rtoPct} tone="bg-danger" text={`−${fmt.inr(rtoRev)} · ${rtoPct.toFixed(1)}% GMV`}
          textInside={false} textColor="text-danger" />
      </Row>
    </>
  );
}

function Row({ label, labelColor, children, bold }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "w-20 sm:w-28 text-right text-[10px] sm:text-[11px] flex-shrink-0",
        bold ? "font-semibold text-text" : "text-muted",
        labelColor,
      )}>
        {label}
      </div>
      <div className="flex-1 min-w-0">
        {children}
      </div>
    </div>
  );
}
