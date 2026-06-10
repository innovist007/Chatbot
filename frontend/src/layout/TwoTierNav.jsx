import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";
import { Calendar, MessageSquare, ShieldCheck, LayoutDashboard, Menu, ChevronDown, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { NAV_STRUCTURE, ROUTE_TAB } from "@/layout/navConfig";
import { SidebarNav } from "@/layout/SidebarNav";
import { api } from "@/lib/api";

// ─────────────────────────── constants & helpers ───────────────────────────

const COMPARE_OPTIONS = [
  { value: "none",            label: "No comparison" },
  { value: "previous_period", label: "Previous period" },
  { value: "previous_year",   label: "Previous year" },
  { value: "custom",          label: "Custom range" },
];

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW_SHORT   = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const THIS_YEAR   = new Date().getFullYear();

const TODAY_ISO = (() => {
  const dt = new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;
})();

function isoString(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${d}, ${y}`;
}
function fmtShort(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const yr = y !== THIS_YEAR ? `, ${y}` : "";
  return `${MONTH_SHORT[m - 1]} ${d}${yr}`;
}
function fmtRange(s, e) {
  if (!s || !e) return "";
  const [sy, sm, sd] = s.split("-").map(Number);
  const [ey, em, ed] = e.split("-").map(Number);
  const sStr = `${MONTH_SHORT[sm-1]} ${sd}`;
  const eStr = `${MONTH_SHORT[em-1]} ${ed}`;
  if (sy !== ey) return `${sStr}, ${sy} – ${eStr}, ${ey}`;
  if (sm !== em) return `${sStr} – ${eStr}, ${ey}`;
  return `${sStr}–${ed}, ${ey}`;
}

// ─────────────────── portal dropdown helper ────────────────────────────────
// Renders children at document.body so they escape the nav stacking context.

function PortalDropdown({ anchorRef, open, children }) {
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!open || !anchorRef.current) return;
    function updatePos() {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}>
      {children}
    </div>,
    document.body
  );
}

// ─────────────────────── Shopify-style single-month calendar ───────────────

function MonthCalendar({ year, month, pickStart, pickEnd, hoverDate, onDayClick, onDayHover, disableFuture }) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMo = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMo; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const tentativeEnd = pickStart && !pickEnd ? hoverDate : null;
  const rangeEnd     = pickEnd || tentativeEnd;
  const low  = pickStart && rangeEnd ? (pickStart < rangeEnd ? pickStart : rangeEnd) : null;
  const high = pickStart && rangeEnd ? (pickStart < rangeEnd ? rangeEnd  : pickStart) : null;

  function cellStyle(d) {
    const iso    = isoString(year, month, d);
    const future = disableFuture && iso > TODAY_ISO;
    if (future) return { disabled: true, cls: "text-muted/30 cursor-not-allowed" };

    const isStart  = iso === pickStart;
    const isEnd    = iso === pickEnd;
    const inRange  = low && high && iso > low && iso < high;
    const isToday  = iso === TODAY_ISO;
    const isStartEdge = isStart && pickEnd;
    const isEndEdge   = isEnd   && pickStart;

    return {
      disabled: false,
      dot: isToday && !isStart && !isEnd,
      cls: cn(
        "relative w-full h-10 flex items-center justify-center text-sm transition-all select-none",
        inRange && "bg-accent/10",
        // left/right round caps for range edges
        isStartEdge && "rounded-r-none",
        isEndEdge   && "rounded-l-none",
        inRange && !isStart && !isEnd && "rounded-none",
        // circle for selected
        (isStart || isEnd)
          ? "bg-accent text-white rounded-full font-semibold z-10"
          : isToday
          ? "font-semibold text-accent hover:bg-elevated rounded-full"
          : "text-text hover:bg-elevated rounded-full cursor-pointer",
      ),
    };
  }

  return (
    <div className="w-full select-none">
      {/* Day-of-week header */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_SHORT.map((d) => (
          <div key={d} className="h-10 flex items-center justify-center text-xs font-medium text-muted/70 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const iso = isoString(year, month, d);
          const { disabled, dot, cls } = cellStyle(d);
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={() => !disabled && onDayClick(iso)}
              onMouseEnter={() => !disabled && onDayHover(iso)}
              className={cls}
            >
              {d}
              {dot && <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────── shared calendar picker state ──────────────────────

function useCalendarPicker(initialStart, initialEnd) {
  const [pickStart, setPickStart] = useState(initialStart || "");
  const [pickEnd,   setPickEnd]   = useState(initialEnd   || "");
  const [hoverDate, setHoverDate] = useState(null);
  const [calMonth,  setCalMonth]  = useState(() => {
    if (initialStart) {
      const [y, m] = initialStart.split("-").map(Number);
      return { year: y, month: m - 1 };
    }
    return { year: new Date().getFullYear(), month: new Date().getMonth() };
  });

  function prevMonth() {
    setCalMonth(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 });
  }
  function nextMonth() {
    setCalMonth(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 });
  }
  function handleDayClick(iso) {
    if (!pickStart || (pickStart && pickEnd)) {
      setPickStart(iso); setPickEnd("");
    } else {
      if (iso < pickStart) { setPickEnd(pickStart); setPickStart(iso); }
      else                 { setPickEnd(iso); }
    }
  }
  function reset() { setPickStart(""); setPickEnd(""); setHoverDate(null); }

  return { pickStart, setPickStart, pickEnd, setPickEnd,
           hoverDate, setHoverDate, calMonth, prevMonth, nextMonth, handleDayClick, reset };
}

// ─────────────────────────────── calendar panel ────────────────────────────
// Reusable panel: date boxes + single-month calendar + footer

function CalendarPanel({ pickStart, pickEnd, hoverDate, calMonth, onDayClick, onDayHover,
                         onPrev, onNext, onApply, onCancel, onClear, onBack,
                         disableFuture = true, applyDisabled }) {
  const hint = !pickStart ? "Select start date" : !pickEnd ? "Now select end date" : null;

  return (
    <div className="flex flex-col bg-surface rounded-lg shadow-lifted overflow-hidden" style={{ width: 340 }}>
      {/* Back link */}
      {onBack && (
        <button onClick={onBack}
          className="flex items-center gap-1.5 px-4 pt-4 pb-2 text-sm font-medium text-text hover:text-accent transition-colors self-start">
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      {/* Date range inputs */}
      <div className="flex items-center gap-2 px-4 pb-3 pt-1">
        <div className={cn(
          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium",
          !pickStart ? "border-accent ring-1 ring-accent/30 text-accent" : "border-border text-text bg-elevated/40"
        )}>
          {pickStart ? fmtDate(pickStart) : <span className="text-muted font-normal">Start date</span>}
        </div>
        <span className="text-muted">→</span>
        <div className={cn(
          "flex-1 px-3 py-2 rounded-lg border text-sm font-medium",
          pickStart && !pickEnd ? "border-accent ring-1 ring-accent/30 text-accent" : "border-border text-text bg-elevated/40"
        )}>
          {pickEnd ? fmtDate(pickEnd) : <span className="text-muted font-normal">End date</span>}
        </div>
      </div>

      {hint && (
        <div className="text-[11px] text-muted/70 text-center -mt-1 pb-2">{hint}</div>
      )}

      {/* Month navigation */}
      <div className="flex items-center justify-between px-4 pb-2">
        <button onClick={onPrev}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-elevated text-muted hover:text-text transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-text">
          {MONTH_NAMES[calMonth.month]}  {calMonth.year}
        </span>
        <button onClick={onNext}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-elevated text-muted hover:text-text transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="px-3" onMouseLeave={() => onDayHover("")}>
        <MonthCalendar
          year={calMonth.year} month={calMonth.month}
          pickStart={pickStart} pickEnd={pickEnd} hoverDate={hoverDate}
          onDayClick={onDayClick} onDayHover={onDayHover}
          disableFuture={disableFuture}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 mt-2 border-t border-border">
        {onClear
          ? <button onClick={onClear} className="text-xs text-muted hover:text-danger transition-colors">Clear</button>
          : <div />
        }
        <div className="flex gap-2">
          {onCancel && (
            <button onClick={onCancel}
              className="px-4 py-1.5 text-sm border border-border rounded-lg text-text hover:bg-elevated transition-colors">
              Cancel
            </button>
          )}
          <button onClick={onApply} disabled={applyDisabled}
            className="px-4 py-1.5 text-sm bg-accent text-white rounded-lg hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── main date range picker ────────────────────────

function MainDatePicker({ startDate, endDate, onDateChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const cal = useCalendarPicker(startDate, endDate);

  useEffect(() => { cal.setPickStart(startDate || ""); cal.setPickEnd(endDate || ""); }, [startDate, endDate]);

  useEffect(() => {
    const h = (e) => {
      if (!ref.current) return;
      // Close if click is outside both the button and any portal content
      const portal = document.getElementById("__main-datepicker-portal__");
      if (!ref.current.contains(e.target) && !portal?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function handleApply() {
    if (!cal.pickStart || !cal.pickEnd) return;
    onDateChange?.({ start: cal.pickStart, end: cal.pickEnd });
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs bg-elevated/50 hover:bg-elevated transition-colors">
        <Calendar className="w-3.5 h-3.5 text-muted flex-shrink-0" />
        <span className="text-text font-medium">{fmtRange(startDate, endDate) || "Select range"}</span>
        <ChevronDown className="w-3 h-3 text-muted flex-shrink-0" />
      </button>

      <PortalDropdown anchorRef={ref} open={open}>
        <div id="__main-datepicker-portal__" className="shadow-lifted rounded-lg border border-border">
          <CalendarPanel
            pickStart={cal.pickStart} pickEnd={cal.pickEnd} hoverDate={cal.hoverDate}
            calMonth={cal.calMonth} onDayClick={cal.handleDayClick} onDayHover={cal.setHoverDate}
            onPrev={cal.prevMonth} onNext={cal.nextMonth}
            onApply={handleApply} onCancel={() => setOpen(false)} onClear={cal.reset}
            applyDisabled={!cal.pickStart || !cal.pickEnd}
            disableFuture={true}
          />
        </div>
      </PortalDropdown>
    </div>
  );
}

// ─────────────────────────── compare picker ────────────────────────────────

function ComparePicker({ compareMode, customCompareStart, customCompareEnd, compareDates, onCompareChange }) {
  const [open,    setOpen]    = useState(false);
  const [showCal, setShowCal] = useState(false);
  const ref = useRef(null);

  const cal = useCalendarPicker(customCompareStart, customCompareEnd);

  useEffect(() => {
    cal.setPickStart(customCompareStart || "");
    cal.setPickEnd(customCompareEnd     || "");
  }, [customCompareStart, customCompareEnd]);

  useEffect(() => {
    const h = (e) => {
      const portal = document.getElementById("__compare-picker-portal__");
      if (!ref.current?.contains(e.target) && !portal?.contains(e.target)) {
        setOpen(false); setShowCal(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const activeLabel = compareMode === "none" ? "No comparison"
    : compareDates ? `${fmtShort(compareDates.start)} → ${fmtShort(compareDates.end)}`
    : compareMode === "custom" ? "Custom range"
    : compareMode === "previous_period" ? "Previous period"
    : "Previous year";

  function handleOptionClick(value) {
    if (value !== "custom") {
      onCompareChange({ mode: value });
      setOpen(false);
      setShowCal(false);
    } else {
      setShowCal(true);
    }
  }

  function handleApply() {
    if (!cal.pickStart || !cal.pickEnd) return;
    onCompareChange({ mode: "custom", customStart: cal.pickStart, customEnd: cal.pickEnd });
    setOpen(false);
    setShowCal(false);
  }

  function handleBack() {
    setShowCal(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => { const next = !open; setOpen(next); if (next) setShowCal(compareMode === "custom"); }}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-medium transition-colors whitespace-nowrap",
          compareMode === "none"
            ? "border-border text-muted bg-elevated/50 hover:bg-elevated"
            : "border-accent/40 text-accent bg-accent-soft hover:bg-accent-soft/80"
        )}
      >
        <span className="hidden sm:inline">{activeLabel}</span>
        <span className="sm:hidden">Compare</span>
        <ChevronDown className="w-3 h-3 flex-shrink-0" />
      </button>

      <PortalDropdown anchorRef={ref} open={open}>
        <div id="__compare-picker-portal__" className="shadow-lifted rounded-lg border border-border overflow-hidden">
          {!showCal ? (
            /* ── Options list ── */
            <div className="bg-surface w-48 p-1.5">
              <div className="text-[10px] font-semibold text-muted uppercase tracking-wider px-3 pt-1.5 pb-1">
                Compare to
              </div>
              {COMPARE_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => handleOptionClick(opt.value)}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-md transition-colors text-left",
                    compareMode === opt.value ? "bg-accent text-white" : "text-text hover:bg-elevated"
                  )}>
                  {opt.label}
                </button>
              ))}
            </div>
          ) : (
            /* ── Calendar ── */
            <CalendarPanel
              pickStart={cal.pickStart} pickEnd={cal.pickEnd} hoverDate={cal.hoverDate}
              calMonth={cal.calMonth} onDayClick={cal.handleDayClick} onDayHover={cal.setHoverDate}
              onPrev={cal.prevMonth} onNext={cal.nextMonth}
              onApply={handleApply} onBack={handleBack} onClear={cal.reset}
              applyDisabled={!cal.pickStart || !cal.pickEnd}
              disableFuture={true}
            />
          )}
        </div>
      </PortalDropdown>
    </div>
  );
}

// ─────────────────────────── nav export ────────────────────────────────────

export function TwoTierNav({
  startDate, endDate, onDateChange,
  compareMode, customCompareStart, customCompareEnd, compareDates, onCompareChange,
  onAskBot,
}) {
  const location  = useLocation();
  const { isAdmin, canAccess } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [latestDate, setLatestDate] = useState(null);

  useEffect(() => {
    api.webCr.latestDate().then((r) => {
      if (r?.date) setLatestDate(r.date);
    }).catch(() => {});
  }, []);

  const activeTabKey  = ROUTE_TAB[location.pathname] ?? null;
  const activeSection = NAV_STRUCTURE.find((s) => s.key === activeTabKey);
  const secondNav     = (activeSection?.pages ?? []).filter((p) => canAccess(p.to));

  return (
    <>
      <SidebarNav open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="bg-surface sticky top-0 z-30 shadow-sm">
        {/* ── Top tier ── */}
        <div className="border-b border-border">
          <div className="max-w-[1600px] mx-auto px-4 flex items-stretch justify-between h-11">
            <div className="flex items-stretch gap-2">
              <button onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center w-8 text-muted hover:text-text hover:bg-elevated rounded transition-colors flex-shrink-0"
                aria-label="Open navigation">
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 flex-shrink-0 pl-1">
                <div className="w-7 h-7 rounded-lg bg-accent flex items-center justify-center">
                  <LayoutDashboard className="w-4 h-4 text-white" />
                </div>
                <span className="font-semibold text-sm text-text">Innovist</span>
              </div>
            </div>
            {latestDate && (
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="font-medium hidden sm:inline">
                  Data through {new Date(latestDate + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
                <span className="text-muted/50 hidden sm:inline">·</span>
                <span className="hidden sm:inline">synced</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Second tier ── */}
        <div className="border-b border-border bg-surface/80">
          <div className="max-w-[1600px] mx-auto px-4 h-11 flex items-center justify-between gap-2">
            {/* Page tabs */}
            <div className="relative flex-1 min-w-0">
              <nav className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide">
                {secondNav.map(({ to, label }) => (
                  <NavLink key={to} to={to}
                    className={({ isActive }) => cn(
                      "px-3 py-1.5 text-[12.5px] font-medium rounded-md transition-colors whitespace-nowrap flex-shrink-0",
                      isActive ? "bg-accent text-white shadow-sm" : "text-muted hover:text-text hover:bg-elevated"
                    )}>
                    {label}
                  </NavLink>
                ))}
              </nav>
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-surface to-transparent" />
            </div>

            {/* Controls — desktop */}
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              <MainDatePicker startDate={startDate} endDate={endDate} onDateChange={onDateChange} />
              <div className="w-px h-5 bg-border" />
              <ComparePicker
                compareMode={compareMode}
                customCompareStart={customCompareStart}
                customCompareEnd={customCompareEnd}
                compareDates={compareDates}
                onCompareChange={onCompareChange}
              />
              <div className="w-px h-5 bg-border" />
              <button onClick={onAskBot}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-semibold rounded-md transition-colors">
                <MessageSquare className="w-3.5 h-3.5" />
                Ask bot
              </button>
              {isAdmin && (
                <NavLink to="/admin"
                  className={({ isActive }) => cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
                    isActive ? "bg-elevated text-text" : "text-muted hover:text-text hover:bg-elevated"
                  )}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Admin
                </NavLink>
              )}
            </div>

            {/* Mobile: icon-only */}
            <div className="flex md:hidden items-center gap-2 flex-shrink-0">
              <button onClick={onAskBot}
                className="flex items-center justify-center w-8 h-8 bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
                aria-label="Ask bot">
                <MessageSquare className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
