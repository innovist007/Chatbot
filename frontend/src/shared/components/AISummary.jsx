import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function AISummary({ summary, loading, pending }) {
  const isEmpty = !summary && !loading && !pending;
  if (isEmpty) return null;

  return (
    <div className="bg-accent-soft border border-accent/20 rounded-lg p-4 mb-6">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-3">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Sparkles className={cn("w-4 h-4 text-accent flex-shrink-0", pending && "animate-pulse")} />
          <span className="text-xs font-semibold uppercase tracking-wider text-accent whitespace-nowrap">
            AI Summary
          </span>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed break-words min-w-0">
          {pending
            ? "✦ AI is analysing your data…"
            : loading
            ? "Loading…"
            : summary}
        </p>
      </div>
    </div>
  );
}

/**
 * Generate summary from real data analysis
 */
export function generateSummary(data, startDate, endDate) {
  if (!data?.overview || !data?.funnel) return null;

  const { current, deltas } = data.overview;
  const parts = [];

  const cr = current.cr || 0;
  const crDelta = deltas?.cr || 0;
  const crPct = (cr * 100).toFixed(2);
  const crDeltaPP = (crDelta * 100).toFixed(1);
  parts.push(`Web CR ${crPct}% (${crDelta >= 0 ? "+" : ""}${crDeltaPP}pp)`);

  let biggestLeak = null;
  for (let i = 1; i < data.funnel.length; i++) {
    if (!biggestLeak || data.funnel[i].drop > biggestLeak.drop) {
      biggestLeak = data.funnel[i];
    }
  }

  if (biggestLeak && biggestLeak.drop > 0.1) {
    const leakPct = (biggestLeak.drop * 100).toFixed(1);
    const aov = current.aov || 0;
    const purchases = current.purchases || 0;
    const improvedPurchases = purchases / (1 - biggestLeak.drop * 0.3);
    const additionalPurchases = improvedPurchases - purchases;
    const monthlyImpact = ((additionalPurchases * aov * 30) / 1000000).toFixed(1);
    parts.push(
      `${biggestLeak.step} (${leakPct}% drop) is the biggest leak. ` +
        `Fixing it could unlock ~₹${monthlyImpact}M/month.`
    );
  }

  const sessionsDelta = deltas?.sessions || 0;
  if (Math.abs(sessionsDelta) > 0.1) {
    const direction = sessionsDelta > 0 ? "up" : "down";
    const magnitude = Math.abs(sessionsDelta * 100).toFixed(0);
    parts.push(
      `Sessions ${direction} ${magnitude}% — ${sessionsDelta > 0 ? "strong growth" : "investigate drop causes"}.`
    );
  }

  return parts.join(" ");
}
