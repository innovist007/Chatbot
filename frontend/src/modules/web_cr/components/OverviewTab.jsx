import { useMemo } from "react";
import { Card, CardHeader, CardBody, CardTitle } from "@/shared/ui/Card";
import { SectionHeader } from "@/shared/components/SectionHeader";
import { LoadingOverlay } from "@/shared/ui/LoadingOverlay";
import { CrTrendChart } from "./CrTrendChart";
import { DeviceCrCard } from "./DeviceCrCard";
import { VisitorTypeCard } from "./VisitorTypeCard";
import { fmt } from "@/lib/utils";

export function OverviewTab({ data, initialLoading, loading }) {
  const o = data?.overview;
  const c = o?.current ?? {};

  const newPct = c.new_visitor_pct ?? (c.returning_visitor_pct != null ? 1 - c.returning_visitor_pct : null);

  const trendAvg = useMemo(() => {
    if (!data?.cr_trend?.length) return null;
    const totalSess = data.cr_trend.reduce((a, r) => a + (r.sessions || 0), 0);
    const totalPur = data.cr_trend.reduce((a, r) => a + (r.purchases || 0), 0);
    return totalSess ? totalPur / totalSess : null;
  }, [data]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Daily CR trend" subtitle="with session volume overlay" tone="blue" />
      <Card>
        <CardBody>
          {initialLoading ? (
            <div className="skeleton h-64" />
          ) : (
            <LoadingOverlay loading={loading}>
              <CrTrendChart data={data?.cr_trend || []} />
              {trendAvg != null && (
                <div className="text-xs text-muted mt-2">
                  Period average CR: <span className="tnum font-semibold text-text">{fmt.pct(trendAvg, 2)}</span>
                </div>
              )}
            </LoadingOverlay>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2">
          <SectionHeader
            title="Device & platform CR"
            subtitle="Mobile vs Desktop vs Tablet"
            tone="blue"
          />
          <Card>
            <CardHeader>
              <CardTitle>CR by device</CardTitle>
            </CardHeader>
            <CardBody>
              {initialLoading ? (
                <div className="skeleton h-48" />
              ) : (
                <LoadingOverlay loading={loading}>
                  <DeviceCrCard rows={data?.by_device || []} />
                </LoadingOverlay>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-2">
          <SectionHeader
            title="New vs returning visitor CR"
            subtitle="Session type split"
            tone="green"
          />
          <Card>
            <CardHeader>
              <CardTitle>Visitor type · share & CR</CardTitle>
            </CardHeader>
            <CardBody>
              {initialLoading ? (
                <div className="skeleton h-48" />
              ) : (
                <LoadingOverlay loading={loading}>
                  <VisitorTypeCard
                    newPct={newPct}
                    returningPct={c.returning_visitor_pct}
                    newCr={c.new_cr}
                    returningCr={c.returning_cr}
                  />
                </LoadingOverlay>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
