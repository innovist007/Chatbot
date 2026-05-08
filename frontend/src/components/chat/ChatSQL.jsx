import { useEffect, useRef, useState } from "react";
import hljs from "highlight.js/lib/core";
import sql from "highlight.js/lib/languages/sql";
import "highlight.js/styles/atom-one-light.css";

hljs.registerLanguage("sql", sql);

export function ChatSQL({ sql: sqlCode }) {
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      hljs.highlightElement(codeRef.current);
    }
  }, [sqlCode]);

  function handleCopy(e) {
    e.stopPropagation();
    navigator.clipboard.writeText(sqlCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <pre className="m-0 p-4 bg-surface-2 font-mono text-xs leading-relaxed overflow-x-auto relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs bg-surface border border-border rounded hover:bg-surface-3"
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
      <code ref={codeRef} className="language-sql">
        {sqlCode}
      </code>
    </pre>
  );
}