import { useState, useEffect } from "react";
import { Sparkles, BarChart3, Table2, Code, ChevronDown, ArrowRight } from "lucide-react";
import { marked } from "marked";
import { ChatThinking } from "./ChatThinking";
import { ChatChart } from "./ChatChart";
import { ChatTable } from "./ChatTable";
import { ChatSQL } from "./ChatSQL";

export function AgentMessage({ message, onFollowUpClick }) {
  const {
    status = "Thinking",
    thoughts = [],
    answer = [],
    sql = null,
    data = null,
    chart = null,
    follow_ups = [],
    error = null,
    isStreaming = false,
  } = message;

  const answerHtml = answer.length > 0 ? marked.parse(answer.join("\n\n")) : "";

  return (
    <div className="mb-7 animate-fade-in">
      <div className="flex gap-3">
        {/* Avatar */}
        <div className="w-8 h-8 flex-shrink-0 rounded-lg bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
          <Sparkles className="w-4 h-4 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-3">
          {/* Status Pill */}
          {!error && (
            <div className="self-start inline-flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-full text-xs font-medium text-blue-600 dark:text-blue-400">
              {isStreaming ? (
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              ) : (
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              )}
              {isStreaming ? status : "Done"}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              Error: {error}
            </div>
          )}

          {/* Thinking */}
          {thoughts.length > 0 && (
            <ChatThinking thoughts={thoughts} isStreaming={isStreaming} />
          )}

          {/* Answer */}
          {answer.length > 0 && (
            <div className="bg-surface border border-border rounded-lg p-5">
              <div
                className="prose prose-sm max-w-none text-sm leading-relaxed text-text"
                dangerouslySetInnerHTML={{ __html: answerHtml }}
              />
            </div>
          )}

          {/* Chart */}
          {chart && (
            <CollapsibleCard
              icon={<BarChart3 className="w-4 h-4" />}
              title="Visualization"
            >
              <ChatChart spec={chart} />
            </CollapsibleCard>
          )}

          {/* Data Table */}
          {data && data.length > 0 && (
            <CollapsibleCard
              icon={<Table2 className="w-4 h-4" />}
              title="Data"
              meta={`${data.length} ${data.length === 1 ? "row" : "rows"}`}
            >
              <ChatTable rows={data} />
            </CollapsibleCard>
          )}

          {/* SQL */}
          {sql && (
            <CollapsibleCard
              icon={<Code className="w-4 h-4" />}
              title="SQL"
              defaultCollapsed={true}
            >
              <ChatSQL sql={sql} />
            </CollapsibleCard>
          )}

          {/* Follow-ups */}
          {follow_ups.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {follow_ups.map((followUp, i) => (
                <button
                  key={i}
                  onClick={() => onFollowUpClick?.(followUp)}
                  className="px-3 py-2 bg-surface border border-border rounded-full text-sm text-text-2 hover:bg-blue-50 hover:border-blue-300 hover:text-text inline-flex items-center gap-1.5 transition-colors"
                >
                  <ArrowRight className="w-3 h-3 text-accent" />
                  {followUp}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Collapsible card wrapper
function CollapsibleCard({ icon, title, meta, children, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-2 select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-accent">{icon}</span>
          <span className="text-sm font-semibold">{title}</span>
          {meta && <span className="text-xs text-muted">{meta}</span>}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </div>
      {!collapsed && <div className="border-t border-border">{children}</div>}
    </div>
  );
}