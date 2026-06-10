import { useState } from "react";
import { api } from "@/lib/api";
import { useAsyncData } from "@/shared/hooks/useAsyncData";
import { useAiSummary } from "@/shared/hooks/useAiSummary";

export function useWebCR({ startDate, endDate, compareStart = null, compareEnd = null }) {
  // Filters
  const [device,       setDevice]       = useState(null);
  const [visitor,      setVisitor]      = useState(null);
  const [channel,      setChannel]      = useState(null);
  const [campaign,     setCampaign]     = useState(null);
  const [contentGroup, setContentGroup] = useState(null);
  const [landingPage,  setLandingPage]  = useState(null);

  function resetAll() {
    setDevice(null); setVisitor(null); setChannel(null);
    setCampaign(null); setContentGroup(null); setLandingPage(null);
  }

  // Main overview
  const { data, loading, initialLoading, error } = useAsyncData(
    () => api.webCr.overview({
      startDate, endDate,
      compareStart, compareEnd,
      devices:       device       ? [device]       : null,
      channels:      channel      ? [channel]      : null,
      sessionTypes:  visitor      ? [visitor]      : null,
      campaigns:     campaign     ? [campaign]     : null,
      contentGroups: contentGroup ? [contentGroup] : null,
      landingPages:  landingPage  ? [landingPage]  : null,
    }),
    [startDate, endDate, compareStart, compareEnd, device, visitor, channel, campaign, contentGroup, landingPage]
  );

  // Filter options — one-shot, cached
  const { data: filterOpts } = useAsyncData(
    () => api.webCr.filterOptions(),
    []
  );

  // AI summary — one-shot, cached
  const { summary: aiSummary, pending: aiPending } = useAiSummary(() => api.webCr.aiSummaryStreamUrl());

  return {
    data,
    loading,
    initialLoading,
    error,
    aiSummary,
    aiPending,
    filterOpts: filterOpts ?? { channels: [], devices: [], campaigns: [], content_groups: [] },
    // filters
    device,       setDevice,
    visitor,      setVisitor,
    channel,      setChannel,
    campaign,     setCampaign,
    contentGroup, setContentGroup,
    landingPage,  setLandingPage,
    resetAll,
    filters: { device, visitor, channel, campaign, contentGroup, landingPage },
    setters: { setDevice, setVisitor, setChannel, setCampaign, setContentGroup, setLandingPage, resetAll },
  };
}
