import { useRetention } from "@/hooks/useRetention";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { KpiCard } from "@/components/KpiCard";
import { DataTable } from "@/components/DataTable";
import { AISummary } from "@/components/AISummary";
import { fmt, cn } from "@/lib/utils";

const RETENTION_WINDOWS = ["7d", "15d", "30d", "60d", "90d", "180d"];

function generateKpiInsight(metricName, delta) {
  if (!delta || Math.abs(delta) < 0.001) {
    return `${metricName} stable with minimal change.`;
  }
  
  const mag = Math.abs(delta * 100).toFixed(1);
  const insights = {
    "Repeat rate": delta > 0 ? `Repeat rate up ${mag}pp — retention improving.` : `Repeat rate down ${mag}pp — investigate churn drivers.`,
    "Same-product": delta > 0 ? `Same-product up ${mag}pp — replenishment behavior strong.` : `Same-product down ${mag}pp — consider replenishment campaigns.`,
    "Cross-product": delta > 0 ? `Cross-sell up ${mag}pp — bundling working.` : `Cross-sell down ${mag}pp — review recommendations.`,
    "Repeat revenue": delta > 0 ? `Repeat revenue up ${mag}% — loyalty growing.` : `Repeat revenue down ${mag}% — review retention strategy.`,
    "Repeat share": delta > 0 ? `Repeat share up ${mag}pp — customer base maturing.` : `Repeat share down ${mag}pp — over-reliant on new acquisitions.`,
    "90d LTV": delta > 0 ? `LTV up ${mag}% — customers buying more over time.` : `LTV down ${mag}% — customer value declining.`,
  };
  return insights[metricName] || `${metricName} changed ${mag}%.`;
}

// Action badge component for retention leaderboard
function ActionBadge({ retention }) {
  if (retention >= 0.05) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
        Scale
      </span>
    );
  } else if (retention >= 0.025) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
        Watch
      </span>
    );
  } else {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
        Investigate
      </span>
    );
  }
}

