import { useState } from "react";
import { AISummary } from "@/components/AISummary";
import { Segmented } from "@/components/ui/Segmented";
import { Card } from "@/components/ui/Card";
import { WebCrTabs, WEB_CR_TABS } from "@/components/webcr/WebCrTabs";
import { OverviewTab } from "@/components/webcr/OverviewTab";
import { FunnelTab } from "@/components/webcr/FunnelTab";
import { ChannelsTab } from "@/components/webcr/ChannelsTab";
import { PagesProductsTab } from "@/components/webcr/PagesProductsTab";
import { WebCrKpiHeader } from "@/components/webcr/WebCrKpiHeader";
import { useWebCR } from "@/hooks/useWebCR";

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

export default function WebCrPage({ onAskChat, startDate, endDate, compareStart, compareEnd, hasComparison }) {
  const [tab, setTab] = useState("overview");

  const {
    data, loading, initialLoading, error,
    aiSummary, filterOpts,
    filters, setters,
    device, setDevice,
    visitor, setVisitor,
  } = useWebCR({ startDate, endDate, compareStart, compareEnd });

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
          onAskChat={onAskChat}
          hasComparison={hasComparison}
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
        {tab === "channels" && (
          <ChannelsTab
            data={data}
            initialLoading={initialLoading}
            loading={loading}
          />
        )}
        {tab === "pages" && (
          <PagesProductsTab
            data={data}
            initialLoading={initialLoading}
            loading={loading}
          />
        )}
        {tab !== "overview" && tab !== "funnel" && tab !== "channels" && tab !== "pages" && (
          <PlaceholderTab tabKey={tab} />
        )}
      </div>
    </div>
  );
}
