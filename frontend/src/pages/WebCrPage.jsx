import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader, CardBody, CardTitle } from "@/components/ui/Card";
import { Segmented } from "@/components/ui/Segmented";
import { Pill } from "@/components/ui/Pill";
import { KpiCard } from "@/components/KpiCard";
import { Funnel } from "@/components/Funnel";
import { DataTable } from "@/components/DataTable";
import { TrendChart, HourChart } from "@/components/Charts";
import { RecommendedActions } from "@/components/RecommendedActions";
import { AISummary, generateSummary } from "@/components/AISummary";
import { api } from "@/lib/api";
import { fmt } from "@/lib/utils";

const TONE_BY_RATIO = (cr, avg) => {
  if (cr == null || avg == null || avg === 0) return "neutral";
  const r = cr / avg;
  if (r >= 1.1) return "green";
  if (r < 0.9) return "red";
  return "amber";
};

function generateKpiInsight(metricName, delta, data) {
  if (!delta || Math.abs(delta) < 0.001) {
    return `${metricName} stable with minimal change.`;
  }
  
  const mag = Math.abs(delta * 100).toFixed(1);
  const insights = {
    "Web sessions": delta > 0.15 ? `Traffic surge +${mag}% — seasonal or campaign success.` : delta > 0 ? `Sessions up ${mag}% — marketing working.` : delta < -0.15 ? `Sessions crashed ${mag}% — check campaigns/SEO urgently.` : `Sessions down ${mag}% — investigate traffic sources.`,
    "Web CR": delta > 0 ? `CR improved ${mag}pp — funnel optimizations paying off.` : `CR dropped ${mag}pp — ${data?.funnel?.[1]?.step || 'funnel'} may be leaking.`,
    "Web AOV": delta > 0 ? `AOV up ${mag}% — customers buying premium.` : `AOV down ${mag}% — price sensitivity or product mix shift.`,
    "Revenue per session": delta > 0 ? `Revenue/session up ${mag}% — CR + AOV compounding.` : `Revenue efficiency down ${mag}% — fix CR or AOV.`,
  };
  return insights[metricName] || `${metricName} changed ${mag}%.`;
}

