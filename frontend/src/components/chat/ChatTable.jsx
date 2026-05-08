export function ChatTable({ rows }) {
  if (!rows || rows.length === 0) {
    return <div className="p-4 text-sm text-muted">No data</div>;
  }

  const columns = Object.keys(rows[0]);

  function formatCell(value) {
    if (value == null) return "";
    if (typeof value === "number") {
      return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return String(value);
  }

  return (
    <div className="max-h-[380px] overflow-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="sticky top-0 bg-surface-2 px-3 py-2 text-left font-medium text-muted text-xs uppercase tracking-wider border-b border-border whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-surface-2 transition-colors">
              {columns.map((col) => {
                const value = row[col];
                const isNum = typeof value === "number";
                return (
                  <td
                    key={col}
                    className={`px-3 py-2 border-b border-border ${
                      isNum ? "text-right font-mono text-xs tabular-nums" : ""
                    }`}
                  >
                    {formatCell(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}