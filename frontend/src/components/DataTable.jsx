import { cn } from "@/lib/utils";

export function DataTable({ columns, rows, getRowKey, className }) {
  if (!rows || rows.length === 0) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted whitespace-nowrap",
                  c.align === "right" ? "text-right" : "text-left"
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={getRowKey ? getRowKey(row, i) : i}
              className="border-b border-border last:border-b-0 hover:bg-elevated/50 transition-colors"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-3",
                    c.align === "right" && "text-right",
                    c.mono && "font-mono tnum text-text"
                  )}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}