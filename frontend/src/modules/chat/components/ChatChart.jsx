import { useEffect, useRef } from "react";
import vegaEmbed from "vega-embed";

export function ChatChart({ spec }) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!spec || !containerRef.current) return;

    // Theme the chart for our app
    const themed = JSON.parse(JSON.stringify(spec));
    themed.background = "transparent";
    themed.config = themed.config || {};
    
    const overrides = {
      axis: {
        labelColor: "#525252",
        titleColor: "#171717",
        domainColor: "#d4d4d4",
        gridColor: "#e5e5e5",
        tickColor: "#d4d4d4",
      },
      legend: {
        labelColor: "#525252",
        titleColor: "#171717",
      },
      title: { color: "#171717" },
      view: { stroke: "transparent" },
    };
    
    for (const key of Object.keys(overrides)) {
      themed.config[key] = { ...themed.config[key], ...overrides[key] };
    }

    vegaEmbed(containerRef.current, themed, {
      actions: false,
      renderer: "svg",
    }).catch((err) => {
      console.error("Chart render error:", err);
      if (containerRef.current) {
        containerRef.current.innerHTML = `
          <div style="padding:14px;color:#ef4444;font-size:13px;">
            Couldn't render chart: ${err.message || err}
          </div>
        `;
      }
    });
  }, [spec]);

  return <div ref={containerRef} className="w-full p-4" />;
}