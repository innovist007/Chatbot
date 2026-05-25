import { usePromoBasket } from "@/hooks/usePromoBasket";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { KpiCard } from "@/components/KpiCard";
import { DataTable } from "@/components/DataTable";
import { AISummary } from "@/components/AISummary";
import { fmt } from "@/lib/utils";

function generateKpiInsight(metricName, delta) {
  if (!delta || Math.abs(delta) < 0.001) {
    return `${metricName} stable with minimal change.`;
  }
  
  const mag = Math.abs(delta * 100).toFixed(1);
  const insights = {
    "AOV": delta > 0 ? `AOV up ₹${Math.abs(delta).toFixed(0)} — basket growing.` : `AOV down ₹${Math.abs(delta).toFixed(0)} — check promo strategy.`,
    "Items / order": delta > 0 ? `Items up ${mag}% — bundle/cross-sell working.` : `Items down ${mag}% — review product recommendations.`,
    "Coupon usage": delta > 0 ? `Coupon usage up ${mag}pp — promotions resonating.` : `Coupon usage down ${mag}pp — visibility issue.`,
    "Discount depth": delta > 0 ? `Discount depth up ${mag}pp — margin pressure.` : `Discount depth down ${mag}pp — pricing power improving.`,
    "Cart abandonment": delta > 0 ? `Abandonment up ${mag}pp — fix checkout friction.` : `Abandonment down ${mag}pp — retention improving.`,
    "Bundle attach": delta > 0 ? `Bundle attach up ${mag}pp — bundling effective.` : `Bundle attach down ${mag}pp — promote bundles more.`,
  };
  return insights[metricName] || `${metricName} changed ${mag}%.`;
}

