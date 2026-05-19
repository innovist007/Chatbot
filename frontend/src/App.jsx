import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { TwoTierNav } from "@/components/TwoTierNav";
import { ChatPanel } from "@/components/ChatPanel";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import WebCrPage from "@/pages/WebCrPage";
import D2COverviewPage from "@/pages/D2COverviewPage";
import AppCRPage from "./pages/AppCRPage";
import LoginPage from "./pages/LoginPage";
import D2CRtoPage from "./pages/D2CRtoPage";
import PromoBasketPage from "./pages/PromoBasketPage";
import RetentionPage from "./pages/RetentionPage";
import SupplyChainPage from "./pages/SupplyChainPage";
import AcquisitionPage from "./pages/AcquisitionPage";
import { todayISO, daysAgoISO } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// Main authenticated app layout
function AuthenticatedApp() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState(null);
  const [chatWidth, setChatWidth] = useState(500);
  const [startDate, setStartDate] = useState(daysAgoISO(30));
  const [endDate, setEndDate] = useState(todayISO());
  const [compareMode, setCompareMode] = useState("MoM");
  const { user, logout } = useAuth();

  function askChat(question) {
    setChatQuery(question);
    setChatOpen(true);
  }

  // function handleDateChange({ start, end }) {
  //   if (start) setStartDate(start);
  //   if (end) setEndDate(end);

  // }
function handleDateChange({ start, end }) {
  const newStart = start || startDate;
  const newEnd = end || endDate;

  if (new Date(newStart) > new Date(newEnd)) {
    if (start) {
      toast.error("Start date cannot be greater than end date");
    } else if (end) {
      toast.error("End date cannot be less than start date");
    }

    return;
  }

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
        user={user}
        onLogout={logout}
      />
      <main
        className="flex-1 transition-[padding-right] duration-300"
        style={{ paddingRight: chatOpen ? chatWidth : 0 }}
      >
        <Routes>
          <Route path="/" element={<Navigate to="/web-cr" replace />} />
          <Route
            path="/web-cr"
            element={
              <WebCrPage
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
                onAskChat={askChat}
              />
            }
          />
          <Route
            path="/d2c-overview"
            element={
              <D2COverviewPage
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
                onAskChat={askChat}
              />
            }
          />
          <Route
            path="/app-cr"
            element={
              <AppCRPage
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
                onAskChat={askChat}
              />
            }
          />
          <Route
            path="/rto"
            element={
              <D2CRtoPage
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
                onAskChat={askChat}
              />
            }
          />
          <Route path="/promo" 
          element={<PromoBasketPage
           onAskChat={askChat} 
           startDate={startDate} 
           endDate={endDate} 
           compareMode={compareMode} />} 
           />

           <Route
    path="/repeat"
  element={
    <RetentionPage
      onAskChat={askChat}
      startDate={startDate}
      endDate={endDate}
      compareMode={compareMode}
    />
  }
/>

          <Route
            path="/supply"
            element={
              <SupplyChainPage
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
                onAskChat={askChat}
              />
            }
          />

          <Route
            path="/acquisition"
            element={
              <AcquisitionPage
                startDate={startDate}
                endDate={endDate}
                compareMode={compareMode}
                onAskChat={askChat}
              />
            }
          />

        </Routes>
      </main>
      {/* <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        initialQuery={chatQuery}
        width={chatWidth}
        onWidthChange={setChatWidth}
      /> */}
      <ChatPanel
  open={chatOpen}
  onClose={() => {
    setChatOpen(false);
    setChatQuery(null);
  }}
  deepLinkQuery={chatQuery}
  width={chatWidth}
  onWidthChange={setChatWidth}
/>
    </div>
  );
}

// Main app with routing
export default function App() {
  return (
    <Routes>
      {/* Public route - login page */}
      <Route path="/login" element={<LoginPage />} />

      {/* All other routes are protected */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AuthenticatedApp />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}