// Days-to-2nd-order chart
function DaysToOrderChart({ data }) {
  if (!data || data.length === 0) {
    return <div className="text-sm text-muted py-4">No data available.</div>;
  }

  const maxValue = Math.max(...data.map(d => d.percentage || 0));
  
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-1 h-48">
        {data.map((bucket, i) => {
          const barHeight = (bucket.percentage / maxValue) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full bg-blue-100 rounded-t relative group" style={{ height: `${barHeight}%` }}>
                <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-text text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
                  {fmt.pct(bucket.percentage)}
                </div>
                <div 
                  className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t transition-all"
                  style={{ height: '100%' }}
                />
              </div>
              <div className="text-[10px] text-muted text-center whitespace-nowrap">
                {bucket.range}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* X-axis label */}
      <div className="text-center text-xs text-muted">
        Days from first order
      </div>
    </div>
  );
}

export default function RetentionPage({ onAskChat, startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const {
    data, loading, error,
    aiSummary,
    brand,           setBrand,
    retentionWindow, setRetentionWindow,
  } = useRetention({ startDate, endDate, compareStart, compareEnd });
  const delta = hasComparison ? (v) => v : () => null;

  // if (error) {
  //   return (
  //     <div className="p-12 text-center text-destructive">
  //       Error: {error}
  //     </div>
  //   );
  // }

  const overview = data?.overview || {};
  const current = overview.current || {};
  const deltas = overview.deltas || {};
  const revenue = data?.revenue || {};

  return (
    <div className="space-y-6 p-6">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
      
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Brand</span>
          <Segmented
            value={brand}
            onChange={setBrand}
            options={["All"]}  // Add brand options when available
          />
        </div>
      </div>

      {/* AI Summary */}
      <AISummary summary={aiSummary} />

      {/* Retention Window Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
            RETENTION WINDOW
          </h3>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted mr-2">days from first order</span>
            {RETENTION_WINDOWS.map(window => (
              <button
                key={window}
                onClick={() => setRetentionWindow(window)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded transition-colors",
                  retentionWindow === window
                    ? "bg-accent text-white"
                    : "text-muted hover:text-text hover:bg-elevated"
                )}
              >
                {window}
              </button>
            ))}
          </div>
        </div>
        
        {/* Retention KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && !data ? Array(4).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
            <>
              <KpiCard
                label="Repeat rate"
                value={fmt.pct(current.repeat_rate)}
                delta={delta(deltas.repeat_rate)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("Repeat rate", deltas.repeat_rate)}
                onAsk={() => onAskChat?.(`Why did repeat rate change in ${retentionWindow}?`)}
              />
              <KpiCard
                label="Same-product"
                value={fmt.pct(current.same_product_rate)}
                delta={delta(deltas.same_product_rate)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("Same-product", deltas.same_product_rate)}
                onAsk={() => onAskChat?.("Which products have highest repeat rate?")}
              />
              <KpiCard
                label="Cross-product"
                value={fmt.pct(current.cross_product_rate)}
                delta={delta(deltas.cross_product_rate)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("Cross-product", deltas.cross_product_rate)}
                onAsk={() => onAskChat?.("Top cross-sell opportunities?")}
              />
              <KpiCard
                label="Orders / repeater"
                value={current.orders_per_repeater?.toFixed(1)}
                delta={delta(deltas.orders_per_repeater)}
                format="num"

                insight={`Avg ${current.orders_per_repeater?.toFixed(1)} orders per returning customer`}
                onAsk={() => onAskChat?.("How to increase orders per repeater?")}
              />
            </>
          )}
        </div>
      </div>

      {/* Revenue from Repeat Business */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
          REVENUE FROM REPEAT BUSINESS
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading && !data ? Array(4).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
            <>
              <KpiCard
                label="Repeat revenue"
                value={fmt.inr(revenue.repeat_revenue)}
                delta={delta(revenue.repeat_revenue_delta)}
                format="curr"

                insight={generateKpiInsight("Repeat revenue", revenue.repeat_revenue_delta)}
                onAsk={() => onAskChat?.("Why is repeat revenue changing?")}
              />
              <KpiCard
                label="Repeat share"
                value={fmt.pct(revenue.repeat_share)}
                delta={delta(revenue.repeat_share_delta)}
                format="pct"
                deltaFormat="pp"

                insight={generateKpiInsight("Repeat share", revenue.repeat_share_delta)}
                onAsk={() => onAskChat?.("How to increase repeat share?")}
              />
              <KpiCard
                label="90d LTV"
                value={fmt.inr(revenue.ltv_90d)}
                delta={revenue.ltv_90d_delta}
                format="curr"

                insight={generateKpiInsight("90d LTV", revenue.ltv_90d_delta)}
                onAsk={() => onAskChat?.("How to increase customer LTV?")}
              />
              <KpiCard
                label="Repeat AOV uplift"
                value={`+${fmt.pct(revenue.repeat_aov_uplift)}`}
                format="pct"
                insight={`Repeat customers spend ${fmt.pct(revenue.repeat_aov_uplift)} more than first-time buyers`}
                onAsk={() => onAskChat?.("Why do repeat customers spend more?")}
              />
            </>
          )}
        </div>
      </div>

      {/* Same-Product Retention Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Same-product retention leaderboard · {retentionWindow} window</CardTitle>
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : (
            <>
              {data?.product_retention && data.product_retention.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "product", label: "Product" },
                    { key: "acquired", label: "Acquired", render: (row) => fmt.num(row.acquired) },
                    { key: "repeated", label: "Repeated", render: (row) => fmt.num(row.repeated) },
                    { 
                      key: "retention", 
                      label: "Retention",
                      render: (row) => (
                        <span className={cn(
                          "font-medium",
                          row.retention >= 0.05 ? "text-green-600" :
                          row.retention >= 0.025 ? "text-amber-600" :
                          "text-red-600"
                        )}>
                          {fmt.pct(row.retention)}
                        </span>
                      )
                    },
                    { key: "days_to_second", label: "Days to 2nd", render: (row) => row.days_to_second?.toFixed(0) || "-" },
                    { 
                      key: "action", 
                      label: "Action",
                      render: (row) => <ActionBadge retention={row.retention} />
                    },
                  ]}
                  rows={data.product_retention}
                />
              ) : (
                <div className="text-sm text-muted py-4">No product retention data available.</div>
              )}
              
              {/* Dynamic Insight */}
              {(() => {
                const products = data?.product_retention || [];
                if (products.length === 0) return null;
                
                const top = products[0];
                if (!top) return null;
                
                return (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
                    <strong>{top.product}</strong> at <strong>{top.days_to_second?.toFixed(0)}-day</strong> repurchase cycle = 
                    {top.days_to_second < 30 ? " monthly replenishment" : top.days_to_second < 60 ? " bi-monthly cycle" : " quarterly cycle"} pattern. 
                    Email cadence per product should match its days-to-2nd.
                  </div>
                );
              })()}
            </>
          )}
        </CardBody>
      </Card>

      {/* LTV by Acquisition Product */}
      <Card>
        <CardHeader>
          <CardTitle>LTV by acquisition product · 90-day window</CardTitle>
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : (
            <>
              {data?.ltv_by_product && data.ltv_by_product.length > 0 ? (
                <DataTable
                  columns={[
                    { key: "product", label: "First product" },
                    { key: "customers", label: "Customers", render: (row) => fmt.num(row.customers) },
                    { key: "first_aov", label: "First AOV", render: (row) => fmt.inr(row.first_aov) },
                    { key: "ltv_90d", label: "90d LTV", render: (row) => fmt.inr(row.ltv_90d) },
                    { key: "second_order_pct", label: "2nd order %", render: (row) => fmt.pct(row.second_order_pct) },
                    { 
                      key: "ltv_cac_ratio", 
                      label: "LTV/CAC",
                      render: (row) => (
                        row.ltv_cac_ratio ? (
                          <span className={cn(
                            "font-medium",
                            row.ltv_cac_ratio >= 2.0 ? "text-green-600" :
                            row.ltv_cac_ratio >= 1.0 ? "text-amber-600" :
                            "text-red-600"
                          )}>
                            {row.ltv_cac_ratio.toFixed(1)}x
                          </span>
                        ) : "-"
                      )
                    },
                  ]}
                  rows={data.ltv_by_product}
                />
              ) : (
                <div className="text-sm text-muted py-4">No LTV data available.</div>
              )}
              
              {/* Dynamic Insight */}
              {(() => {
                const products = data?.ltv_by_product || [];
                if (products.length === 0) return null;
                
                const top = products[0];
                const bottom = products[products.length - 1];
                
                if (!top || !bottom) return null;
                
                return (
                  <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
                    <strong>{top.product}</strong> acquires customers worth <strong>{fmt.inr(top.ltv_90d)}</strong> over 90 days. 
                    {bottom.ltv_cac_ratio < 1 && (
                      <> <strong>{bottom.product}</strong> acquires customers worth <strong>{fmt.inr(bottom.ltv_90d)}</strong> — and below CAC.</>
                    )}
                  </div>
                );
              })()}
            </>
          )}
        </CardBody>
      </Card>

      {/* Days-to-2nd-Order Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Days-to-2nd-order distribution · CRM cadence design</CardTitle>
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : (
            <>
              <DaysToOrderChart data={data?.days_distribution} />
              
              {/* Cumulative milestones */}
              {data?.cumulative_milestones && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
                  {Object.entries(data.cumulative_milestones).map(([day, pct]) => (
                    <div key={day} className="text-center">
                      <div className="text-xs text-muted uppercase tracking-wide mb-1">Day {day}</div>
                      <div className="text-2xl font-semibold">{fmt.pct(pct)}</div>
                      <div className="text-xs text-muted mt-1">returned</div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
                {(() => {
                  if (!data?.cumulative_milestones) {
                    return "Match email cadence to your customer's repurchase cycle for maximum recovery.";
                  }
                  
                  // Suggest cadence based on milestones
                  const day14 = data.cumulative_milestones["14"] || 0;
                  const day30 = data.cumulative_milestones["30"] || 0;
                  
                  return (
                    <>
                      Send <strong>replenishment email at day {day14 < 0.3 ? '18' : '14'}</strong>, 
                      <strong> second at day {day30 < 0.5 ? '35' : '30'}</strong>, 
                      <strong> win-back at day 60</strong> — match cadence to the curve.
                    </>
                  );
                })()}
              </div>
            </>
          )}
        </CardBody>
      </Card>
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