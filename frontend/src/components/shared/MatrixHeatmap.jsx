import { cn } from "@/lib/utils";
import { fmt } from "@/lib/utils";

/**
 * Generic heatmap matrix:
 *  rows:     [{ name, cells: [{ colKey, value }], rowAvg }]
 *  columns:  [{ key, label }]
 *  colAvg:   [{ colKey, value }]
 *  toneFn:   (value) => "green"|"amber"|"red"
 *  formatFn: (value) => string
 *
 * Uses the existing Tailwind tone tokens.
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-muted">
              Row ↓ / Col →
            </th>
            {columns.map((c) => (
              <th
                key={c.key}
                className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap"
              >
                {c.label}
              </th>
            ))}
            <th className="px-3 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted">
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
                  <td key={c.key} className="px-2 py-2 text-center">
                    <span
                      className={cn(
                        "inline-block px-2 py-0.5 rounded text-[11px] font-semibold tnum",
                        CELL_TONES[tone] || CELL_TONES.neutral
                      )}
                    >
                      {v == null ? "—" : formatFn(v)}
                    </span>
                  </td>
                );
              })}
              <td className="px-3 py-2 text-center font-semibold tnum">
                {row.rowAvg == null ? "—" : formatFn(row.rowAvg)}
              </td>
            </tr>
          ))}
          {colAvg.length > 0 && (
            <tr className="bg-accent-soft/40">
              <td className="px-3 py-2 font-semibold text-accent">Col avg</td>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 text-center font-semibold tnum text-accent">
                  {avgByCol[c.key] == null ? "—" : formatFn(avgByCol[c.key])}
                </td>
              ))}
              <td className="px-3 py-2" />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
