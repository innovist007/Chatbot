export function RagStrip({ items }) {
  if (!items?.length) return null;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {items.map((it, idx) => (
        <div key={idx} className="bg-surface border border-border rounded-lg px-4 py-3 hover:shadow-hover transition-all">
          <div className="text-[11px] font-medium text-muted mb-2">{it.label}</div>
          <div className="text-[22px] font-bold tnum leading-tight text-text">
            {it.value ?? "—"}
          </div>
          {it.sub && (
            <div className="text-[11px] mt-1 font-medium text-muted">
              {it.sub}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
