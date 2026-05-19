import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  LineChart,
  PieChart,
  Bar,
  Line,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  Calendar,
  Download,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
} from "lucide-react";

const palette = {
  bg: "#F7F5F0",
  surface: "#FFFFFF",
  surface2: "#F0EDE6",
  surface3: "#E8E4DB",
  border: "rgba(60,52,40,0.1)",
  borderMd: "rgba(60,52,40,0.18)",
  text: "#1C1814",
  text2: "#6B6456",
  text3: "#9E9589",
  green: "#2D6A4F",
  greenBg: "#EAF4EE",
  greenLight: "#74C69D",
  amber: "#9B5C0A",
  amberBg: "#FEF3E2",
  amberLight: "#F4A261",
  red: "#9B2335",
  redBg: "#FDEDF0",
  redLight: "#E76F8A",
  blue: "#1A4F8A",
  blueBg: "#EAF1FB",
  blueLight: "#74B3E8",
  purple: "#3C3489",
  purpleBg: "#EEEDFE",
  purpleLight: "#9F96E8",
  coral: "#C0392B",
  teal: "#0F6E56",
};

const fontSans = "'DM Sans', sans-serif";
const fontMono = "'DM Mono', monospace";

const DATA = {
  MoM: {
    L: ["Nov", "Dec", "Jan", "Feb", "Mar", "Apr"],
    newRev: [42, 50, 52, 49, 52, 53],
    repRev: [30, 35, 38, 39, 41, 49],
    net: [72, 85, 90, 88, 93, 102],
    cm2: [4.1, 4.8, 5.0, 4.7, 5.5, 6.0],
    disc: [28.1, 27.3, 26.8, 26.2, 26.0, 25.8],
    sp: [41, 48, 51, 50, 52, 57],
    cac: [510, 490, 475, 468, 455, 462],
    nc: [12, 14.5, 15.2, 16.0, 17.0, 18.4],
    rto: [20.1, 19.4, 18.8, 18.2, 18.7, 17.5],
    cpo: [92, 89, 86, 85, 87, 84],
    rep: [29.8, 31.2, 31.8, 32.5, 33.1, 34.2],
    ltv: [1480, 1540, 1580, 1610, 1680, 1750],
    wCR: [7.9, 8.1, 8.3, 8.4, 8.6, 8.76],
    aCR: [10.8, 11.2, 11.5, 11.8, 12.1, 12.4],
  },
  WoW: {
    L: ["W1M", "W2M", "W3M", "W4M", "W1A", "W2A", "W3A", "W4A"],
    newRev: [13, 14, 13, 14, 13, 14, 14, 14],
    repRev: [9, 10, 10, 10, 11, 11, 12, 13],
    net: [22, 24, 23, 24, 24, 25, 26, 27],
    cm2: [1.3, 1.4, 1.3, 1.5, 1.4, 1.5, 1.5, 1.6],
    disc: [26.2, 26.0, 26.1, 25.9, 26.0, 25.7, 25.6, 25.8],
    sp: [13, 14, 13, 14, 13, 14, 15, 15],
    cac: [470, 465, 460, 458, 465, 460, 455, 462],
    nc: [3.8, 4.1, 4.0, 4.3, 4.2, 4.5, 4.7, 5.0],
    rto: [19.0, 18.8, 18.5, 18.7, 17.8, 17.6, 17.4, 17.5],
    cpo: [88, 87, 86, 87, 85, 84, 84, 84],
    rep: [32.5, 32.8, 33.0, 33.1, 33.5, 33.8, 34.0, 34.2],
    ltv: [1660, 1670, 1675, 1680, 1700, 1720, 1740, 1750],
    wCR: [8.5, 8.55, 8.58, 8.6, 8.65, 8.7, 8.73, 8.76],
    aCR: [11.9, 12.0, 12.1, 12.1, 12.2, 12.3, 12.35, 12.4],
  },
  DoD: {
    L: ["20", "21", "22", "23", "24", "25", "26"],
    newRev: [1.9, 2.0, 2.1, 2.0, 2.1, 2.2, 2.2],
    repRev: [1.7, 1.8, 1.9, 1.9, 2.0, 2.0, 2.1],
    net: [3.6, 3.8, 4.0, 3.9, 4.1, 4.2, 4.3],
    cm2: [0.21, 0.23, 0.24, 0.22, 0.25, 0.26, 0.27],
    disc: [25.9, 25.7, 25.6, 25.8, 25.5, 25.7, 25.8],
    sp: [2.0, 2.1, 2.2, 2.1, 2.3, 2.3, 2.4],
    cac: [468, 463, 460, 465, 458, 455, 462],
    nc: [0.6, 0.63, 0.65, 0.62, 0.66, 0.68, 0.7],
    rto: [17.8, 17.6, 17.4, 17.5, 17.3, 17.5, 17.5],
    cpo: [85, 84, 84, 85, 84, 84, 84],
    rep: [33.8, 33.9, 34.0, 34.0, 34.1, 34.1, 34.2],
    ltv: [1735, 1738, 1741, 1740, 1745, 1748, 1750],
    wCR: [8.72, 8.73, 8.74, 8.73, 8.75, 8.75, 8.76],
    aCR: [12.35, 12.37, 12.38, 12.37, 12.39, 12.39, 12.4],
  },
};

const SEG_MULT = {
  Overall: { n: 1, c: 1, d: 1, nc: 1, r: 1, l: 1 },
  New: { n: 0.52, c: 0.7, d: 1.08, nc: 1, r: 0.1, l: 0.6 },
  Repeat: { n: 0.48, c: 1.32, d: 0.91, nc: 0.1, r: 1, l: 1.4 },
  Web: { n: 0.72, c: 0.7, d: 1.05, nc: 0.65, r: 0.82, l: 0.85 },
  App: { n: 0.28, c: 1.3, d: 0.94, nc: 0.35, r: 1.18, l: 1.25 },
  Skincare: { n: 0.44, c: 0.9, d: 1.06, nc: 0.42, r: 0.95, l: 1.1 },
  Haircare: { n: 0.56, c: 1.08, d: 0.96, nc: 0.58, r: 1.05, l: 0.92 },
};

const ap = (arr, factor) =>
  arr.map((v) => Math.round(v * factor * 100) / 100);

