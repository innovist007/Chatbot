import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const CHAT_BASE_URL = import.meta.env.DEV 
  ? 'http://127.0.0.1:8000/ui/?embedded=1'
  : '/ui/?embedded=1';

const MIN_WIDTH = 320;
const MAX_WIDTH = 800;

export function ChatPanel({ open, onClose, deepLinkQuery, width = 500, onWidthChange }) {
  const iframeRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!open) return;
    const el = iframeRef.current;
    if (!el) return;

    const url = new URL(CHAT_BASE_URL);
    url.searchParams.set('_t', Date.now().toString());
    if (deepLinkQuery) url.searchParams.set("q", deepLinkQuery);
    
    el.src = url.toString();
    console.log('💬 Loading chat:', url.toString());
  }, [open, deepLinkQuery]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e) => {
      const newWidth = window.innerWidth - e.clientX;
      const clampedWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newWidth));
      onWidthChange?.(clampedWidth);
    };

    const handleMouseUp = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isDragging, onWidthChange]);

  return (
    <>
      {/* Resize Handle */}
      {open && (
        <div
          className={cn(
            "fixed top-0 bottom-0 w-1 z-[51] cursor-col-resize group",
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
          
          {/* Drag indicator */}
          <div className={cn(
            "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
            "w-1 h-12 bg-border-strong rounded-full",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isDragging && "opacity-100 bg-accent"
          )} />
        </div>
      )}

      {/* Chat Panel */}
      <aside
        className={cn(
          "fixed top-0 right-0 bottom-0 z-50",
          "bg-surface border-l border-border shadow-lifted",
          "flex flex-col",
          "transition-transform duration-300 ease-out",
          isDragging && "transition-none",
          open ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width }}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="text-sm font-semibold text-text">Ask the data</div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded border border-border text-muted hover:text-text hover:bg-elevated flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {open && (
          <iframe
            ref={iframeRef}
            className="flex-1 w-full border-0 min-h-0 bg-white"
            title="Chat"
            allow="clipboard-read; clipboard-write"
            style={{ pointerEvents: isDragging ? 'none' : 'auto' }}
          />
        )}
      </aside>
    </>
  );
}