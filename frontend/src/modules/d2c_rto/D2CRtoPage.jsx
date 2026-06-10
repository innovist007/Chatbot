import { useD2CRto } from "@/modules/d2c_rto/useD2CRto";
import { Card, CardHeader, CardBody, CardTitle } from "@/shared/ui/Card";
import { Segmented } from "@/shared/ui/Segmented";
import { KpiCard } from "@/shared/components/KpiCard";
import { DataTable } from "@/shared/components/DataTable";
import { AISummary } from "@/shared/components/AISummary";
import { fmt } from "@/lib/utils";

function generateKpiInsight(metricName, delta) {
  if (!delta || Math.abs(delta) < 0.001) {
    return `${metricName} stable with minimal change.`;
  }
  
  const mag = Math.abs(delta * 100).toFixed(1);
  const insights = {
    "RTO%": delta > 0 ? `RTO worsened ${mag}pp — review COD policies and risky pincodes.` : `RTO improving ${mag}pp — interventions working.`,
    "RTO orders": delta > 0 ? `${mag}% more RTO orders — concerning trend.` : `${mag}% fewer RTO orders — good progress.`,
    "RTO loss": delta > 0 ? `Loss up ${mag}% — urgent action needed.` : `Loss down ${mag}% — efficiency improving.`,
    "Loss per RTO": delta > 0 ? `Cost per RTO up ₹${Math.abs(delta)} — shipping costs rising.` : `Cost per RTO down — operational efficiency improving.`,
    "Delivered orders": delta > 0 ? `Deliveries up ${mag}% — fulfillment scaling.` : `Deliveries down ${mag}% — investigate logistics.`,
  };
  return insights[metricName] || `${metricName} changed ${mag}%.`;
}

