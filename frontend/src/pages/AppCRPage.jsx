import { useAppCR } from "@/hooks/useAppCR";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { Pill } from "@/components/ui/Pill";
import { KpiCard } from "@/components/KpiCard";
import { Funnel } from "@/components/Funnel";
import { DataTable } from "@/components/DataTable";
import { AISummary } from "@/components/AISummary";
import { fmt } from "@/lib/utils";

function generateKpiInsight(metricName, delta) {
  if (!delta || Math.abs(delta) < 0.001) {
    return `${metricName} stable with minimal change.`;
  }
  
  const mag = Math.abs(delta * 100).toFixed(1);
  const insights = {
    "App opens": delta > 0.15 ? `App opens surged +${mag}% — strong user engagement.` : delta > 0 ? `App opens up ${mag}% — growing user base.` : delta < -0.15 ? `App opens crashed ${mag}% — check app store visibility.` : `App opens down ${mag}% — investigate user acquisition.`,
    "App CR": delta > 0 ? `CR improved ${mag}pp — app optimizations working.` : `CR dropped ${mag}pp — check funnel drop-offs.`,
    "App AOV": delta > 0 ? `AOV up ${mag}% — customers buying premium.` : `AOV down ${mag}% — price sensitivity increasing.`,
    "Revenue per open": delta > 0 ? `Revenue/open up ${mag}% — monetization improving.` : `Revenue/open down ${mag}% — conversion efficiency declining.`,
    "Installs": delta > 0 ? `Installs up ${mag}% — user acquisition growing.` : `Installs down ${mag}% — app store visibility or marketing issue.`,
    "DAU / MAU": delta > 0 ? `DAU/MAU up ${mag}pp — stickiness improving.` : `DAU/MAU down ${mag}pp — users less engaged.`,
    "Avg sessions / user": delta > 0 ? `Sessions/user up ${mag} — engagement increasing.` : `Sessions/user down ${mag} — user engagement declining.`,
  };
  return insights[metricName] || `${metricName} changed ${mag}%.`;
}

