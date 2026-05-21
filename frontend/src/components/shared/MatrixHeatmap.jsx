import { cn } from "@/lib/utils";
import { fmt } from "@/lib/utils";

/**
 * Generic heatmap matrix:
 *  rows:     [{ name, cells: [{ colKey, value }], rowAvg }]
 *  columns:  [{ key, label }]
 *  colAvg:   [{ colKey, value }]
 *  toneFn:   (value) => "green"|"amber"|"red"
 *  formatFn: (value) => string
 */
const CELL_TONES = {
  green: "bg-success-light text-success",
  amber: "bg-warning-light text-warning",
  red: "bg-danger-light text-danger",
  neutral: "bg-elevated text-text-secondary",
};

function defaultToneFn(pct) {
  if (pct == null) return "neutral";
  if (pct < 0.10) return "green";
  if (pct < 0.15) return "amber";
  return "red";
}

export function MatrixHeatmap({
  rows,
  columns,
  colAvg = [],
  toneFn = defaultToneFn,
  formatFn = (v) => fmt.pct(v),
}) {
  if (!rows?.length || !columns?.length) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }
  const avgByCol = Object.fromEntries((colAvg || []).map((c) => [c.colKey, c.value]));

  return (
    /* Relative wrapper so the fade overlay can be positioned inside */
    <div className="relative">
      <div className="overflow-x-auto">
        {/* min-w-max prevents table cells from collapsing below their content width */}
        <table className="min-w-max w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap">
                Row ↓ / Hr →
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap min-w-[40px]"
                >
                  {c.label}
                </th>
              ))}
              <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted min-w-[48px]">
                Avg
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 font-medium text-text whitespace-nowrap">{row.name}</td>
                {columns.map((c) => {
                  const cell = row.cells.find((x) => x.colKey === c.key);
                  const v = cell?.value;
                  const tone = toneFn(v);
                  return (
                    <td key={c.key} className="px-1 py-1.5 text-center min-w-[40px]">
                      <span
                        className={cn(
                          "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold tnum whitespace-nowrap",
                          CELL_TONES[tone] || CELL_TONES.neutral
                        )}
                      >
                        {v == null ? "—" : formatFn(v)}
                      </span>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-center font-semibold tnum text-[11px]">
                  {row.rowAvg == null ? "—" : formatFn(row.rowAvg)}
                </td>
              </tr>
            ))}
            {colAvg.length > 0 && (
              <tr className="bg-accent-soft/40">
                <td className="px-3 py-2 font-semibold text-accent">Col avg</td>
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-2 text-center font-semibold tnum text-accent text-[10px]">
                    {avgByCol[c.key] == null ? "—" : formatFn(avgByCol[c.key])}
                  </td>
                ))}
                <td className="px-3 py-2" />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Right-edge fade hints there are more columns to scroll */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-bg to-transparent" />
    </div>
  );
}
