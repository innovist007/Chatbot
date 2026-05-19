import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { fmt } from "@/lib/utils";

const NEW_COLOR = "#534AB7";
const RET_COLOR = "#1D9E75";

export function VisitorTypeCard({ newPct, returningPct, newCr, returningCr }) {
  const data = [
    { name: "New", value: (newPct || 0) * 100, color: NEW_COLOR, cr: newCr },
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

      <div className="flex rounded overflow-hidden mt-3 h-7 text-[10px] font-semibold text-white">
        <div
          className="flex items-center justify-center px-2"
          style={{ background: NEW_COLOR, width: `${data[0].value}%` }}
          title={`New ${data[0].value.toFixed(1)}%`}
        >
          New · {data[0].value.toFixed(1)}% · CR {fmt.pct(newCr, 2)}
        </div>
        <div
          className="flex items-center justify-center px-2"
          style={{ background: RET_COLOR, width: `${data[1].value}%` }}
          title={`Returning ${data[1].value.toFixed(1)}%`}
        >
          Returning · {data[1].value.toFixed(1)}% · CR {fmt.pct(returningCr, 2)}
        </div>
      </div>
    </div>
  );
}
