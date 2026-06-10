import { X, Send, Sparkles, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { streamChat, getAgentInfo } from "@/modules/chat/chatApi";
import { AgentMessage } from "@/modules/chat/components/AgentMessage";

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;

const SUGGESTIONS = [
  { label: "Trend", text: "Show the revenue trend for the last 30 days" },
  { label: "Top", text: "Top 10 customers by total revenue this year" },
  { label: "Compare", text: "Compare this month's revenue with last month" },
  { label: "Why", text: "Why did revenue drop on April 22?" },
];

export function ChatPanel({ open, onClose, deepLinkQuery, width = 500, onWidthChange }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Load agent info on mount
  useEffect(() => {
    if (!open) return;
    getAgentInfo()
      .then((info) => {
        setAgentName(info.display_name || (info.name || "").split("/").pop());
      })
      .catch((err) => console.error("Failed to load agent info:", err));
  }, [open]);

  // Auto-focus input when panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    } else {
      setIsFullscreen(false);
    }
  }, [open]);

  // Handle deep link query
  useEffect(() => {
    if (open && deepLinkQuery && !streaming) {
      handleSend(deepLinkQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deepLinkQuery]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Resize handle
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      onWidthChange?.(clampedWidth);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, onWidthChange]);

  async function handleSend(question) {
    if (streaming || !question.trim()) return;

    setStreaming(true);
    setInput("");

    // Add user message
    const userMessage = { role: "user", text: question };
    setMessages((prev) => [...prev, userMessage]);

    // Add empty agent message that we'll update as events come in
    const agentMessage = {
      role: "agent",
      status: "Thinking",
      thoughts: [],
      answer: [],
      sql: null,
      data: null,
      chart: null,
      follow_ups: [],
      error: null,
      isStreaming: true,
    };
    setMessages((prev) => [...prev, agentMessage]);

    try {
      await streamChat(question, (event) => {
        setMessages((prev) => {
          const newMessages = [...prev];
          const lastIdx = newMessages.length - 1;
          const last = { ...newMessages[lastIdx] };

          switch (event.type) {
            case "thought":
              last.thoughts = [...last.thoughts, ...(event.parts || [])];
              last.status = "Thinking";
              break;
            case "answer":
              last.answer = [...last.answer, ...(event.parts || [])];
              last.status = "Writing answer";
              break;
            case "sql":
              last.sql = event.sql;
              last.status = "Querying database";
              break;
            case "data":
              last.data = event.rows;
              last.status = "Analyzing results";
              break;
            case "chart":
              last.chart = event.spec;
              last.status = "Building visualization";
              break;
            case "follow_ups":
              last.follow_ups = event.parts || [];
              break;
            case "error":
              last.error = event.message || "Unknown error";
              break;
          }

          newMessages[lastIdx] = last;
          return newMessages;
        });
      });

      // Mark as done
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIdx = newMessages.length - 1;
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          isStreaming: false,
          status: "Done",
        };
        return newMessages;
      });
    } catch (err) {
      console.error("Chat error:", err);
      setMessages((prev) => {
        const newMessages = [...prev];
        const lastIdx = newMessages.length - 1;
        newMessages[lastIdx] = {
          ...newMessages[lastIdx],
          error: err.message || "Failed to get response",
          isStreaming: false,
        };
        return newMessages;
      });
    } finally {
      setStreaming(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    handleSend(input);
  }

  function handleClearChat() {
    setMessages([]);
  }

  return (
    <>
      {/* Resize Handle — hidden on mobile and when fullscreen */}
      {open && !isFullscreen && (
        <div
          className={cn(
            "fixed top-0 bottom-0 w-1 z-[51] cursor-col-resize group hidden md:block",
            "bg-border hover:bg-accent transition-colors",
            isDragging && "bg-accent"
          )}
          style={{ right: width }}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDoubleClick={() => onWidthChange?.(500)}
        >
          <div className="absolute inset-y-0 -left-2 -right-2" />
          <div
            className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
              "w-1 h-12 bg-border-strong rounded-full",
              "opacity-0 group-hover:opacity-100 transition-opacity",
              isDragging && "opacity-100 bg-accent"
            )}
          />
        </div>
      )}

      {/* Chat Panel */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50",
          "bg-bg border-l border-border shadow-lifted",
          "flex flex-col",
          "transition-transform duration-300 ease-out",
          isDragging && "transition-none",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: isFullscreen ? "100vw" : width, maxWidth: "100vw" }}
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div>
            <div className="text-sm font-semibold text-text">Ask the data</div>
            {agentName && <div className="text-xs text-muted mt-0.5">{agentName}</div>}
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={handleClearChat}
                className="text-xs text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-2"
              >
                New chat
              </button>
            )}
            {/* Fullscreen toggle — hidden on mobile (already fullscreen) */}
            <button
              onClick={() => setIsFullscreen((f) => !f)}
              className="hidden md:flex w-7 h-7 rounded border border-border text-muted hover:text-text hover:bg-surface-2 items-center justify-center transition-colors"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded border border-border text-muted hover:text-text hover:bg-surface-2 flex items-center justify-center transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-6 min-h-0">
          {messages.length === 0 ? (
            // Welcome screen
            <div className="text-center max-w-md mx-auto pt-8">
              <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center shadow-lg">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <h2 className="text-lg font-semibold mb-2">What would you like to know?</h2>
              <p className="text-sm text-muted mb-6">
                Ask about your data in plain English. The agent writes the SQL and shows charts.
              </p>
              <div className="grid gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.text)}
                    className="text-left px-4 py-3 bg-surface border border-border rounded-lg hover:bg-surface-2 hover:border-border-strong transition-all"
                  >
                    <div className="text-xs font-semibold text-accent uppercase tracking-wider mb-1">
                      {s.label}
                    </div>
                    <div className="text-sm text-text">{s.text}</div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            // Messages
            <div className="space-y-1">
              {messages.map((msg, i) =>
                msg.role === "user" ? (
                  <div key={i} className="mb-7 flex justify-end">
                    <div className="max-w-[75%] px-4 py-2.5 bg-surface-3 border border-border-strong rounded-2xl rounded-br-md text-sm">
                      {msg.text}
                    </div>
                  </div>
                ) : (
                  <AgentMessage
                    key={i}
                    message={msg}
                    onFollowUpClick={handleSend}
                  />
                )
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border flex-shrink-0">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask a question about your data..."
              disabled={streaming}
              className="flex-1 px-4 py-2.5 bg-surface border border-border rounded-lg text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={streaming || !input.trim()}
              className={cn(
                "w-10 h-10 rounded-lg bg-accent text-white flex items-center justify-center transition-all",
                "hover:bg-accent-hover disabled:bg-surface-3 disabled:text-muted disabled:cursor-not-allowed"
              )}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}