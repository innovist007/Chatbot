import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/overview",   label: "Overview",     enabled: false },
  { to: "/web-cr",     label: "Web CR",       enabled: true  },
  { to: "/app-cr",     label: "App CR",       enabled: false },
  { to: "/rto",        label: "RTO",          enabled: false },
  { to: "/repeat",     label: "Repeat",       enabled: false },
  { to: "/meta-perf",  label: "Meta perf.",   enabled: false },
  { to: "/supply",     label: "Supply chain", enabled: false },
];

export function TopBar({ rangeLabel = "Last 30 days", compareLabel = "MoM" }) {
  return (
    <header className="sticky top-0 z-30 bg-bg/85 backdrop-blur-md border-b border-border">
      <div className="max-w-[1400px] mx-auto px-6 h-14 flex items-center gap-4">
        {/* Brand with gradient logo */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          {/* Gradient cube logo */}
          <div className="relative w-7 h-7 group cursor-pointer">
            <div className="absolute inset-0 bg-gradient-to-br from-accent to-accent-hover rounded-md shadow-glow transition-transform duration-200 group-hover:scale-110" />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="relative z-10">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white" fillOpacity="0.9" />
                <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight bg-gradient-to-r from-text to-accent-hover bg-clip-text text-transparent">
              Innovist
            </div>
            <div className="text-[10px] text-muted uppercase tracking-wider -mt-0.5">Analytics</div>
          </div>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Tabs */}
        <nav className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1">
          {TABS.map(({ to, label, enabled }) =>
            enabled ? (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap transition-all",
                    isActive
                      ? "bg-accent text-white shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)]"
                      : "text-muted hover:text-text hover:bg-elevated"
                  )
                }
              >
                {label}
              </NavLink>
            ) : (
              <button
                key={to}
                disabled
                title="Coming soon"
                className="px-4 py-1.5 rounded-full text-[13px] font-medium whitespace-nowrap text-dim cursor-not-allowed"
              >
                {label}
              </button>
            )
          )}
        </nav>

        {/* Right-side date label */}
        <div className="hidden md:flex items-center gap-2 text-[12px] text-muted flex-shrink-0">
          <span className="font-medium text-text">{rangeLabel}</span>
          <span className="text-dim">·</span>
          <span className="text-muted">{compareLabel}</span>
        </div>
      </div>
    </header>
  );
}