// import { ArrowUp, ArrowDown, Info,Sparkles  } from "lucide-react";
// import { Card } from "./ui/Card";
// import { fmt, cn } from "@/lib/utils";
// import { useState } from "react";

// export function KpiCard({ label, value, delta, compareLabel = "MoM", insight, onAsk }) {
//   const [showInsight, setShowInsight] = useState(false);
  
//   const direction = delta == null ? "flat" : delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";
//   const tone = direction === "up" ? "success" : direction === "down" ? "danger" : "muted";
//   const Icon = direction === "up" ? ArrowUp : ArrowDown;

//   return (
//     <div 
//       className="relative"
//       onMouseEnter={() => setShowInsight(true)}
//       onMouseLeave={() => setShowInsight(false)}
//     >
//       <Card className="px-4 py-3 transition-all hover:shadow-hover hover:border-accent/30">
//         <div className="flex items-start justify-between">
//           <div className="flex-1">
//             <div className="text-xs text-muted mb-1">{label}</div>
//             <div className="text-2xl font-bold tnum text-text">{value}</div>
//             {delta != null && (
//               <div className="mt-1 flex items-center gap-1 text-xs">
//                 <span
//                   className={cn(
//                     "inline-flex items-center gap-0.5 font-semibold",
//                     tone === "success" && "text-success",
//                     tone === "danger" && "text-danger",
//                     tone === "muted" && "text-muted"
//                   )}
//                 >
//                   {direction !== "flat" && <Icon className="w-3 h-3" />}
//                   {fmt.delta(delta)}
//                 </span>
//                 <span className="text-muted">{compareLabel}</span>
//               </div>
//             )}
//           </div>
//           {insight && (
//             <Info className="w-3.5 h-3.5 text-muted opacity-40 group-hover:opacity-100 transition-opacity" />
//           )}
//               {/* Ask AI Button */}
//       {onAsk && (
//         <button
//           onClick={onAsk}
//           className={cn(
//             "absolute top-3 right-3 p-1.5 rounded-md",
//             "opacity-0 group-hover:opacity-100",
//             "bg-blue-50 hover:bg-blue-100",
//             "dark:bg-blue-950/30 dark:hover:bg-blue-950/50",
//             "border border-blue-200 dark:border-blue-900",
//             "transition-all"
//           )}
//           title="Ask AI about this metric"
//         >
//           <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
//         </button>
//       )}
//         </div>

//       </Card>

//       {/* Hover insight tooltip - positioned on RIGHT side */}
//       {insight && showInsight && (
//         <div className="absolute left-full top-0 ml-3 z-50 w-64 animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-none">
//           <div className="bg-surface border border-border-strong rounded-lg shadow-lifted p-3 text-xs text-text-secondary leading-relaxed">
//             <div className="flex items-start gap-2">
//               <div className={cn(
//                 "w-1 h-1 rounded-full mt-1.5 flex-shrink-0",
//                 tone === "success" && "bg-success",
//                 tone === "danger" && "bg-danger",
//                 tone === "muted" && "bg-muted"
//               )} />
//               <div>{insight}</div>
//             </div>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }






import { ArrowUp, ArrowDown, Info, Sparkles } from "lucide-react";
import { Card } from "./ui/Card";
import { fmt, cn } from "@/lib/utils";
import { useState } from "react";

export function KpiCard({ label, value, delta, compareLabel = "MoM", insight, onAsk }) {
  const [showInsight, setShowInsight] = useState(false);
  
  const direction = delta == null ? "flat" : delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";
  const tone = direction === "up" ? "success" : direction === "down" ? "danger" : "muted";
  const Icon = direction === "up" ? ArrowUp : ArrowDown;

  return (
    <div 
      className="relative group"
      onMouseEnter={() => setShowInsight(true)}
      onMouseLeave={() => setShowInsight(false)}
    >
      <Card className="px-4 py-3 pb-16 transition-all hover:shadow-hover hover:border-accent/30">
        {/* Ask AI Button - Top right */}
        {onAsk && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAsk();
            }}
            className={cn(
              "absolute top-2 right-2 p-1.5 rounded-md z-10",
              "opacity-0 group-hover:opacity-100",
              "bg-blue-50 hover:bg-blue-100",
              "dark:bg-blue-950/30 dark:hover:bg-blue-950/50",
              "border border-blue-200 dark:border-blue-900",
              "transition-all"
            )}
            title="Ask AI about this metric"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </button>
        )}
        
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="text-xs text-muted mb-1">{label}</div>
            <div className="text-2xl font-bold tnum text-text">{value}</div>
            {delta != null && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 font-semibold",
                    tone === "success" && "text-success",
                    tone === "danger" && "text-danger",
                    tone === "muted" && "text-muted"
                  )}
                >
                  {direction !== "flat" && <Icon className="w-3 h-3" />}
                  {fmt.delta(delta)}
                </span>
                <span className="text-muted">{compareLabel}</span>
              </div>
            )}
          </div>
          {insight && !onAsk && (
            <Info className="w-3.5 h-3.5 text-muted opacity-40 group-hover:opacity-100 transition-opacity" />
          )}
        </div>
      </Card>

      {/* Hover insight tooltip - positioned on RIGHT side */}
      {/* {insight && showInsight && (
        <div className="absolute left-full top-0 ml-3 z-50 w-64 animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-none">
          <div className="bg-surface border border-border-strong rounded-lg shadow-lifted p-3 text-xs text-text-secondary leading-relaxed">
            <div className="flex items-start gap-2">
              <div className={cn(
                "w-1 h-1 rounded-full mt-1.5 flex-shrink-0",
                tone === "success" && "bg-success",
                tone === "danger" && "bg-danger",
                tone === "muted" && "bg-muted"
              )} />
              <div>{insight}</div>
            </div>
          </div>
        </div>
      )} */}
      {/* Hover insight inside card */}
{insight && (
  <div
    className={cn(
      "absolute bottom-3 right-3 left-3",
      "transition-all duration-200",
      showInsight
        ? "opacity-100 translate-y-0"
        : "opacity-0 translate-y-2 pointer-events-none"
    )}
  >
    <div className="flex justify-end">
      <div
        className={cn(
          "max-w-[85%] text-[11px] leading-relaxed px-2.5 py-2 rounded-lg border shadow-sm",
          "bg-surface/95 backdrop-blur",
          "text-text-secondary border-border"
        )}
      >
        {insight}
      </div>
    </div>
  </div>
)}
    </div>
  );
}