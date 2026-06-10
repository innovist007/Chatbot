import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { fmt } from "@/lib/utils";

const NEW_COLOR = "#534AB7";
const RET_COLOR = "#1D9E75";

export function VisitorTypeCard({ newPct, returningPct, newCr, returningCr }) {
  const data = [
    { name: "New",       value: (newPct       || 0) * 100, color: NEW_COLOR, cr: newCr       },
    { name: "Returning", value: (returningPct || 0) * 100, color: RET_COLOR, cr: returningCr },
  ];

  const total = data[0].value + data[1].value;
  if (total <= 0) {
    return <div className="py-8 text-center text-muted text-sm">No data</div>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            innerRadius={48}
            outerRadius={72}
            paddingAngle={2}
            stroke="#fff"
            strokeWidth={3}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div className="bg-surface border border-border-strong rounded-lg shadow-lifted px-3 py-2 text-xs">
                  <div className="font-medium text-text mb-1">{p.name} visitors</div>
                  <div className="text-muted">Share: <span className="tnum text-text font-semibold">{p.value.toFixed(1)}%</span></div>
                  <div className="text-muted">CR: <span className="tnum text-text font-semibold">{fmt.pct(p.cr, 2)}</span></div>
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Proportional colour bar — no text inside, labels always below */}
      <div className="flex rounded overflow-hidden mt-3 h-3">
        <div style={{ background: NEW_COLOR, width: `${data[0].value}%` }} />
        <div style={{ background: RET_COLOR, width: `${data[1].value}%` }} />
      </div>

      {/* Legend — always fully visible regardless of segment width */}
      <div className="flex gap-3 mt-2">
        {data.map((d) => (
          <div key={d.name} className="flex items-start gap-1.5 min-w-0">
            <span
              className="mt-0.5 w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: d.color }}
            />
            <div className="text-[11px] leading-tight min-w-0">
              <div className="font-semibold text-text">{d.name}</div>
              <div className="text-muted tnum">
                {d.value.toFixed(1)}% · CR {fmt.pct(d.cr, 2)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