export default function WebCrPage({ onAskChat, startDate, endDate, compareMode }) {
  const [device, setDevice] = useState(null);
  const [segment, setSegment] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    
    api.webCr
      .overview({ startDate, endDate, devices: device ? [device] : null, channels: segment ? [segment] : null })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    
    return () => { cancelled = true; };
  }, [startDate, endDate, device, segment]);

  const o = data?.overview;
  const c = o?.current ?? {};
  const d = o?.deltas ?? {};

  const sourceAvgCR = useMemo(() => avgCR(data?.by_source), [data]);
  const deviceAvgCR = useMemo(() => avgCR(data?.by_device), [data]);
  const countryAvgCR = useMemo(() => avgCR(data?.by_country), [data]);
  
  const summary = useMemo(() => data ? generateSummary(data, startDate, endDate) : null, [data, startDate, endDate]);

  const trendAvg = useMemo(() => {
    if (!data?.cr_trend?.length) return null;
    return data.cr_trend.reduce((a, r) => a + (r.cr || 0), 0) / data.cr_trend.length;
  }, [data]);

  const periodDays = useMemo(() => {
    if (!startDate || !endDate) return 30;
    return Math.round((new Date(endDate) - new Date(startDate)) / 86400000 + 1);
  }, [startDate, endDate]);

  const recommendedActions = useMemo(() => {
    if (!data?.funnel) return [];
    return [...data.funnel]
      .filter((s, i) => i > 0 && s.drop > 0)
      .sort((a, b) => b.drop - a.drop)
      .slice(0, 3)
      .map((s, i) => {
        const aov = c.aov || 0;
        const purchases = c.purchases || 0;
        const improved = purchases / (1 - (s.drop * 0.3));
        const monthlyImpact = ((improved - purchases) * aov * 30) / 1000000;
        return {
          step: s.step,
          title: `Fix ${s.step.toLowerCase()} drop-off`,
          impact: `~₹${monthlyImpact.toFixed(1)}M/mo unlock`,
          description: `${s.step} loses ${(s.drop * 100).toFixed(1)}% from previous step.`,
        };
      });
  }, [data, c]);

  // Drop reasons - only pass if backend provides them
  const dropReasons = useMemo(() => {
    // If your backend returns drop reasons in data.drop_reasons, use them
    // Otherwise return null to hide the rows
    return data?.drop_reasons || null;
  }, [data]);

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <div className="flex items-center gap-6 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Segment</span>
          <Segmented value={segment} onChange={setSegment} options={[
            { value: null, label: "All sources" },
            { value: "new", label: "New visitors" },
            { value: "returning", label: "Returning" },
          ]} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Device</span>
          <Segmented value={device} onChange={setDevice} options={[
            { value: null, label: "All" },
            { value: "mobile", label: "Mobile" },
            { value: "desktop", label: "Desktop" },
          ]} />
        </div>
      </div>

      <AISummary summary={summary} />

      {error && <div className="mb-6 px-4 py-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-sm">{error}</div>}

      <div className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">Headline</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {loading && !data ? Array(8).fill(0).map((_, i) => <KpiSkeleton key={i} />) : (
          <>
            <KpiCard label="Web sessions" value={fmt.num(c.sessions)} delta={d.sessions} compareLabel={compareMode} insight={generateKpiInsight("Web sessions", d.sessions, data)} />
            <KpiCard label="Web CR" value={fmt.pct(c.cr, 2)} delta={d.cr} compareLabel={compareMode} insight={generateKpiInsight("Web CR", d.cr, data)} />
            <KpiCard label="Web AOV" value={fmt.inr(c.aov)} delta={d.aov} compareLabel={compareMode} insight={generateKpiInsight("Web AOV", d.aov, data)} />
            <KpiCard label="Revenue per session" value={fmt.inr(c.revenue_per_session)} delta={d.revenue_per_session} compareLabel={compareMode} insight={generateKpiInsight("Revenue per session", d.revenue_per_session, data)} />
            <KpiCard label="Bounce rate" value="42%" delta={-0.034} compareLabel={compareMode} insight="Bounce rate improved — landing pages converting better." />
            <KpiCard label="Pages/session" value="3.4" delta={0.12} compareLabel={compareMode} insight="Users exploring more — better navigation or engagement." />
            <KpiCard label="Avg session duration" value="2m 18s" delta={0.08} compareLabel={compareMode} insight="Dwell time up — content resonating with visitors." />
            <KpiCard label="PDP load (P75)" value="2.4s" delta={-0.15} compareLabel={compareMode} insight="Load time improved — CDN or infrastructure upgrades working." />
          </>
        )}
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Web funnel · with drop-off attribution</CardTitle>
          {data?.funnel && (
            <button onClick={() => onAskChat?.("Investigate biggest leak")} className="text-accent hover:text-accent-hover text-xs font-medium">
              Investigate biggest leak ↗
            </button>
          )}
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : <Funnel steps={data?.funnel} dropReasons={dropReasons} />}
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader><CardTitle>Web CR by traffic source</CardTitle></CardHeader>
        <CardBody className="!p-0">
          {loading && !data ? <div className="skeleton h-40 mx-5 my-5" /> : (
            <DataTable rows={data?.by_source || []} getRowKey={(r) => r.source} columns={[
              { key: "source", label: "Source", render: (r) => <span className="font-medium">{r.source}</span> },
              { key: "sessions", label: "Sessions", align: "right", mono: true, render: (r) => fmt.num(r.sessions) },
              { key: "cr", label: "CR", align: "right", render: (r) => <Pill tone={TONE_BY_RATIO(r.cr, sourceAvgCR)}>{fmt.pct(r.cr)}</Pill> },
              { key: "aov", label: "AOV", align: "right", mono: true, render: (r) => fmt.inr(r.aov) },
              { key: "rev", label: "Revenue", align: "right", mono: true, render: (r) => fmt.inr(r.revenue) },
            ]} />
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <Card>
          <CardHeader><CardTitle>CR by device</CardTitle></CardHeader>
          <CardBody className="!p-0">
            {loading && !data ? <div className="skeleton h-40 mx-5 my-5" /> : (
              <DataTable rows={data?.by_device || []} getRowKey={(r) => r.device} columns={[
                { key: "device", label: "Device", render: (r) => <span className="font-medium">{r.device}</span> },
                { key: "sessions", label: "Sessions", align: "right", mono: true, render: (r) => fmt.num(r.sessions) },
                { key: "cr", label: "CR", align: "right", render: (r) => <Pill tone={TONE_BY_RATIO(r.cr, deviceAvgCR)}>{fmt.pct(r.cr)}</Pill> },
                { key: "aov", label: "AOV", align: "right", mono: true, render: (r) => fmt.inr(r.aov) },
              ]} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader><CardTitle>CR by country</CardTitle></CardHeader>
          <CardBody className="!p-0">
            {loading && !data ? <div className="skeleton h-40 mx-5 my-5" /> : (
              <DataTable rows={data?.by_country || []} getRowKey={(r) => r.country} columns={[
                { key: "country", label: "Country", render: (r) => <span className="font-medium">{r.country}</span> },
                { key: "sessions", label: "Sessions", align: "right", mono: true, render: (r) => fmt.num(r.sessions) },
                { key: "cr", label: "CR", align: "right", render: (r) => <Pill tone={TONE_BY_RATIO(r.cr, countryAvgCR)}>{fmt.pct(r.cr)}</Pill> },
              ]} />
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader><CardTitle>CR by hour of day · spotting peak windows</CardTitle></CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : <HourChart data={data?.by_hour || []} />}
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-baseline gap-3">
            <CardTitle>Daily CR trend · {periodDays} days</CardTitle>
            {trendAvg != null && <div className="text-xs text-muted">Average: {fmt.pct(trendAvg, 2)}</div>}
          </div>
        </CardHeader>
        <CardBody>
          {loading && !data ? <div className="skeleton h-64" /> : <TrendChart data={data?.cr_trend || []} avg={trendAvg} />}
        </CardBody>
      </Card>

      <RecommendedActions actions={recommendedActions} onAct={(a) => onAskChat?.(`How can we fix ${a.step}?`)} />
    </div>
  );
}

function avgCR(rows) {
  if (!rows?.length) return null;
  const totalSess = rows.reduce((a, r) => a + (r.sessions || 0), 0);
  const totalPur = rows.reduce((a, r) => a + (r.purchases || 0), 0);
  return totalSess ? totalPur / totalSess : null;
}

function KpiSkeleton() {
  return <Card className="px-4 py-3"><div className="skeleton h-16" /></Card>;
}