/* ───── Reusable Cards ───── */
function Card({ children, className = "", style = {} }) {
  return (
    <div
      className={`rounded-[10px] overflow-hidden ${className}`}
      style={{
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        boxShadow:
          "0 1px 3px rgba(60,52,40,0.08), 0 1px 2px rgba(60,52,40,0.06)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children, color = "amber" }) {
  const map = {
    amber: { bg: palette.amberBg, fg: palette.amber },
    red: { bg: palette.redBg, fg: palette.red },
    blue: { bg: palette.blueBg, fg: palette.blue },
    green: { bg: palette.greenBg, fg: palette.green },
    purple: { bg: palette.purpleBg, fg: palette.purple },
  };
  const c = map[color];
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

function Kpi({
  label,
  value,
  subline,
  subColor = "muted",
  variant = "default",
  dot,
  mono = true,
  size = "lg",
}) {
  const bg =
    variant === "default" ? palette.surface2 : palette.surface;
  const borderColor =
    variant === "ag"
      ? "rgba(45,106,79,.35)"
      : variant === "ab"
      ? "rgba(26,79,138,.3)"
      : variant === "ar"
      ? "rgba(155,35,53,.3)"
      : variant === "hi"
      ? palette.border
      : "transparent";
  const borderWidth = variant === "ag" || variant === "ar" || variant === "ab" ? 1.5 : 1;
  const subColorMap = {
    up: palette.green,
    dn: palette.red,
    wn: palette.amber,
    muted: palette.text3,
  };
  return (
    <div
      className="min-w-0 transition-transform hover:-translate-y-0.5"
      style={{
        background: bg,
        borderRadius: 10,
        padding: "10px 12px",
        border: `${borderWidth}px solid ${borderColor}`,
      }}
    >
      <div
        className="text-[11px] flex items-center gap-1.5 mb-1"
        style={{ color: palette.text2 }}
      >
        {dot && (
          <span
            className="inline-block w-[7px] h-[7px] rounded-full"
            style={{ background: dot }}
          />
        )}
        {label}
      </div>
      <div
        className={`font-semibold leading-tight ${size === "sm" ? "text-[15px]" : "text-[20px]"}`}
        style={{ fontFamily: mono ? fontMono : fontSans, color: palette.text }}
      >
        {value}
      </div>
      {subline && (
        <div
          className="text-[11px] mt-0.5"
          style={{ color: subColorMap[subColor] || palette.text3 }}
        >
          {subline}
        </div>
      )}
    </div>
  );
}

/* ───── AI Flash ───── */
function AIFlash({ asOf }) {
  return (
    <Card>
      <div
        className="px-3.5 py-2 flex items-center gap-2 border-b"
        style={{
          background: palette.purpleBg,
          borderColor: "rgba(60,52,183,0.12)",
        }}
      >
        <div
          className="w-[22px] h-[22px] rounded-[6px] flex items-center justify-center"
          style={{ background: palette.purple }}
        >
          <Zap size={13} color="#fff" strokeWidth={2.5} />
        </div>
        <span
          className="text-[11px] font-semibold tracking-wide"
          style={{ color: palette.purple }}
        >
          AI daily flash
        </span>
        <span
          className="ml-auto text-[11px]"
          style={{ color: palette.text3, fontFamily: fontMono }}
        >
          {asOf}
        </span>
        <button
          className="text-[11px] px-2 py-0.5 rounded ml-1.5 flex items-center gap-1 transition-colors"
          style={{
            border: "1px solid rgba(60,52,183,0.2)",
            color: palette.purple,
            background: "transparent",
          }}
        >
          <RefreshCw size={10} /> Refresh
        </button>
      </div>
      <div
        className="px-3.5 py-2.5 text-[12px] leading-[1.7]"
        style={{ color: palette.text }}
      >
        <b>Apr 26:</b> Net sales <b>₹4.3M</b> (+8% DoD). Repeat rev{" "}
        <b>₹2.0M (47%)</b> — repeat share growing MoM, positive compounding
        signal. CM2 <b>₹0.27M</b> — margin drag from Sunscreen disc at 28.4%.
        RTO eased <b>0.3pp WoW</b> to 17.5%. App CR all-time high{" "}
        <b>12.4%</b>.{" "}
        <span style={{ color: palette.red }}>
          Watch: SLA breach 7.8% above 5% threshold → escalate courier D.
        </span>
      </div>
      <div className="flex gap-1.5 flex-wrap px-3.5 pb-2.5">
        {[
          { t: "Net rev +8% DoD", k: "g" },
          { t: "Repeat share 47% ↑", k: "g" },
          { t: "App CR 12.4% ATH", k: "g" },
          { t: "SLA breach 7.8%", k: "r" },
          { t: "Sunscreen CM2 2.8%", k: "r" },
          { t: "Spend ratio 56.2%", k: "a" },
          { t: "MoM net rev +9%", k: "b" },
        ].map((c) => (
          <Chip key={c.t} kind={c.k}>
            {c.t}
          </Chip>
        ))}
      </div>
    </Card>
  );
}

function Chip({ children, kind = "g" }) {
  const map = {
    g: { bg: palette.greenBg, border: "rgba(45,106,79,.25)", fg: palette.green },
    r: { bg: palette.redBg, border: "rgba(155,35,53,.2)", fg: palette.red },
    a: { bg: palette.amberBg, border: "rgba(155,92,10,.2)", fg: palette.amber },
    b: { bg: palette.blueBg, border: "rgba(26,79,138,.2)", fg: palette.blue },
  };
  const c = map[kind];
  return (
    <span
      className="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.fg }}
    >
      {children}
    </span>
  );
}

/* ───── Health RAG ───── */
function HealthRAG() {
  const items = [
    {
      color: palette.green,
      label: "Net Revenue",
      value: "₹102M",
      sub: "▲ +9% MoM · on track",
      valTone: palette.green,
      subTone: palette.green,
    },
    {
      color: palette.amber,
      label: "CM2%",
      value: "6.3%",
      sub: "Target 10% · watch",
      valTone: palette.amber,
      subTone: palette.amber,
    },
    {
      color: palette.red,
      label: "Spend ratio",
      value: "56.2%",
      sub: "Threshold 45% · red",
      valTone: palette.red,
      subTone: palette.red,
    },
    {
      color: palette.red,
      label: "RTO Rate",
      value: "17.5%",
      sub: "▼ −1.2pp · improving",
      valTone: palette.red,
      subTone: palette.green,
    },
  ];
  return (
    <Card>
      <div
        className="flex justify-between items-center px-4 py-2 text-[11px] font-medium border-b"
        style={{
          background: palette.surface2,
          color: palette.text2,
          borderColor: palette.border,
        }}
      >
        <span>Business health · Apr MTD</span>
        <span>RAG vs targets — hover for detail</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4">
        {items.map((it, i) => (
          <div
            key={it.label}
            className="px-4 py-3 transition-colors hover:bg-[#F0EDE6]"
            style={{
              borderRight:
                i < items.length - 1 ? `1px solid ${palette.border}` : "none",
              borderTop: `3px solid ${it.color}`,
              background: palette.surface,
            }}
          >
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: it.color }}
              />
              <span className="text-[11px]" style={{ color: palette.text2 }}>
                {it.label}
              </span>
            </div>
            <div
              className="text-[22px] font-semibold leading-none"
              style={{ fontFamily: fontMono, color: it.valTone }}
            >
              {it.value}
            </div>
            <div
              className="text-[11px] mt-1"
              style={{ color: it.subTone }}
            >
              {it.sub}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ───── Burn Equation ───── */
function BurnEquation() {
  const node = (txt, bg, fg) => (
    <span
      className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px] whitespace-nowrap"
      style={{ background: bg, color: fg, fontFamily: fontMono }}
    >
      {txt}
    </span>
  );
  const arr = (txt) => (
    <span
      className="text-[12px] font-medium"
      style={{ color: palette.red }}
    >
      {txt}
    </span>
  );
  return (
    <div
      className="rounded-[10px] px-4 py-2.5 flex items-center gap-2 flex-wrap"
      style={{ background: palette.redBg, border: "1px solid rgba(155,35,53,.2)" }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {node("MRP ₹180M", palette.blueBg, palette.blue)}
        {arr("−25.8% disc →")}
        {node("−₹46M →", palette.amberBg, palette.amber)}
        {arr("−17.5% RTO →")}
        {node("Net ₹102M", palette.greenBg, palette.green)}
        {arr("−56.2% spend →")}
        {node("CM2 ₹6M", palette.redBg, palette.red)}
      </div>
      <span
        className="text-[11px] ml-auto italic"
        style={{ color: palette.red }}
      >
        ₹100 net rev → ₹56 marketing → ₹6 CM2
      </span>
    </div>
  );
}

/* ───── Filter Bar ───── */
function FilterBar({ gran, seg, onGran, onSeg }) {
  return (
    <div
      className="flex items-center gap-2.5 flex-wrap rounded-[10px] px-3.5 py-2"
      style={{
        background: palette.surface,
        border: `1px solid ${palette.border}`,
        boxShadow:
          "0 1px 3px rgba(60,52,40,0.08), 0 1px 2px rgba(60,52,40,0.06)",
      }}
    >
      <span
        className="text-[11px] font-medium whitespace-nowrap"
        style={{ color: palette.text3 }}
      >
        Granularity
      </span>
      <div
        className="flex gap-0.5 rounded-[6px] p-0.5"
        style={{ background: palette.surface2 }}
      >
        {["DoD", "WoW", "MoM"].map((g) => {
          const on = gran === g;
          return (
            <button
              key={g}
              onClick={() => onGran(g)}
              className="text-[11px] px-3 py-1 rounded-[4px] transition-colors"
              style={{
                background: on ? palette.text : "transparent",
                color: on ? palette.bg : palette.text2,
                fontWeight: on ? 500 : 400,
                fontFamily: fontSans,
                border: "none",
              }}
            >
              {g}
            </button>
          );
        })}
      </div>
      <div
        className="w-px h-5 mx-0.5"
        style={{ background: palette.borderMd }}
      />
      <span
        className="text-[11px] font-medium whitespace-nowrap"
        style={{ color: palette.text3 }}
      >
        Segment
      </span>
      <div className="flex gap-1 flex-wrap">
        {[
          "Overall",
          "New",
          "Repeat",
          "Web",
          "App",
          "Skincare",
          "Haircare",
        ].map((s) => {
          const on = seg === s;
          return (
            <button
              key={s}
              onClick={() => onSeg(s)}
              className="text-[11px] px-3 py-1 rounded-full whitespace-nowrap transition-colors"
              style={{
                background: on ? palette.surface2 : "transparent",
                color: on ? palette.text : palette.text2,
                border: `1px solid ${on ? palette.borderMd : palette.border}`,
                fontWeight: on ? 500 : 400,
                fontFamily: fontSans,
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ───── Chart Card ───── */
function ChartCard({ title, legend, children }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-1.5">
        <span
          className="text-[12px] font-semibold"
          style={{ color: palette.text }}
        >
          {title}
        </span>
        {legend && <div className="flex gap-3 flex-wrap">{legend}</div>}
      </div>
      {children}
    </Card>
  );
}

function LegendItem({ color, dashed = false, children }) {
  return (
    <span
      className="flex items-center gap-1.5 text-[11px]"
      style={{ color: palette.text2 }}
    >
      <span
        className="inline-block w-3 h-[3px] rounded-sm"
        style={{
          background: dashed ? "transparent" : color,
          borderTop: dashed ? `2px dashed ${color}` : "none",
        }}
      />
      {children}
    </span>
  );
}

/* ───── Tooltip ───── */
const tooltipStyle = {
  background: "#1C1814",
  border: "none",
  borderRadius: 6,
  padding: 10,
  fontFamily: fontMono,
};
const tooltipLabel = { color: "#F7F5F0", fontSize: 11 };
const tooltipItem = { color: "#9E9589", fontSize: 11 };

/* ───── Waterfall ───── */
function WaterfallRow({ label, bold, value, leftPct, widthPct, ghostPct, fillBg, fillColor, valColor, valText, valBold }) {
  return (
    <div className="flex items-center gap-2.5 mb-1.5">
      <div
        className="text-[11px] w-[110px] text-right flex-shrink-0"
        style={{
          color: bold ? palette.text : palette.text2,
          fontWeight: bold ? 600 : 400,
        }}
      >
        {label}
      </div>
      <div
        className="flex-1 h-[22px] rounded-[4px] relative"
        style={{ background: "#DDD8CF" }}
      >
        {ghostPct > 0 && (
          <div
            className="absolute top-0 h-full rounded-[4px]"
            style={{ left: 0, width: `${ghostPct}%`, background: "#C8C3B8" }}
          />
        )}
        <div
          className="absolute top-0 h-full rounded-[4px] flex items-center px-2 text-[10px] font-semibold whitespace-nowrap overflow-hidden transition-all duration-500"
          style={{
            left: `${leftPct}%`,
            width: `${widthPct}%`,
            background: fillBg,
            color: fillColor,
          }}
        >
          {value}
        </div>
      </div>
      <div
        className="text-[11px] min-w-[140px]"
        style={{
          fontFamily: fontMono,
          color: valColor,
          fontWeight: valBold ? 600 : 400,
        }}
      >
        {valText}
      </div>
    </div>
  );
}

function WaterfallGap() {
  return (
    <div
      className="ml-[120px] h-1.5"
      style={{ borderLeft: `1.5px dashed ${palette.borderMd}` }}
    />
  );
}

function PnLWaterfall() {
  return (
    <Card style={{ padding: "16px 18px" }}>
      <WaterfallRow
        label="MRP Revenue"
        bold
        value="₹180M · 100%"
        leftPct={0}
        widthPct={100}
        ghostPct={0}
        fillBg="#85B7EB"
        fillColor="#042C53"
        valColor={palette.blue}
        valText="Base · 100% of MRP"
      />
      <WaterfallGap />
      <WaterfallRow
        label="− Discounts"
        value="−₹46M"
        leftPct={74.2}
        widthPct={25.8}
        ghostPct={74.2}
        fillBg="#E76F8A"
        fillColor="#4B1528"
        valColor={palette.red}
        valText="−25.8% of MRP"
      />
      <WaterfallGap />
      <WaterfallRow
        label="− RTO loss"
        value="−₹32M"
        leftPct={56.7}
        widthPct={17.5}
        ghostPct={56.7}
        fillBg="#F4A261"
        fillColor="#412402"
        valColor={palette.red}
        valText="−17.5% of MRP"
      />
      <WaterfallGap />
      <WaterfallRow
        label="= Net Revenue"
        bold
        value="₹102M · 56.7%"
        leftPct={0}
        widthPct={56.7}
        ghostPct={0}
        fillBg="#74C69D"
        fillColor="#173404"
        valColor={palette.green}
        valText="56.7% of MRP surviving"
        valBold
      />
      <WaterfallGap />
      <WaterfallRow
        label="− Mktg spend"
        value="−₹57M (56.2% of net)"
        leftPct={6.3}
        widthPct={50.4}
        ghostPct={6.3}
        fillBg="#F0997B"
        fillColor="#4A1B0C"
        valColor={palette.red}
        valText="−56.2% of net rev"
      />
      <WaterfallGap />
      <WaterfallRow
        label="= CM2"
        bold
        value="₹6M"
        leftPct={0}
        widthPct={6.3}
        ghostPct={0}
        fillBg={palette.green}
        fillColor={palette.greenBg}
        valColor={palette.green}
        valText="6.3% of net · target 10%"
        valBold
      />
    </Card>
  );
}

/* ───── Cohort / RFM ───── */
function CohortTable() {
  const rows = [
    { c: "Oct", v: ["100%", "34%", "24%", "18%", "14%", "12%", "11%"] },
    { c: "Jan", v: ["100%", "36%", "26%", "19%", "15%", "—", "—"] },
    { c: "Mar", v: ["100%", "35%", "26%", "—", "—", "—", "—"] },
    { c: "Apr", v: ["100%", "—", "—", "—", "—", "—", "—"] },
  ];
  const cellBg = [
    "#C0DD97",
    "#97C459",
    "#639922",
    "#3B6D11",
    "#27500A",
    "#173404",
    "#173404",
  ];
  const cellFg = ["#27500A", "#27500A", "#EAF3DE", "#EAF3DE", "#EAF3DE", "#EAF3DE", "#EAF3DE"];
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div
        className="text-[12px] font-semibold mb-2.5"
        style={{ color: palette.text }}
      >
        Cohort retention — M0 to M6
      </div>
      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr style={{ color: palette.text2 }}>
            <th className="text-left p-1.5 font-medium">Cohort</th>
            {["M0", "M1", "M2", "M3", "M4", "M5", "M6"].map((h) => (
              <th key={h} className="text-center p-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.c}>
              <td
                className="text-[11px] pl-0 py-1"
                style={{ color: palette.text3 }}
              >
                {r.c}
              </td>
              {r.v.map((v, i) =>
                v === "—" ? (
                  <td
                    key={i}
                    className="text-[11px] text-center"
                    style={{ color: palette.text3 }}
                  >
                    —
                  </td>
                ) : (
                  <td key={i} className="text-center p-0.5">
                    <span
                      className="inline-block px-1.5 py-1 rounded text-[11px] font-medium min-w-[38px]"
                      style={{
                        background: cellBg[i],
                        color: cellFg[i],
                        fontFamily: fontMono,
                      }}
                    >
                      {v}
                    </span>
                  </td>
                )
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function RFMBar({ label, pct, count, color }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-[11px] w-[68px]"
        style={{ color: palette.text2 }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-2 rounded overflow-hidden"
        style={{ background: palette.surface2 }}
      >
        <div
          className="h-full rounded"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-[11px] font-semibold w-8 text-right"
        style={{ color, fontFamily: fontMono }}
      >
        {count}
      </span>
    </div>
  );
}

function RFMSegments() {
  const data = [
    { l: "Champions", p: 50, c: "8.2K", color: palette.green },
    { l: "Loyal", p: 76, c: "12.4K", color: palette.blue },
    { l: "New", p: 100, c: "18.4K", color: palette.purple },
    { l: "At-risk", p: 34, c: "5.6K", color: palette.amberLight },
    { l: "Lapsed", p: 56, c: "9.1K", color: palette.redLight },
    { l: "One-time", p: 38, c: "6.2K", color: "#9E9589" },
  ];
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div
        className="text-[12px] font-semibold mb-2.5"
        style={{ color: palette.text }}
      >
        RFM segments
      </div>
      <div className="flex flex-col gap-2">
        {data.map((r) => (
          <RFMBar
            key={r.l}
            label={r.l}
            pct={r.p}
            count={r.c}
            color={r.color}
          />
        ))}
      </div>
    </Card>
  );
}

/* ───── SKU Table ───── */
function Badge({ kind, children }) {
  const map = {
    g: { bg: palette.greenBg, fg: palette.green },
    r: { bg: palette.redBg, fg: palette.red },
    a: { bg: palette.amberBg, fg: palette.amber },
  };
  const c = map[kind];
  return (
    <span
      className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

function SKUTable() {
  const rows = [
    { p: "Hair Growth Serum Roll On 25ml", r: "₹12.8M", rT: "up", u: "35.1K", d: "22.1%", dT: "", cm: "9.2%", cmK: "g", alert: "—", t: "▲ +8%", tT: "up" },
    { p: "Anti HF Shampoo & Cond.", r: "₹11.4M", rT: "up", u: "30.6K", d: "19.5%", cm: "8.7%", cmK: "g", alert: "—", t: "▲ +5%", tT: "up" },
    { p: "5% Niacinamide Sunscreen 200g", r: "₹10.2M", u: "27.9K", d: "28.4%", dT: "dn", cm: "5.1%", cmK: "a", alertK: "r", alert: "Disc↑", t: "— flat", tT: "mt" },
    { p: "Exf Face Wash 100ml", r: "₹9.8M", u: "26.8K", d: "23.7%", cm: "7.4%", cmK: "g", alert: "—", t: "▲ +11%", tT: "up" },
    { p: "Anti Dandruff Shampoo 750ml", r: "₹8.6M", rT: "dn", u: "23.6K", d: "32.6%", dT: "dn", cm: "2.8%", cmK: "r", alertK: "r", alert: "CM2↓", t: "▼ −6%", tT: "dn" },
    { p: "Brightening Face Serum 10ml", r: "₹8.1M", u: "22.2K", d: "21.3%", cm: "7.8%", cmK: "g", alert: "—", t: "▲ +14%", tT: "up" },
  ];
  const tone = (t) =>
    t === "up"
      ? palette.green
      : t === "dn"
      ? palette.red
      : t === "wn"
      ? palette.amber
      : palette.text3;
  return (
    <Card>
      <table className="w-full text-[12px]" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {["Product", "Apr rev", "Units", "Disc%", "CM2%", "Alert", "Trend"].map((h, i) => (
              <th
                key={h}
                className="font-semibold text-[11px] p-2.5 text-left tracking-wide"
                style={{
                  background: palette.surface2,
                  color: palette.text2,
                  borderBottom: `1px solid ${palette.border}`,
                  width: i === 0 ? "34%" : undefined,
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.p}
              className="hover:bg-[#F0EDE6] transition-colors"
            >
              {[
                <span className="truncate block" title={r.p} key="p">{r.p}</span>,
                <span style={{ color: tone(r.rT) }} key="r">{r.r}</span>,
                r.u,
                <span style={{ color: tone(r.dT) }} key="d">{r.d}</span>,
                <Badge kind={r.cmK} key="cm">{r.cm}</Badge>,
                r.alertK ? <Badge kind={r.alertK} key="al">{r.alert}</Badge> : r.alert,
                <span style={{ color: tone(r.tT) }} key="t">{r.t}</span>,
              ].map((c, j) => (
                <td
                  key={j}
                  className="p-2 truncate"
                  style={{
                    borderBottom:
                      i < rows.length - 1
                        ? `1px solid ${palette.border}`
                        : "none",
                    color: palette.text,
                  }}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ───── Recs ───── */
function Rec({ icon, kind, title, body }) {
  const map = {
    r: { bg: palette.redBg, border: "rgba(155,35,53,.2)", fg: palette.red },
    a: { bg: palette.amberBg, border: "rgba(155,92,10,.2)", fg: palette.amber },
    g: { bg: palette.greenBg, border: "rgba(45,106,79,.2)", fg: palette.green },
  };
  const c = map[kind];
  return (
    <div
      className="rounded-[10px] px-3.5 py-3"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <div className="text-[16px] mb-1.5" style={{ color: c.fg }}>
        {icon}
      </div>
      <div
        className="text-[12px] font-semibold mb-1"
        style={{ color: c.fg }}
      >
        {title}
      </div>
      <div className="text-[11px] leading-[1.55]" style={{ color: c.fg }}>
        {body}
      </div>
    </div>
  );
}

/* ───── Charts ───── */
function NetRevChart({ gran, seg }) {
  const d = DATA[gran];
  const s = SEG_MULT[seg];
  const data = d.L.map((l, i) => ({
    label: l,
    repeat: ap(d.repRev, s.n)[i],
    new: ap(d.newRev, s.n)[i],
    cm2: ap(d.cm2, s.c)[i],
    disc: ap(d.disc, s.d)[i],
  }));
  return (
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="rgba(60,52,40,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.text3, fontFamily: fontSans }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="L" tick={{ fontSize: 10, fill: palette.text3, fontFamily: fontSans }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 10, fill: palette.green, fontFamily: fontSans }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Bar yAxisId="L" dataKey="repeat" stackId="rev" fill="rgba(83,74,183,0.82)" radius={[3, 3, 0, 0]} name="Repeat rev (₹M)" />
          <Bar yAxisId="L" dataKey="new" stackId="rev" fill="rgba(116,179,232,0.82)" radius={[3, 3, 0, 0]} name="New rev (₹M)" />
          <Line yAxisId="R" type="monotone" dataKey="cm2" stroke={palette.green} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: palette.green }} name="CM2 (₹M)" />
          <Line yAxisId="L" type="monotone" dataKey="disc" stroke={palette.red} strokeWidth={1.5} dot={{ r: 2 }} name="Disc %" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function PnLTrendChart({ gran, seg }) {
  const d = DATA[gran];
  const s = SEG_MULT[seg];
  const data = d.L.map((l, i) => ({
    label: l,
    net: ap(d.net, s.n)[i],
    spend: ap(d.sp, s.n)[i],
    cm2: ap(d.cm2, s.c)[i],
  }));
  return (
    <div style={{ width: "100%", height: 190 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="rgba(60,52,40,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.text3, fontFamily: fontSans }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="L" tick={{ fontSize: 10, fill: palette.text3, fontFamily: fontSans }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 10, fill: palette.green, fontFamily: fontSans }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Bar yAxisId="L" dataKey="net" fill="rgba(116,198,157,0.82)" radius={[3, 3, 0, 0]} name="Net rev (₹M)" />
          <Bar yAxisId="L" dataKey="spend" fill="rgba(244,162,97,0.85)" radius={[3, 3, 0, 0]} name="Spends (₹M)" />
          <Line yAxisId="R" type="monotone" dataKey="cm2" stroke={palette.green} strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4, fill: palette.green }} name="CM2 (₹M)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CacNcChart({ gran, seg }) {
  const d = DATA[gran];
  const s = SEG_MULT[seg];
  const data = d.L.map((l, i) => ({
    label: l,
    nc: ap(d.nc, s.nc || 1)[i],
    cac: d.cac[i],
  }));
  return (
    <div style={{ width: "100%", height: 170 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="rgba(60,52,40,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="L" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 10, fill: palette.amberLight }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Bar yAxisId="L" dataKey="nc" fill="rgba(116,179,232,0.85)" radius={[3, 3, 0, 0]} name="New customers (K)" />
          <Line yAxisId="R" type="monotone" dataKey="cac" stroke={palette.amberLight} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 4, fill: palette.amberLight }} name="CAC (₹)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RetentionChart({ gran, seg }) {
  const dl = gran === "DoD" ? "WoW" : gran;
  const d = DATA[dl];
  const s = SEG_MULT[seg];
  const data = d.L.map((l, i) => ({
    label: l,
    rep: ap(d.rep, s.r || 1)[i],
    ltv: ap(d.ltv, s.l || 1)[i],
  }));
  return (
    <div style={{ width: "100%", height: 170 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="rgba(60,52,40,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="L" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 10, fill: palette.teal }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Line yAxisId="L" type="monotone" dataKey="rep" stroke={palette.green} strokeWidth={2} dot={{ r: 4, fill: palette.green }} name="Repeat %" />
          <Line yAxisId="R" type="monotone" dataKey="ltv" stroke={palette.teal} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="90d LTV (₹)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function RtoCpoChart({ gran }) {
  const d = DATA[gran];
  const data = d.L.map((l, i) => ({
    label: l,
    rto: d.rto[i],
    cpo: d.cpo[i],
  }));
  return (
    <div style={{ width: "100%", height: 150 }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="rgba(60,52,40,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="L" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis yAxisId="R" orientation="right" tick={{ fontSize: 10, fill: palette.amberLight }} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Line yAxisId="L" type="monotone" dataKey="rto" stroke={palette.red} strokeWidth={2} fill="rgba(155,35,53,0.07)" dot={{ r: 4, fill: palette.red }} name="RTO %" />
          <Line yAxisId="R" type="monotone" dataKey="cpo" stroke={palette.amberLight} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="CPO (₹)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function CourierDonut() {
  const data = [
    { name: "Delhivery 42%", value: 42, color: palette.blueLight },
    { name: "Shiprocket 28%", value: 28, color: palette.amberLight },
    { name: "DTDC 18%", value: 18, color: palette.greenLight },
    { name: "Others 12%", value: 12, color: "#B4B2A9" },
  ];
  return (
    <div style={{ width: "100%", height: 150 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" innerRadius="55%" outerRadius="90%" paddingAngle={2}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} stroke="none" />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Legend
            layout="vertical"
            verticalAlign="middle"
            align="right"
            wrapperStyle={{ fontSize: 11, fontFamily: fontSans, color: palette.text2 }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function CRChart({ gran }) {
  const d = DATA[gran];
  const data = d.L.map((l, i) => ({
    label: l,
    web: d.wCR[i],
    app: d.aCR[i],
  }));
  return (
    <div style={{ width: "100%", height: 165 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 4, right: 10, bottom: 4, left: -10 }}>
          <CartesianGrid stroke="rgba(60,52,40,0.06)" />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: palette.text3 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={tooltipLabel} itemStyle={tooltipItem} />
          <Line type="monotone" dataKey="web" stroke="#9E9589" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3 }} name="Web CR %" />
          <Line type="monotone" dataKey="app" stroke={palette.blue} strokeWidth={2} dot={{ r: 4, fill: palette.blue }} name="App CR %" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ───── Sidebar ───── */
function Sidebar({ active, onClick }) {
  const items = [
    { id: "s-flash", label: "AI Flash", color: palette.purple },
    { id: "s-rag", label: "Health RAG", color: palette.green },
    { id: "s-unit", label: "Unit economics", color: palette.amber },
    { id: "s-pnl", label: "P&L waterfall", color: palette.red },
    { id: "s-acq", label: "Acquisition", color: palette.blue },
    { id: "s-ret", label: "Retention", color: palette.green },
    { id: "s-sc", label: "Supply chain", color: palette.amber },
    { id: "s-wa", label: "Web & app", color: palette.blue },
    { id: "s-sku", label: "Top SKUs", color: palette.purple },
    { id: "s-rec", label: "Actions", color: palette.teal },
  ];
  return (
    <aside
      className="w-[200px] flex-shrink-0 py-4 sticky overflow-y-auto hidden md:block"
      style={{
        background: palette.surface,
        borderRight: `1px solid ${palette.border}`,
        top: 0,
        height: "calc(100vh - 56px)",
      }}
    >
      <div
        className="text-[10px] font-semibold tracking-wider px-6 pb-1 pt-2"
        style={{ color: palette.text3, textTransform: "uppercase", letterSpacing: ".8px" }}
      >
        Sections
      </div>
      {items.map((it) => {
        const on = active === it.id;
        return (
          <button
            key={it.id}
            onClick={() => onClick(it.id)}
            className="flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors w-full text-left"
            style={{
              background: on ? palette.surface2 : "transparent",
              color: on ? palette.text : palette.text2,
              fontWeight: on ? 500 : 400,
              fontFamily: fontSans,
              marginLeft: 12,
              marginRight: 12,
              width: "calc(100% - 24px)",
              borderRadius: 6,
              border: "none",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: it.color }}
            />
            {it.label}
          </button>
        );
      })}
    </aside>
  );
}

/* ───── MAIN PAGE ───── */
export default function D2COverviewPage() {
  const [gran, setGran] = useState("MoM");
  const [seg, setSeg] = useState("Overall");
  const [dateFrom, setDateFrom] = useState("2026-04-01");
  const [dateTo, setDateTo] = useState("2026-04-26");
  const [activeSection, setActiveSection] = useState("s-flash");

  const days = useMemo(() => {
    const a = new Date(dateFrom);
    const b = new Date(dateTo);
    if (isNaN(a) || isNaN(b) || b < a) return 0;
    return Math.round((b - a) / 86400000) + 1;
  }, [dateFrom, dateTo]);

  const dateLabel = useMemo(() => {
    if (days === 7) return "Last 7d";
    if (days === 30) return "Last 30d";
    return `${days}d · MTD`;
  }, [days]);

  function scrollTo(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveSection(id);
  }

  function exportFlash() {
    const txt =
      "D2C Daily Flash — " +
      dateFrom +
      " to " +
      dateTo +
      "\n\nNet sales ₹4.3M (+8% DoD). Repeat rev ₹2.0M (47%). CM2 ₹0.27M. RTO 17.5%. App CR ATH 12.4%.";
    if (navigator.clipboard) {
      navigator.clipboard.writeText(txt).then(() => alert("Flash copied"));
    }
  }

  return (
    <div
      style={{
        background: palette.bg,
        color: palette.text,
        fontFamily: fontSans,
        fontSize: 13,
        minHeight: "100vh",
      }}
    >
      {/* HEADER */}
      <header
        className="px-6 py-3 flex items-center justify-between gap-3 flex-wrap sticky top-0 z-50"
        style={{
          background: palette.surface,
          borderBottom: `1px solid ${palette.border}`,
          boxShadow:
            "0 1px 3px rgba(60,52,40,0.08), 0 1px 2px rgba(60,52,40,0.06)",
        }}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[14px] font-semibold"
            style={{
              background: palette.text,
              color: palette.bg,
              fontFamily: fontMono,
              letterSpacing: "-.5px",
            }}
          >
            D2
          </div>
          <div>
            <div className="text-[14px] font-medium" style={{ color: palette.text }}>
              D2C Sales Dashboard
            </div>
            <div className="text-[11px]" style={{ color: palette.text3 }}>
              Overview · All products · All brands
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <div
            className="flex items-center gap-1.5 rounded-[6px] px-2.5 py-1"
            style={{ background: palette.surface2, border: `1px solid ${palette.border}` }}
          >
            <Calendar size={13} color={palette.text3} />
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-[11px] bg-transparent border-none outline-none cursor-pointer"
              style={{ color: palette.text, fontFamily: fontMono }}
            />
            <span className="text-[11px]" style={{ color: palette.text3 }}>
              →
            </span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-[11px] bg-transparent border-none outline-none cursor-pointer"
              style={{ color: palette.text, fontFamily: fontMono }}
            />
            <span
              className="text-[11px] whitespace-nowrap ml-1"
              style={{ color: palette.text3 }}
            >
              {dateLabel}
            </span>
          </div>
          <button
            onClick={exportFlash}
            className="text-[11px] px-2.5 py-1 rounded-[6px] flex items-center gap-1 transition-colors hover:bg-[#F0EDE6]"
            style={{ border: `1px solid ${palette.borderMd}`, color: palette.text2, background: "transparent" }}
          >
            <Download size={12} /> Export flash
          </button>
          <div
            className="flex gap-0.5 rounded-lg p-0.5"
            style={{ background: palette.surface2 }}
          >
            {["Overview", "SKU wise", "Web CR", "App CR", "Retention"].map((t, i) => {
              const on = i === 0;
              return (
                <button
                  key={t}
                  className="text-[11px] px-3 py-1 rounded-md transition-all"
                  style={{
                    background: on ? palette.surface : "transparent",
                    color: on ? palette.text : palette.text2,
                    fontWeight: on ? 500 : 400,
                    boxShadow: on
                      ? "0 1px 3px rgba(60,52,40,0.08), 0 1px 2px rgba(60,52,40,0.06)"
                      : "none",
                    border: "none",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        <Sidebar active={activeSection} onClick={scrollTo} />

        <main className="flex-1 min-w-0 px-6 py-5 flex flex-col gap-4">
          {/* AI FLASH */}
          <div id="s-flash">
            <AIFlash asOf="Apr 26, 2026 · 10:57 AM" />
          </div>

          {/* RAG */}
          <div id="s-rag">
            <HealthRAG />
          </div>

          {/* BURN EQUATION */}
          <BurnEquation />

          {/* UNIT ECONOMICS */}
          <section id="s-unit" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="amber">Unit economics</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                MRP → Net → CM2
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <Kpi label="MRP Revenue" value="₹180M" subline="▲ +12% MoM" subColor="up" variant="ag" />
              <Kpi label="Net Revenue" value="₹102M" subline="▲ +9% MoM" subColor="up" />
              <Kpi label="Discount %" value="25.8%" subline="▼ −1.2pp · good" subColor="up" variant="ar" dot={palette.amberLight} />
              <Kpi label="CM2" value="₹6M" subline="6.3% · target 10%" subColor="wn" variant="ag" />
              <Kpi label="Avg Selling Price" value="₹365" subline="per unit" />
              <Kpi label="Avg Order Value" value="₹393" subline="per order" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Total Spends" value="₹57M" subline="56.2% · limit 45%" subColor="dn" variant="ar" size="sm" dot={palette.red} />
              <Kpi label="Total Units" value="366K" subline="dispatched" size="sm" />
              <Kpi label="D2C MER" value="1.79×" subline="mktg efficiency" subColor="wn" size="sm" />
              <Kpi label="True CM / order" value="₹41" subline="D2C blended" subColor="up" variant="ag" size="sm" />
            </div>

            <FilterBar gran={gran} seg={seg} onGran={setGran} onSeg={setSeg} />

            <ChartCard
              title={`Net revenue: new vs repeat — ${gran} (${seg})`}
              legend={
                <>
                  <LegendItem color="#534AB7">Repeat rev</LegendItem>
                  <LegendItem color="#85B7EB">New rev</LegendItem>
                  <LegendItem color={palette.green} dashed>CM2 (₹M)</LegendItem>
                  <LegendItem color={palette.red}>Disc %</LegendItem>
                </>
              }
            >
              <NetRevChart gran={gran} seg={seg} />
            </ChartCard>
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* P&L */}
          <section id="s-pnl" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="red">Overall P&L — true waterfall</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                Each row starts where the previous ends
              </span>
            </div>
            <PnLWaterfall />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Gross Margin" value="40.2%" size="sm" />
              <Kpi label="Net of Returns" value="₹70.4M" subColor="up" size="sm" />
              <Kpi label="RTO Loss" value="₹31.6M" subline="17.5% of MRP" subColor="dn" variant="ar" dot={palette.red} size="sm" />
              <Kpi label="CM2 blended" value="₹6M · 6.3%" subColor="up" variant="ag" size="sm" />
            </div>
            <ChartCard
              title={`P&L trend — net rev & spends (bars) · CM2 (line) — ${gran}`}
              legend={
                <>
                  <LegendItem color="#74C69D">Net rev</LegendItem>
                  <LegendItem color="#F4A261">Spends</LegendItem>
                  <LegendItem color={palette.green} dashed>CM2 (₹M)</LegendItem>
                </>
              }
            >
              <PnLTrendChart gran={gran} seg={seg} />
            </ChartCard>
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* ACQUISITION */}
          <section id="s-acq" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="blue">Acquisition</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                CAC · ROAS · Funnel · Payback by channel
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Kpi label="D2C CAC" value="₹462" subline="per new customer" size="sm" />
              <Kpi label="New Customers" value="18.4K" subline="▲ +8% MoM" subColor="up" size="sm" />
              <Kpi label="Meta ROAS" value="2.4×" subline="true ~1.7× post-RTO" subColor="wn" size="sm" />
              <Kpi label="Google ROAS" value="3.1×" subline="search + PMax" subColor="up" size="sm" />
              <Kpi label="Blended MER" value="1.79×" subline="mktg efficiency" subColor="wn" size="sm" />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Card style={{ padding: "12px 14px" }}>
                <div className="text-[11px] mb-1.5 font-medium" style={{ color: palette.text2 }}>
                  Web channel payback
                </div>
                <div
                  className="text-[24px] font-bold"
                  style={{ color: palette.amber, fontFamily: fontMono }}
                >
                  7.2 mo
                </div>
                <div className="text-[11px] mt-1" style={{ color: palette.text3 }}>
                  CAC ₹462 · true CM ₹14/order
                </div>
              </Card>
              <Card style={{ padding: "12px 14px", borderColor: "rgba(26,79,138,.3)" }}>
                <div className="text-[11px] mb-1.5 font-medium" style={{ color: palette.blue }}>
                  App channel payback
                </div>
                <div
                  className="text-[24px] font-bold"
                  style={{ color: palette.green, fontFamily: fontMono }}
                >
                  2.1 mo
                </div>
                <div className="text-[11px] mt-1" style={{ color: palette.text3 }}>
                  CAC ₹462 · true CM ₹62/order
                </div>
              </Card>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Kpi label="Sessions" value="1.24M" subline="100%" size="sm" variant="hi" />
              <Kpi label="PDP views" value="486K" subline="39.2% ↓" subColor="wn" size="sm" variant="hi" />
              <Kpi label="Add to cart" value="162K" subline="33.3% ↓" subColor="wn" size="sm" variant="hi" />
              <Kpi label="Orders" value="41K" subline="25.3% ↓" subColor="wn" size="sm" variant="hi" />
            </div>
            <ChartCard
              title={`CAC & new customers — ${gran}`}
              legend={
                <>
                  <LegendItem color="#74B3E8">New customers (K)</LegendItem>
                  <LegendItem color="#F4A261" dashed>CAC (₹)</LegendItem>
                </>
              }
            >
              <CacNcChart gran={gran} seg={seg} />
            </ChartCard>
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* RETENTION */}
          <section id="s-ret" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="green">Retention</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                LTV · Repeat · Cohort M0–M6 · RFM
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Kpi label="Repeat Rate" value="34.2%" subline="▲ +2.1pp MoM" subColor="up" variant="ag" size="sm" />
              <Kpi label="90-day LTV" value="₹1,750" subline="D2C cohort" subColor="up" size="sm" />
              <Kpi label="Avg Orders / Cust" value="2.1×" subline="rolling 90d" size="sm" />
              <Kpi label="Win-back Rate" value="11.8%" subline="lapsed 90d+" subColor="wn" size="sm" />
              <Kpi label="Visitor→Retained" value="1.04%" subline="cross-domain" subColor="up" size="sm" />
            </div>
            <ChartCard
              title={`Repeat rate & 90d LTV ${gran === "DoD" ? "— WoW (locked)" : "— " + gran}`}
              legend={
                <>
                  <LegendItem color={palette.green}>Repeat rate %</LegendItem>
                  <LegendItem color={palette.teal} dashed>90d LTV (₹)</LegendItem>
                </>
              }
            >
              <RetentionChart gran={gran} seg={seg} />
            </ChartCard>
            <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-2.5">
              <CohortTable />
              <RFMSegments />
            </div>
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* SUPPLY CHAIN */}
          <section id="s-sc" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="amber">Supply chain & ops</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                CPO · Dispatch · TAT · SLA · RTO
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Kpi label="Cost per Order" value="₹84" subline="logistics CPO" size="sm" />
              <Kpi label="Order→Dispatch" value="1.1d" subline="avg processing time" subColor="up" size="sm" />
              <Kpi label="Order→Delivered" value="3.7d" subline="avg total TAT" subColor="up" variant="ag" size="sm" />
              <Kpi label="SLA Breach" value="7.8%" subline="limit 5% · red" subColor="dn" variant="ar" dot={palette.red} size="sm" />
              <Kpi label="RTO Rate" value="17.5%" subline="▼ −1.2pp improving" subColor="up" variant="ar" dot={palette.amberLight} size="sm" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              <ChartCard title={`RTO & CPO — ${gran}`}>
                <RtoCpoChart gran={gran} />
              </ChartCard>
              <ChartCard title="Courier split">
                <CourierDonut />
              </ChartCard>
            </div>
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* WEB & APP */}
          <section id="s-wa" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="blue">Web & app</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                CR · Sessions · Bounce · True CM comparison
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Kpi label="Web CR" value="8.76%" subline="sessions→orders" size="sm" />
              <Kpi label="Web Sessions" value="1.24M" subline="▲ +14%" subColor="up" size="sm" />
              <Kpi label="Bounce Rate" value="48.3%" subline="+3pp · watch" subColor="dn" variant="ar" dot={palette.amberLight} size="sm" />
              <Kpi label="App CR" value="12.4%" subline="▲ all-time high" subColor="up" variant="ab" size="sm" />
              <Kpi label="App Sessions" value="418K" subline="▲ +22%" subColor="up" size="sm" />
            </div>
            <ChartCard
              title={`Web CR vs App CR — ${gran}`}
              legend={
                <>
                  <LegendItem color="#9E9589" dashed>Web CR %</LegendItem>
                  <LegendItem color={palette.blue}>App CR %</LegendItem>
                  <span
                    className="text-[11px] pl-2 ml-1"
                    style={{ color: palette.text2, borderLeft: `1px solid ${palette.border}` }}
                  >
                    True CM: Web ₹14 · App ₹62 (4.4×)
                  </span>
                </>
              }
            >
              <CRChart gran={gran} />
            </ChartCard>
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* SKU */}
          <section id="s-sku" className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <SectionLabel color="purple">Top SKUs</SectionLabel>
              <span className="text-[11px]" style={{ color: palette.text3 }}>
                Revenue · Discount · CM2% · Alert flags
              </span>
            </div>
            <SKUTable />
          </section>

          <div style={{ height: 1, background: palette.border }} />

          {/* RECS */}
          <section id="s-rec" className="flex flex-col gap-2.5 pb-5">
            <SectionLabel color="purple">Recommended actions</SectionLabel>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              <Rec
                icon={<AlertTriangle size={16} />}
                kind="r"
                title="Reduce disc on Sunscreens"
                body="28–32% disc dragging CM2 to 2.8%. Cap at 22% → +₹1.2M CM2. Losing money before RTO is applied."
              />
              <Rec
                icon={<Clock size={16} />}
                kind="a"
                title="Fix SLA breach · courier D"
                body="7.8% breach vs 5% threshold. Shift 15% volume to Delhivery immediately. NPS at risk."
              />
              <Rec
                icon={<CheckCircle2 size={16} />}
                kind="g"
                title="Push App — payback 2.1 mo"
                body="Web payback 7.2mo vs App 2.1mo. +5K installs/mo → +₹240K CM2. Prioritise app install ads."
              />
            </div>
          </section>
        </main>
      </div>

      {/* FOOTER */}
      <footer
        className="px-6 py-3 flex justify-between items-center text-[11px] flex-wrap gap-2"
        style={{
          borderTop: `1px solid ${palette.border}`,
          background: palette.surface,
          color: palette.text3,
          fontFamily: fontMono,
        }}
      >
        <span>D2C Sales Dashboard · Innovist · Apr 2026</span>
        <span>
          {dateFrom} → {dateTo} · {days} days selected
        </span>
        <span>Data: v_orders_table · BigQuery · Refreshed 10:57 AM</span>
      </footer>
    </div>
  );
}
