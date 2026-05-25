import { cn } from "@/lib/utils";

export function DataTable({ columns, rows, getRowKey, className, maxHeight }) {
  if (!rows || rows.length === 0) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }
  const scrollY = maxHeight != null;
  return (
    <div
      className={cn("overflow-x-auto", scrollY && "overflow-y-auto", className)}
      style={scrollY ? { maxHeight } : undefined}
    >
      <table className="w-full text-sm">
        <thead className={cn(scrollY && "sticky top-0 z-10")}>
          <tr className="bg-sc-gray-100 border-b border-sc-gray-200">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-sc-gray-600 whitespace-nowrap bg-sc-gray-100",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  (!c.align || c.align === "left") && "text-left"
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
              className="border-b border-sc-gray-100 last:border-b-0 hover:bg-sc-gray-50 transition-colors"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2.5 text-[11px] text-sc-gray-900",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.mono && "font-mono tnum"
                  )}
                >
                  {c.render ? c.render(row, i) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}