export default function AppCRPage({ onAskChat, startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const {
    data, loading, error,
    aiSummary,
    platform, setPlatform,
    user,     setUser,
  } = useAppCR({ startDate, endDate, compareStart, compareEnd });
  const delta = hasComparison ? (v) => v : () => null;

  if (loading) {
    return (
      <div className="p-12 text-center text-muted">
        Loading App CR data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-12 text-center text-destructive">
        Error: {error}
      </div>
    );
  }

  if (!data || !data.overview) {
    return (
      <div className="p-12 text-center text-muted">
        No data available for the selected filters.
      </div>
    );
  }

  const { current, deltas } = data.overview;
  const uninstallRate = current.uninstall_rate || 0;

  return (
    <div className="space-y-6 p-6">
      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">Platform</span>
          <Segmented
            value={platform}
            onChange={setPlatform}
            options={["All", "Android", "iOS"]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted">User</span>
          <Segmented
            value={user}
            onChange={setUser}
            options={["All", "First-time", "Returning"]}
          />
        </div>
      </div>

      {/* AI Summary */}
      <AISummary
        summary={aiSummary}
      />

      {/* Headline KPIs */}
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted uppercase tracking-wide">
          HEADLINE
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="App opens"
            value={fmt.num(current.app_opens)}
            delta={delta(deltas.app_opens)}
            format="num"

            insight={generateKpiInsight("App opens", deltas.app_opens)}
            onAsk={() => onAskChat?.("Why did app opens change?")}
          />
          <KpiCard
            label="App CR"
            value={fmt.pct(current.app_cr)}
            delta={delta(deltas.app_cr)}
            format="pct"

            deltaFormat="pp"
            insight={generateKpiInsight("App CR", deltas.app_cr)}
            onAsk={() => onAskChat?.("What's driving the CR change?")}
          />
          <KpiCard
            label="App AOV"
            value={fmt.inr(current.avg_aov)}
            delta={delta(deltas.avg_aov)}
            format="curr"

            insight={generateKpiInsight("App AOV", deltas.avg_aov)}
            onAsk={() => onAskChat?.("Why did AOV change?")}
          />
          <KpiCard
            label="Revenue per open"
            value={fmt.inr(current.revenue_per_open)}
            delta={delta(deltas.revenue_per_open)}
            format="curr"

            insight={generateKpiInsight("Revenue per open", deltas.revenue_per_open)}
            onAsk={() => onAskChat?.("How to improve revenue per open?")}
          />
        </div>
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Installs"
          value={fmt.num(current.installs)}
          delta={delta(deltas.installs)}
          format="num"
          insight={generateKpiInsight("Installs", deltas.installs)}
          onAsk={() => onAskChat?.("How to increase installs?")}
        />
    <KpiCard
  label="Uninstalls"
  value={fmt.num(current.uninstalls)}
  delta={delta(deltas.uninstalls)}
  format="num"
  insight={
    deltas.uninstalls && deltas.uninstalls > 0
      ? `Uninstalls up — ${fmt.pct(uninstallRate)} rate. Check app stability.`
      : deltas.uninstalls && deltas.uninstalls < 0
      ? `Uninstalls down — ${fmt.pct(uninstallRate)} rate. Retention improving.`
      : `${fmt.pct(uninstallRate)} of installs uninstalled.`
  }
  onAsk={() => onAskChat?.("Why are users uninstalling?")}
/>
        <KpiCard
          label="DAU / MAU"
          value={fmt.pct(current.dau_mau)}
          delta={delta(deltas.dau_mau)}
          format="pct"
          deltaFormat="pp"

          insight={generateKpiInsight("DAU / MAU", deltas.dau_mau)}
          onAsk={() => onAskChat?.("How to improve user stickiness?")}
        />
        <KpiCard
          label="Avg sessions / user"
          value={current.avg_sessions_per_user?.toFixed(1)}
          delta={delta(deltas.avg_sessions_per_user)}
          format="num"

          insight={generateKpiInsight("Avg sessions / user", deltas.avg_sessions_per_user)}
          onAsk={() => onAskChat?.("How to increase session frequency?")}
        />
      </div>

      {/* App Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>App funnel · with drop-off attribution</CardTitle>
        </CardHeader>
        <CardBody>
          {data.funnel && data.funnel.length > 0 && (
            <>
          <Funnel steps={data.funnel} />
<div className="mt-4 space-y-3 text-sm">
  {(() => {
    // Find biggest drop step (excluding first step which has drop=0)
    const stepsWithDrop = data.funnel.slice(1);
    const biggestDropStep = stepsWithDrop.reduce((max, step) => 
      step.drop > max.drop ? step : max
    , stepsWithDrop[0]);
    
    // Find best converting step
    const stepsWithConversion = data.funnel.slice(1);
    const bestStep = stepsWithConversion.reduce((best, step) =>
      (step.step_conversion || 0) > (best.step_conversion || 0) ? step : best
    , stepsWithConversion[0]);
    
    // Find purchase conversion
    const purchaseStep = data.funnel.find(s => s.step === "Purchase");
    const overallCR = purchaseStep ? (purchaseStep.overall_pct * 100).toFixed(2) : "0";
    
    // Get previous step name for context
    const biggestDropIdx = data.funnel.findIndex(s => s.step === biggestDropStep.step);
    const previousStepName = biggestDropIdx > 0 ? data.funnel[biggestDropIdx - 1].step : "";
    
    // Generate drop reason based on which step drops most
    const dropReasons = {
      "PDP views": "Users not engaging with product listings — improve homepage/category navigation, consider personalized recommendations.",
      "Add to cart": "Product page friction — check stock-out variants, price visibility, image quality, and product info clarity.",
      "Begin checkout": "Cart abandonment — review pricing transparency, shipping costs, and checkout button visibility.",
      "Payment selected": "Checkout flow issues — simplify forms, add guest checkout, address validation problems.",
      "Purchase": "Payment failures — UPI/card declines, OTP issues, payment gateway timeouts. Add COD as fallback."
    };
    
    return (
      <>
        <div className="p-3 bg-muted/30 rounded-lg">
          <div className="font-medium text-xs text-muted uppercase mb-1">Strongest step</div>
          <div>
            {bestStep.step} converts at <strong>{(bestStep.step_conversion * 100).toFixed(1)}%</strong> from previous step — 
            this is your highest performing transition.
          </div>
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
          <div className="font-medium text-xs text-muted uppercase mb-1">Biggest leak</div>
          <div>
            <strong>{previousStepName} → {biggestDropStep.step}</strong>: 
            losing <strong>{(biggestDropStep.drop * 100).toFixed(1)}%</strong> of users 
            ({fmt.num(Math.round(biggestDropStep.count / (1 - biggestDropStep.drop) - biggestDropStep.count))} dropped). 
            Reducing this drop by half could add ~{fmt.num(Math.round(biggestDropStep.count * 0.5))} more users.
          </div>
        </div>
        <div className="p-3 bg-destructive/10 rounded-lg">
          <div className="font-medium text-xs text-muted uppercase mb-1">Drop reasons</div>
          <div>{dropReasons[biggestDropStep.step] || "Investigate user behavior at this step."}</div>
        </div>
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
          <div className="font-medium text-xs text-muted uppercase mb-1">Overall</div>
          <div>
            Final conversion rate: <strong>{overallCR}%</strong> 
            (App opens → Purchase). 
            Total purchases: <strong>{fmt.num(purchaseStep?.count || 0)}</strong>.
          </div>
        </div>
      </>
    );
  })()}
</div>
            </>
          )}
        </CardBody>
      </Card>

      {/* Install Attribution & CR by Platform - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Install Attribution */}
        <Card>
          <CardHeader>
            <CardTitle>Install attribution · 30d</CardTitle>
          </CardHeader>
          <CardBody>
            {data.install_attribution && data.install_attribution.length > 0 ? (
              <DataTable
                columns={[
                  { key: "source", label: "Source" },
                  { key: "installs", label: "Installs", render: (row) => fmt.num(row.installs) },
                  { key: "d1_retain", label: "D1 retain", render: (row) => fmt.pct(row.d1_retain) },
                  { key: "d30_retain", label: "D30 retain", render: (row) => fmt.pct(row.d30_retain) },
                  { key: "cost_per_install", label: "Cost/install", render: (row) => fmt.inr(row.cost_per_install) },
                ]}
                rows={data.install_attribution}
              />
            ) : (
              <div className="text-sm text-muted py-4">No install data available for this period.</div>
            )}
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg text-sm">
              Referral has highest D30 retention at lowest paid cost.
            </div>
          </CardBody>
        </Card>

        {/* CR by Platform */}
        <Card>
          <CardHeader>
            <CardTitle>CR by platform</CardTitle>
          </CardHeader>
          <CardBody>
            {data.by_platform && data.by_platform.length > 0 ? (
              <DataTable
                columns={[
                  { key: "platform", label: "Platform" },
                  { key: "opens", label: "Opens", render: (row) => fmt.num(row.opens) },
                  { key: "cr", label: "CR", render: (row) => fmt.pct(row.cr) },
                  { key: "aov", label: "AOV", render: (row) => fmt.inr(row.aov) },
                  { key: "crash_rate", label: "Crash", render: (row) => fmt.pct(row.crash_rate) },
                ]}
                rows={data.by_platform}
              />
            ) : (
              <div className="text-sm text-muted py-4">No platform data available.</div>
            )}
            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg text-sm">
              iOS converts 33% better and crashes 3x less.
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign performance</CardTitle>
        </CardHeader>
        <CardBody>
          {data.push_performance && (
            <DataTable
              columns={[
                { key: "campaign_type", label: "Campaign" },
                { key: "sent", label: "Sessions", render: (row) => fmt.num(row.sent) },
                { key: "cr_after_open", label: "CR", render: (row) => fmt.pct(row.cr_after_open) },
                { key: "revenue", label: "Revenue", render: (row) => fmt.inr(row.revenue) },
                { key: "rev_per_notif", label: "Rev/session", render: (row) => fmt.inr(row.rev_per_notif) },
                { key: "trend", label: "Trend" },
              ]}
              rows={data.push_performance}
            />
          )}
        </CardBody>
      </Card>
    </div>
  );
}