export default function PromoBasketPage({ onAskChat, startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const {
    data, loading, error,
    aiSummary,
    offerType, setOfferType,
  } = usePromoBasket({ startDate, endDate, compareStart, compareEnd });
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
        <span className="text-sm text-muted">Filters</span>
        <Segmented
          value={offerType}
          onChange={setOfferType}
          options={["All offers", "Coupon", "Bundle", "BOGO"]}
        />
      </div>

      {/* AI Summary */}
      <AISummary summary={aiSummary} />

      {/* Headline KPIs */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
          HEADLINE
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && !data ? Array(4).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
            <>
              <KpiCard
                label="AOV"
                value={fmt.inr(current.aov)}
                delta={delta(deltas.aov)}
                format="curr"

                insight={generateKpiInsight("AOV", deltas.aov)}
                onAsk={() => onAskChat?.("Why did AOV change?")}
              />
              <KpiCard
                label="Items / order"
                value={current.items_per_order?.toFixed(1)}
                delta={delta(deltas.items_per_order)}
                format="num"

                insight={generateKpiInsight("Items / order", deltas.items_per_order)}
                onAsk={() => onAskChat?.("How to increase items per order?")}
              />
              <KpiCard
                label="Coupon usage"
                value={fmt.pct(current.coupon_usage)}
                delta={delta(deltas.coupon_usage)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("Coupon usage", deltas.coupon_usage)}
                onAsk={() => onAskChat?.("Which coupons drive most orders?")}
              />
              <KpiCard
                label="Discount depth"
                value={fmt.pct(current.discount_depth)}
                delta={delta(deltas.discount_depth)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("Discount depth", deltas.discount_depth)}
                onAsk={() => onAskChat?.("How to reduce discount depth?")}
              />
            </>
          )}
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading && !data ? Array(4).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
          <>
            <KpiCard
              label="Cart abandonment"
              value={fmt.pct(current.cart_abandonment)}
              delta={delta(deltas.cart_abandonment)}
              format="pct"
              deltaFormat="pp"

              insight={generateKpiInsight("Cart abandonment", deltas.cart_abandonment)}
              onAsk={() => onAskChat?.("Why are carts being abandoned?")}
            />
            <KpiCard
              label="Recovered carts"
              value={fmt.num(current.recovered_carts)}
              delta={delta(deltas.recovered_carts)}
              format="num"

              insight={`${fmt.pct(current.recovery_via_push)} via push notifications`}
              onAsk={() => onAskChat?.("How to recover more carts?")}
            />
            <KpiCard
              label="Bundle attach"
              value={fmt.pct(current.bundle_attach)}
              delta={delta(deltas.bundle_attach)}
              format="pct"
              deltaFormat="pp"

              insight={generateKpiInsight("Bundle attach", deltas.bundle_attach)}
              onAsk={() => onAskChat?.("How to increase bundle attach?")}
            />
            <KpiCard
              label="BOGO orders"
              value={fmt.num(current.bogo_orders)}
              delta={delta(deltas.bogo_orders)}
              format="num"
              insight={`${deltas.bogo_orders > 0 ? '+' : ''}${((deltas.bogo_orders || 0) * 100).toFixed(0)}% vs prior period`}
              onAsk={() => onAskChat?.("Are BOGO offers profitable?")}
            />
          </>
        )}
      </div>

      {/* Coupon Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Coupon performance · top codes</CardTitle>
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : (
            <>
              {data?.coupon_performance && data.coupon_performance.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "code", label: "Code" },
                    { key: "redemptions", label: "Redemptions", render: (row) => fmt.num(row.redemptions) },
                    { key: "discount", label: "Discount" , render: (row) => fmt.pct(row.discount)},
                    { key: "orders", label: "Orders", render: (row) => fmt.num(row.orders) },
                    { key: "aov", label: "AOV", render: (row) => fmt.inr(row.aov) },
                    { 
                      key: "cm_impact", 
                      label: "CM impact", 
                      render: (row) => (
                        <span className={row.cm_impact >= 0 ? "text-green-600" : "text-red-600"}>
                          {row.cm_impact >= 0 ? "+" : ""}{fmt.inr(row.cm_impact)}
                        </span>
                      )
                    },
                  ]}
                  rows={data.coupon_performance}
                />
              ) : (
                <div className="text-sm text-muted py-4">No coupon data available.</div>
              )}
              
              {/* Dynamic Insight */}
              {(() => {
                const coupons = data?.coupon_performance || [];
                if (coupons.length === 0) return null;
                
                const negativeCoupon = coupons.find(c => c.cm_impact < 0 && c.code?.includes("WIN-BACK"));
                const topCoupon = coupons.reduce((max, c) => c.redemptions > max.redemptions ? c : max, coupons[0]);
                
                return (
                 <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
                  Most orders are driven by{" "}
                  <strong>{topCoupon?.code}</strong>{" "}
                  with <strong>{fmt.num(topCoupon?.orders)}</strong> orders,
                  producing an AOV of{" "}
                  <strong>{fmt.inr(topCoupon?.aov)}</strong>.
                </div>
                );
              })()}
            </>
          )}
        </CardBody>
      </Card>

      {/* Top Cross-sell Pairs */}
      <Card>
        <CardHeader>
          <CardTitle>Top cross-sell pairs · co-purchase rate</CardTitle>
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : (
            <>
              {data?.cross_sell_pairs && data.cross_sell_pairs.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "pair", label: "Pair" },
                    { key: "co_purchase_pct", label: "Co-purchase %", render: (row) => fmt.pct(row.co_purchase_pct) },
                    { key: "pair_aov", label: "Pair AOV", render: (row) => fmt.inr(row.pair_aov) },
                    { 
                      key: "bundle_live", 
                      label: "Bundle live?",
                      render: (row) => (
                        row.bundle_live ? (
                          <span className="text-green-600 font-medium">Yes {row.bundle_code ? `(${row.bundle_code})` : ''}</span>
                        ) : (
                          <span className="text-amber-600 font-medium">No — opportunity</span>
                        )
                      )
                    },
                  ]}
                  rows={data.cross_sell_pairs}
                />
              ) : (
                <div className="text-sm text-muted py-4">No cross-sell data available.</div>
              )}
              
              {/* Dynamic Insight */}
              {(() => {
                const pairs = data?.cross_sell_pairs || [];
                const opportunities = pairs.filter(p => !p.bundle_live);
                if (opportunities.length === 0) return null;
                
                const topOpportunity = opportunities.reduce((max, p) => 
                  p.co_purchase_pct > max.co_purchase_pct ? p : max
                , opportunities[0]);
                
                return (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
                    <strong>{opportunities.length}</strong> untapped bundle opportunities. 
                    <strong> {topOpportunity.pair}</strong> has highest co-purchase ({fmt.pct(topOpportunity.co_purchase_pct)}) without bundle — fastest unlock.
                  </div>
                );
              })()}
            </>
          )}
        </CardBody>
      </Card>

      {/* Basket Size & Discount Depth - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Basket Size Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Basket size distribution</CardTitle>
          </CardHeader>
          <CardBody>
            {loading && !data ? <div className="skeleton h-48" /> : (
              <>
                {data?.basket_distribution && data.basket_distribution.length > 0 ? (
                  <DataTable
                    columns={[
                      { key: "items", label: "Items" },
                      { key: "orders", label: "Orders", render: (row) => fmt.num(row.orders) },
                      { key: "share", label: "Share", render: (row) => fmt.pct(row.share) },
                      { key: "aov", label: "AOV", render: (row) => fmt.inr(row.aov) },
                    ]}
                    rows={data.basket_distribution}
                  />
                ) : (
                  <div className="text-sm text-muted py-4">No basket data available.</div>
                )}
              </>
            )}
          </CardBody>
        </Card>

        {/* Discount Depth Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Discount depth distribution</CardTitle>
          </CardHeader>
          <CardBody>
            {loading && !data ? <div className="skeleton h-48" /> : (
              <>
                {data?.discount_distribution && data.discount_distribution.length > 0 ? (
                  <>
                    <DataTable
                      columns={[
                        { key: "depth", label: "Depth" },
                        { key: "orders", label: "Orders", render: (row) => fmt.num(row.orders) },
                        { key: "share", label: "Share", render: (row) => fmt.pct(row.share) },
                        { 
                          key: "rto_pct", 
                          label: "RTO%",
                          render: (row) => (
                            <span className={
                              row.rto_pct > 0.15 ? "text-red-600 font-medium" : 
                              row.rto_pct > 0.10 ? "text-amber-600" : 
                              "text-green-600"
                            }>
                              {fmt.pct(row.rto_pct)}
                            </span>
                          )
                        },
                      ]}
                      rows={data.discount_distribution}
                    />
                    
                    {/* Dynamic Insight */}
                    {(() => {
                      const dists = data.discount_distribution;
                      if (!dists || dists.length === 0) return null;
                      
                      const fullPrice = dists.find(d => d.depth?.includes("0%") && !d.depth?.includes("10%"));
                      const highDiscount = dists[dists.length - 1];
                      
                      if (!fullPrice || !highDiscount) return null;
                      
                      const ratio = highDiscount.rto_pct / (fullPrice.rto_pct || 0.01);
                      const topDiscountBucket =
                      dists.reduce((max, d) =>
                        d.share_pct > max.share_pct ? d : max
                      , dists[0]);
                      
                      return (
                    <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg text-sm">
                    Majority of orders fall in the{" "}
                    <strong>{topDiscountBucket.depth}</strong>{" "}
                    discount bucket, accounting for{" "}
                    <strong>{fmt.pct(topDiscountBucket.share)}</strong>{" "}
                    of all promo orders.
                  </div>
                      );
                    })()}
                  </>
                ) : (
                  <div className="text-sm text-muted py-4">No discount data available.</div>
                )}
              </>
            )}
          </CardBody>
        </Card>
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