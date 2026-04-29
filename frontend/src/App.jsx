import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { TwoTierNav } from "@/components/TwoTierNav";
import { ChatPanel } from "@/components/ChatPanel";
import WebCrPage from "@/pages/WebCrPage";
import { todayISO, daysAgoISO } from "@/lib/utils";

export default function App() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState(null);
  const [chatWidth, setChatWidth] = useState(500); // Adjustable width
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [compareMode, setCompareMode] = useState("MoM");

  function askChat(question) {
    setChatQuery(question);
    setChatOpen(true);
  }

  function handleDateChange({ start, end }) {
    if (start) setStartDate(start);
    if (end) setEndDate(end);
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TwoTierNav
        startDate={startDate}
        endDate={endDate}
        onDateChange={handleDateChange}
        compareMode={compareMode}
        onCompareModeChange={setCompareMode}
        onAskBot={() => setChatOpen(true)}
      />

      <main
        className="flex-1 transition-[padding-right] duration-300"
        style={{
          paddingRight: chatOpen && window.innerWidth >= 1280 ? chatWidth : 0,
        }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/web-cr" replace />} />
          <Route 
            path="/web-cr" 
            element={
              <WebCrPage 
                onAskChat={askChat}
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
              />
            } 
          />
          <Route
            path="*"
            element={
              <div className="p-12 text-center text-muted">Page not found.</div>
            }
          />
        </Routes>
      </main>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        deepLinkQuery={chatQuery}
        width={chatWidth}
        onWidthChange={setChatWidth}
      />
    </div>
  );
}