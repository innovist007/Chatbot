import { Card } from "@/shared/ui/Card";
import { KpiCard } from "@/shared/components/KpiCard";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { fmt } from "@/lib/utils";

function formatDuration(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const total = Number(value);
  if (!Number.isFinite(total) || total <= 0) return "—";
  const secs = Math.round(total);
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}m ${s.toString().padStart(2, "0")}s`;
  return `${s}s`;
}

function KpiSkeleton() {
  return (
    <Card className="px-4 py-3">
      <div className="skeleton h-16" />
    </Card>
  );
}

export function WebCrKpiHeader({ data, initialLoading, loading, onAskChat, hasComparison }) {
  const o = data?.overview;
  const c = o?.current ?? {};
  const raw = o?.deltas ?? {};
  const d = hasComparison ? raw : {};

  const sessionsPerDay = c.daily_avg_sessions;
  const ordersPerDay = c.daily_avg_purchases;
  const revPerDay = c.daily_avg_revenue;

  return (
    <div className="space-y-4">
      <SectionHeader title="Key metrics" subtitle="vs comparison period" tone="blue" />

      {initialLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array(5).fill(0).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <LoadingOverlay loading={loading}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <KpiCard
              label="Website sessions"
              value={fmt.num(c.sessions)}
              delta={d.sessions}

              onAsk={() => onAskChat?.("Why did website sessions change?")}
            />
            <KpiCard
              label="Conversion rate (CR)"
              value={fmt.pct(c.cr, 2)}
              delta={d.cr}

              onAsk={() => onAskChat?.("Why did CR change?")}
            />
            <KpiCard
              label="Add-to-cart rate"
              value={fmt.pct(c.atc_rate, 1)}
              delta={d.atc_rate}

              onAsk={() => onAskChat?.("Why did ATC rate change?")}
            />
            <KpiCard
              label="Checkout CR"
              value={fmt.pct(c.checkout_cr, 1)}
              delta={d.checkout_cr}

              onAsk={() => onAskChat?.("Why did checkout CR change?")}
            />
            <KpiCard
              label="Revenue / session"
              value={fmt.inr(c.revenue_per_session)}
              delta={d.revenue_per_session}

              onAsk={() => onAskChat?.("Why did revenue per session change?")}
            />
          </div>
        </LoadingOverlay>
      )}

      {initialLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array(5).fill(0).map((_, i) => <KpiSkeleton key={i} />)}
        </div>
      ) : (
        <LoadingOverlay loading={loading}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <Card className="px-4 py-3">
              <div className="text-xs text-muted mb-1">Daily averages</div>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-base font-semibold tnum text-text" title="Avg daily sessions">
                  {fmt.num(sessionsPerDay)}
                </span>
                <span className="text-border">·</span>
                <span className="text-base font-semibold tnum text-emerald-600" title="Avg daily orders">
                  {fmt.num(ordersPerDay)}
                </span>
                <span className="text-border">·</span>
                <span className="text-base font-semibold tnum text-amber-600" title="Avg daily revenue">
                  {fmt.inr(revPerDay)}
                </span>
              </div>
              <div className="text-[10px] text-muted mt-1">sessions · orders · revenue</div>
            </Card>

            <KpiCard
              label="AOV"
              value={fmt.inr(c.aov)}
              delta={d.aov}

              onAsk={() => onAskChat?.("Why did AOV change?")}
            />

            <Card className="px-4 py-3">
              <div className="text-xs text-muted mb-1">Bounce rate</div>
              <div className="text-2xl font-bold tnum text-muted">—</div>
              <div className="text-[10px] text-muted mt-1">Not available</div>
            </Card>

            <KpiCard
              label="Avg session duration"
              value={formatDuration(c.avg_session_duration)}
              delta={d.avg_session_duration}

              onAsk={() => onAskChat?.("Why did avg session duration change?")}
            />

            <KpiCard
              label="Returning visitor %"
              value={fmt.pct(c.returning_visitor_pct, 1)}
              delta={d.returning_visitor_pct}

              onAsk={() => onAskChat?.("Why did returning visitor share change?")}
            />
          </div>
        </LoadingOverlay>
      )}
    </div>
  );
}