export default function D2CRtoPage({ onAskChat, startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const {
    data, loading, error,
    aiSummary, aiPending,
    payment,  setPayment,
    customer, setCustomer,
  } = useD2CRto({ startDate, endDate, compareStart, compareEnd });
  const delta = hasComparison ? (v) => v : () => null;

//   if (error) {
//     return (
//       <div className="p-12 text-center text-destructive">
//         Error: {error}
//       </div>
//     );
//   }

  const overview = data?.overview || {};
  const current = overview.current || {};
  const deltas = overview.deltas || {};

  return (
    <div className="space-y-6 p-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Payment</span>
          <Segmented
            value={payment}
            onChange={setPayment}
            options={["All", "COD", "Prepaid"]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Customer</span>
          <Segmented
            value={customer}
            onChange={setCustomer}
            options={["All", "First-time", "Repeat"]}
          />
        </div>
      </div>

      {/* AI Summary */}
      <AISummary summary={aiSummary} loading={loading} pending={aiPending} />

      {/* Headline KPIs */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
          HEADLINE
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? Array(4).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
            <>
              <KpiCard
                label="RTO%"
                value={fmt.pct(current.rto_pct)}
                delta={delta(deltas.rto_pct)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("RTO%", deltas.rto_pct)}
                onAsk={() => onAskChat?.("Why is RTO% changing?")}
              />
              <KpiCard
                label="RTO orders"
                value={fmt.num(current.rto_orders)}
                delta={delta(deltas.rto_orders)}
                format="num"

                insight={generateKpiInsight("RTO orders", deltas.rto_orders)}
                onAsk={() => onAskChat?.("Which pincodes drive RTO?")}
              />
              <KpiCard
                label="RTO loss"
                value={fmt.inr(current.rto_loss)}
                delta={delta(deltas.rto_loss)}
                format="curr"

                insight="Forward + reverse shipping costs"
                onAsk={() => onAskChat?.("How can we reduce RTO loss?")}
              />
              <KpiCard
                label="Loss per RTO"
                value={fmt.inr(current.loss_per_rto)}
                delta={delta(deltas.loss_per_rto)}
                format="curr"

                insight={generateKpiInsight("Loss per RTO", deltas.loss_per_rto)}
                onAsk={() => onAskChat?.("Why is loss per RTO changing?")}
              />
            </>
          )}
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? Array(4).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
          <>
            <KpiCard
              label="Delivered orders"
              value={fmt.num(current.delivered_orders)}
              delta={delta(deltas.delivered_orders)}
              format="num"

              insight={`${fmt.pct(current.delivery_rate)} delivery rate`}
              onAsk={() => onAskChat?.("How can we improve delivery rate?")}
            />
            <KpiCard
              label="Cancelled"
              value={fmt.num(current.cancelled)}
              delta={delta(deltas.cancelled)}
              format="num"

              insight={`${fmt.pct(current.cancellation_rate)} pre-shipment`}
              onAsk={() => onAskChat?.("Why are orders being cancelled?")}
            />
            <KpiCard
              label="RTO TAT"
              value={`${current.rto_tat_days || 0} days`}
              delta={delta(deltas.rto_tat_days)}
              format="num"

              insight="Locks inventory"
              onAsk={() => onAskChat?.("How to reduce RTO TAT?")}
            />
            <KpiCard
              label="Inventory locked"
              value={fmt.inr(current.inventory_locked)}
              delta={delta(deltas.inventory_locked)}
              format="curr"

              insight="In-flight RTO stock"
              onAsk={() => onAskChat?.("How to free up locked inventory?")}
            />
          </>
        )}
      </div>

      {/* Payment Mode Split */}
      <Card>
        <CardHeader>
          <CardTitle>Payment mode split · the headline metric</CardTitle>
        </CardHeader>
        <CardBody>
          {loading  ? <div className="skeleton h-48" /> : (
            <>
              {data?.payment_split && data.payment_split.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "payment", label: "Payment" },
                    { key: "orders", label: "Orders", render: (row) => fmt.num(row.orders) },
                    { key: "rto_pct", label: "RTO%", render: (row) => fmt.pct(row.rto_pct) },
                    { key: "avg_loss_per_rto", label: "Avg loss/RTO", render: (row) => fmt.inr(row.avg_loss_per_rto) },
                    { key: "total_loss", label: "Total loss", render: (row) => fmt.inr(row.total_loss) },
                  ]}
                  rows={data.payment_split}
                />
              ) : (
                <div className="text-sm text-muted py-4">No payment split data available.</div>
              )}
              
              {/* Payment Mode Insights */}
              {data?.payment_insights && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="font-medium text-xs text-muted uppercase mb-1">COD share today</div>
                    <div className="text-2xl font-semibold">{fmt.pct(data.payment_insights.cod_share)}</div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="font-medium text-xs text-muted uppercase mb-1">If COD drops to 45%</div>
                    <div className="text-2xl font-semibold text-green-700 dark:text-green-400">
                      RTO% → {fmt.pct(data.payment_insights.projected_rto_pct)}
                    </div>
                  </div>
                  <div className="p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                    <div className="font-medium text-xs text-muted uppercase mb-1">Saved annually</div>
                    <div className="text-2xl font-semibold text-green-700 dark:text-green-400">
                      {fmt.inr(data.payment_insights.annual_savings)}
                    </div>
                  </div>
                </div>
              )}
              
            {(() => {
  const cod = data?.payment_split?.find(p => p.payment?.toUpperCase() === "COD");
  const prepaid = data?.payment_split?.find(p => p.payment?.toUpperCase() === "PREPAID");
  
  if (!cod || !prepaid) return null;
  
  const ratio = cod.rto_pct / (prepaid.rto_pct || 0.001);
  const totalOrders = cod.orders + prepaid.orders;
  const ordersPerOnePP = totalOrders / 100;
  
  return (
    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
      COD RTO ({fmt.pct(cod.rto_pct)}) is <strong>{ratio.toFixed(1)}x worse</strong> than Prepaid ({fmt.pct(prepaid.rto_pct)}). 
      Every 1pp shifted from COD to Prepaid affects ~{fmt.num(Math.round(ordersPerOnePP))} orders.
    </div>
  );
})()}
            </>
          )}
        </CardBody>
      </Card>

      {/* RTO by Pincode Tier */}
      <Card>
        <CardHeader>
          <CardTitle>RTO by pincode tier · where the loss concentrates</CardTitle>
        </CardHeader>
        <CardBody>
          {loading  ? <div className="skeleton h-64" /> : (
            <>
              {data?.by_tier && data.by_tier.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "tier", label: "Tier" },
                    { key: "orders", label: "Orders", render: (row) => fmt.num(row.orders) },
                    { key: "mix_pct", label: "% mix", render: (row) => fmt.pct(row.mix_pct) },
                    { key: "rto_pct", label: "RTO%", render: (row) => fmt.pct(row.rto_pct) },
                    { key: "loss", label: "Loss", render: (row) => row.loss != null ? fmt.inr(row.loss) : "N/A" },
                    { key: "avg_aov", label: "Avg AOV", render: (row) => row.avg_aov ? fmt.inr(row.avg_aov) : "—" },
                  ]}
                  rows={data.by_tier}
                />
              ) : (
                <div className="text-sm text-muted py-4">No tier data available.</div>
              )}
             {(() => {
  const tiers = data?.by_tier || [];
  if (tiers.length === 0) return null;
  
  // Find best and worst tier
  const sorted = [...tiers].sort((a, b) => b.rto_pct - a.rto_pct);
  const worst = sorted[0];
  const best = sorted[sorted.length - 1];
  
  if (!worst || !best || worst.tier === best.tier) return null;
  
  const ratio = worst.rto_pct / (best.rto_pct || 0.001);
  
  return (
    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
      <strong>{worst.tier}</strong> has the highest RTO ({fmt.pct(worst.rto_pct)}) — 
      <strong> {ratio.toFixed(1)}x</strong> worse than <strong>{best.tier}</strong> ({fmt.pct(best.rto_pct)}). 
      {fmt.num(worst.orders)} orders represent {fmt.pct(worst.mix_pct)} of total volume.
    </div>
  );
})()}
            </>
          )}
        </CardBody>
      </Card>

      {/* Top RTO Pincodes */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 RTO pincodes · where to act first</CardTitle>
        </CardHeader>
        <CardBody>
          {loading  ? <div className="skeleton h-64" /> : (
            <>
              {data?.top_pincodes && data.top_pincodes.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "pincode", label: "Pincode" },
                    { key: "location", label: "Location" },
                    { key: "orders", label: "Orders", render: (row) => fmt.num(row.orders) },
                    { key: "rto_pct", label: "RTO%", render: (row) => fmt.pct(row.rto_pct) },
                    { key: "loss", label: "Loss", render: (row) => fmt.inr(row.loss) },
                    { key: "avg_aov", label: "Avg AOV", render: (row) => fmt.inr(row.avg_aov) },
                  ]}
                  rows={data.top_pincodes}
                />
              ) : (
                <div className="text-sm text-muted py-4">No pincode data available.</div>
              )}
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
                {(() => {
  const pins = data?.top_pincodes || [];
  if (pins.length === 0) return null;
  
  const top4 = pins.slice(0, 4);
  const totalRtoOrders = top4.reduce((sum, p) => sum + (p.orders * p.rto_pct), 0);
  const totalLoss = top4.reduce((sum, p) => sum + (p.loss || 0), 0);
  const avgRtoPct = top4.reduce((sum, p) => sum + p.rto_pct, 0) / top4.length;
  
  return (
    <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
      Top 4 pincodes have <strong>{fmt.pct(avgRtoPct)}</strong> avg RTO — driving 
      <strong> ~{fmt.num(Math.round(totalRtoOrders))}</strong> RTO orders 
      worth <strong>{fmt.inr(totalLoss)}</strong>. Blocking COD on these pincodes is high-impact.
    </div>
  );
})()}
              </div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Recommended Actions */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
          RECOMMENDED ACTIONS · BIGGEST IMPACT FIRST
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {loading  ? Array(3).fill(0).map((_, i) => <ActionSkeleton key={i} />) : (
            <>
              {(data?.recommendations || []).map((action, i) => (
                <Card key={i} className="border-2 border-green-200 dark:border-green-900">
                  <CardBody>
                    <div className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide mb-1">
                      {action.savings || "Impact TBD"}
                    </div>
                    <div className="font-semibold mb-2">{action.title}</div>
                    <div className="text-sm text-muted">{action.description}</div>
                  </CardBody>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiSkeleton() {
  return (
    <Card className="px-4 py-3">
      <div className="skeleton h-3 w-20 mb-2 rounded"></div>
      <div className="skeleton h-7 w-32 mb-2 rounded"></div>
      <div className="skeleton h-3 w-16 rounded"></div>
    </Card>
  );
}

function ActionSkeleton() {
  return (
    <Card>
      <CardBody>
        <div className="skeleton h-3 w-24 mb-2 rounded"></div>
        <div className="skeleton h-5 w-48 mb-2 rounded"></div>
        <div className="skeleton h-3 w-full rounded"></div>
      </CardBody>
    </Card>
  );
}