import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";

export function ChatThinking({ thoughts, isStreaming }) {
  const [collapsed, setCollapsed] = useState(false);

  if (!thoughts || thoughts.length === 0) return null;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div
        className="px-4 py-3 flex items-center justify-between cursor-pointer hover:bg-surface-2 select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-text-2">Reasoning</span>
          <span className="bg-surface-3 px-2 py-0.5 rounded-full text-xs text-muted">
            {thoughts.length}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </div>
      {!collapsed && (
        <div className="px-4 pb-3 border-t border-border max-h-80 overflow-y-auto">
          <ol className="list-none m-0 p-2 relative">
            {thoughts.map((thought, i) => (
              <li
                key={i}
                className={`relative pl-6 py-2 text-sm text-text-2 ${
                  isStreaming && i === thoughts.length - 1 ? "animate-pulse" : ""
                }`}
              >
                <span className="absolute left-1 top-3 w-2 h-2 rounded-full bg-accent ring-2 ring-surface" />
                {thought}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}