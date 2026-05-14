import { useEffect, useState } from "react";
import { AISummary } from "@/components/AISummary";
import { Segmented } from "@/components/ui/Segmented";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { WebCrTabs, WEB_CR_TABS } from "@/components/webcr/WebCrTabs";
import { OverviewTab } from "@/components/webcr/OverviewTab";
import { FunnelTab } from "@/components/webcr/FunnelTab";
import { WebCrKpiHeader } from "@/components/webcr/WebCrKpiHeader";

function PlaceholderTab({ tabKey }) {
  const meta = WEB_CR_TABS.find((t) => t.key === tabKey);
  return (
    <Card className="p-10 flex flex-col items-center justify-center text-center">
      <div
        className="w-3 h-3 rounded-sm mb-3"
        style={{ background: meta?.color }}
      />
      <div className="text-sm font-semibold text-text mb-1">
        {meta?.label}
      </div>
      <div className="text-xs text-muted max-w-md">
        Coming soon. This tab will surface {meta?.label.toLowerCase()} metrics in a future update.
      </div>
    </Card>
  );
}

export default function WebCrPage({ onAskChat, startDate, endDate, compareMode }) {
  const [tab, setTab] = useState("overview");
  const [device, setDevice] = useState(null);
  const [visitor, setVisitor] = useState(null);
  const [channel, setChannel] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [contentGroup, setContentGroup] = useState(null);
  const [landingPage, setLandingPage] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [aiSummary, setAiSummary] = useState("Generating AI insights...");
  const [filterOpts, setFilterOpts] = useState({
    channels: [],
    devices: [],
    campaigns: [],
    content_groups: [],
  });

  useEffect(() => {
    api.webCr
      .aiSummary()
      .then((res) => setAiSummary(res.summary))
      .catch((err) => {
        console.error("AI summary failed:", err);
        setAiSummary("Unable to generate AI summary at this time.");
      });
  }, []);

  useEffect(() => {
    api.webCr
      .filterOptions()
      .then((opts) => setFilterOpts({
        channels: opts.channels || [],
        devices: opts.devices || [],
        campaigns: opts.campaigns || [],
        content_groups: opts.content_groups || [],
      }))
      .catch((err) => console.error("Filter options failed:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    if (!data) {
      setInitialLoading(true);
    } else {
      setLoading(true);
    }

    api.webCr
      .overview({
        startDate,
        endDate,
        devices: device ? [device] : null,
        channels: channel ? [channel] : null,
        sessionTypes: visitor ? [visitor] : null,
        campaigns: campaign ? [campaign] : null,
        contentGroups: contentGroup ? [contentGroup] : null,
        landingPages: landingPage ? [landingPage] : null,
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setInitialLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, device, visitor, channel, campaign, contentGroup, landingPage]);

  const filters = { device, visitor, channel, campaign, contentGroup, landingPage };
  const setters = {
    setDevice,
    setVisitor,
    setChannel,
    setCampaign,
    setContentGroup,
    setLandingPage,
    resetAll: () => {
      setDevice(null);
      setVisitor(null);
      setChannel(null);
      setCampaign(null);
      setContentGroup(null);
      setLandingPage(null);
    },
  };

  return (
    <div className="px-6 py-6 max-w-[1600px] mx-auto">
      <WebCrTabs active={tab} onChange={setTab} />

      <div className="mt-4 flex items-center gap-6 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Visitor</span>
          <Segmented
            value={visitor}
            onChange={setVisitor}
            options={[
              { value: null, label: "All" },
              { value: "new", label: "New visitors" },
              { value: "returning", label: "Returning" },
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted">Device</span>
          <Segmented
            value={device}
            onChange={setDevice}
            options={[
              { value: null, label: "All" },
              { value: "mobile", label: "Mobile" },
              { value: "desktop", label: "Desktop" },
            ]}
          />
        </div>
      </div>

      <AISummary summary={aiSummary} />

      {error && (
        <div className="my-4 px-4 py-3 rounded-lg bg-danger-light border border-danger/20 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="mt-4">
        <WebCrKpiHeader
          data={data}
          initialLoading={initialLoading}
          loading={loading}
          compareMode={compareMode}
          onAskChat={onAskChat}
        />
      </div>

      <div className="mt-6">
        {tab === "overview" && (
          <OverviewTab
            data={data}
            initialLoading={initialLoading}
            loading={loading}
          />
        )}
        {tab === "funnel" && (
          <FunnelTab
            data={data}
            initialLoading={initialLoading}
            loading={loading}
            filters={filters}
            setters={setters}
            filterOpts={filterOpts}
          />
        )}
        {tab !== "overview" && tab !== "funnel" && <PlaceholderTab tabKey={tab} />}
      </div>
    </div>
  );
}
