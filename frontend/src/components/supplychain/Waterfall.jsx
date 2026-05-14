import { fmt, cn } from "@/lib/utils";

const STEP_TONE = {
  Cancelled:    { bar: "bg-sc-amber-mid", text: "text-sc-amber" },
  RTO:          { bar: "bg-sc-red",       text: "text-sc-red" },
  Others:       { bar: "bg-sc-gray-400",  text: "text-sc-gray-600" },
  "In-transit": { bar: "bg-sc-blue-mid",  text: "text-sc-blue" },
  Delivered:    { bar: "bg-sc-green",     text: "text-sc-green" },
};

/**
 * data: {
 *   total_orders: number,
 *   steps: [{ label, orders, share, revenue }]
 * }
 *
 * Stack is interpreted as: each step erodes the running survivor share
 * (Cancelled → RTO → Others → In-transit → Delivered).
 */
export function Waterfall({ data }) {
  if (!data?.total_orders) {
    return <div className="text-sm text-muted py-8 text-center">No data</div>;
  }
  const total = data.total_orders;
  // Build cumulative deductions before Delivered, in order.
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
      <Row
        label="Total orders"
        annotation="100% of orders"
        bold
      >
        <div className="h-7 rounded bg-sc-blue-mid flex items-center px-2 text-[11px] font-semibold text-sc-gray-900 w-full">
          {fmt.num(total)} · 100%
        </div>
      </Row>

      {/* Erosion steps */}
      {rows.map((s) => {
        const tone = STEP_TONE[s.label] || STEP_TONE.Others;
        const barPct = (s.share || 0) * 100;
        const labelInside = barPct >= 6;
        return (
          <Row
            key={s.label}
            label={`− ${s.label}`}
            labelColor={tone.text}
            annotation={`−${fmt.pct(s.share)}`}
            annotationColor={tone.text}
          >
            <div className="relative h-7 w-full bg-sc-gray-100 rounded overflow-visible flex items-center justify-end">
              {!labelInside && (
                <span className={cn("mr-1.5 text-[10px] font-semibold whitespace-nowrap", tone.text)}>
                  −{fmt.num(s.orders)}
                </span>
              )}
              <div
                className={cn(
                  "h-7 rounded flex items-center justify-end px-2 text-[10px] font-semibold text-white",
                  tone.bar
                )}
                style={{ width: `${barPct}%`, minWidth: barPct > 0 ? "8px" : 0 }}
              >
                {labelInside && `−${fmt.num(s.orders)}`}
              </div>
            </div>
          </Row>
        );
      })}

      {/* Delivered survivor */}
      <Row
        label="= Delivered"
        annotation={`${fmt.pct(delivered.share)} surviving`}
        annotationColor={STEP_TONE.Delivered.text}
        bold
      >
        <div
          className="h-7 rounded bg-sc-green flex items-center px-2 text-[11px] font-semibold text-white"
          style={{ width: `${(delivered.share || 0) * 100}%`, minWidth: "32px" }}
        >
          {fmt.num(delivered.orders)} · {fmt.pct(delivered.share)}
        </div>
      </Row>

      {/* Revenue erosion */}
      <RevenueErosion byLabel={byLabel} delivered={delivered} />
    </div>
  );
}

function RevenueErosion({ byLabel, delivered }) {
  const cancelledRev = byLabel?.Cancelled?.revenue || 0;
  const rtoRev = byLabel?.RTO?.revenue || 0;
  const deliveredRev = delivered?.revenue || 0;
  const totalGmv = cancelledRev + rtoRev + deliveredRev;
  if (totalGmv <= 0) return null;

  const cancelledPct = (cancelledRev / totalGmv) * 100;
  const rtoPct = (rtoRev / totalGmv) * 100;

  return (
    <>
      <hr className="border-t border-border my-2" />
      <RevenueRow
        label="− Cancelled rev"
        tone="warning"
        pct={cancelledPct}
        text={`−${fmt.inr(cancelledRev)}`}
        annotation="estimated GMV loss"
      />
      <RevenueRow
        label="− RTO rev loss"
        tone="danger"
        pct={rtoPct}
        text={`−${fmt.inr(rtoRev)} · ${rtoPct.toFixed(1)}% of GMV`}
        annotation={`−${rtoPct.toFixed(1)}% of GMV`}
      />
    </>
  );
}

function RevenueRow({ label, tone, pct, text, annotation }) {
  const labelInside = pct >= 18;
  const barCls = tone === "danger" ? "bg-sc-red" : "bg-sc-amber-mid";
  const textCls = tone === "danger" ? "text-sc-red" : "text-sc-amber";
  return (
    <Row label={label} labelColor={textCls} annotation={annotation} annotationColor={textCls}>
      <div className="relative h-7 w-full bg-sc-gray-100 rounded overflow-visible flex items-center justify-end">
        {!labelInside && (
          <span className={cn("mr-1.5 text-[10px] font-semibold whitespace-nowrap", textCls)}>
            {text}
          </span>
        )}
        <div
          className={cn("h-7 rounded flex items-center justify-end px-2 text-[10px] font-semibold text-white whitespace-nowrap", barCls)}
          style={{ width: `${Math.max(pct, 0.5)}%`, minWidth: pct > 0 ? "8px" : 0 }}
        >
          {labelInside && text}
        </div>
      </div>
    </Row>
  );
}

function Row({ label, labelColor, children, annotation, annotationColor, bold }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "w-32 text-right text-[11px] flex-shrink-0",
          bold && "font-semibold",
          labelColor
        )}
      >
        {label}
      </div>
      <div className="flex-1">{children}</div>
      <div
        className={cn(
          "w-40 text-right text-[10px] font-medium flex-shrink-0",
          annotationColor || "text-muted"
        )}
      >
        {annotation}
      </div>
    </div>
  );
}
