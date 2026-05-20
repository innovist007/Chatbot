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
import AdminPage from "./pages/AdminPage";
import { todayISO, daysAgoISO } from "@/lib/utils";
import { useAuth } from "@/lib/AuthContext";
import { toast } from "sonner";

// Blocks direct URL access if user doesn't have permission for this route
function PageRoute({ route, children }) {
  const { canAccess, loading, permissions } = useAuth();
  if (loading) return null;
  if (!canAccess(route)) {
    // If user has any permitted routes, redirect to their first one
    const first = Array.isArray(permissions) && permissions[0];
    return <Navigate to={first || "/no-access"} replace />;
  }
  return children;
}

function NoAccessPage() {
  const { logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <div className="text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-semibold text-text mb-2">No access yet</h1>
        <p className="text-sm text-muted mb-6">
          Your account is pending approval. Contact your admin to get access.
        </p>
        <button
          onClick={logout}
          className="px-4 py-2 text-sm bg-accent text-white rounded hover:bg-accent-hover transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

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

  function handleDateChange({ start, end }) {
    const newStart = start || startDate;
    const newEnd = end || endDate;
    if (new Date(newStart) > new Date(newEnd)) {
      if (start) toast.error("Start date cannot be greater than end date");
      else if (end) toast.error("End date cannot be less than start date");
      return;
    }
    if (start) setStartDate(start);
    if (end) setEndDate(end);
  }

  const pageProps = { startDate, endDate, compareMode, onAskChat: askChat };

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
          <Route path="/" element={<Navigate to="/d2c-overview" replace />} />
          <Route path="/no-access" element={<NoAccessPage />} />

          <Route path="/d2c-overview" element={<PageRoute route="/d2c-overview"><D2COverviewPage {...pageProps} /></PageRoute>} />
          <Route path="/web-cr"       element={<PageRoute route="/web-cr"><WebCrPage {...pageProps} /></PageRoute>} />
          <Route path="/app-cr"       element={<PageRoute route="/app-cr"><AppCRPage {...pageProps} /></PageRoute>} />
          <Route path="/rto"          element={<PageRoute route="/rto"><D2CRtoPage {...pageProps} /></PageRoute>} />
          <Route path="/repeat"       element={<PageRoute route="/repeat"><RetentionPage {...pageProps} /></PageRoute>} />
          <Route path="/promo"        element={<PageRoute route="/promo"><PromoBasketPage {...pageProps} /></PageRoute>} />
          <Route path="/supply"       element={<PageRoute route="/supply"><SupplyChainPage {...pageProps} /></PageRoute>} />
          <Route path="/acquisition"  element={<PageRoute route="/acquisition"><AcquisitionPage {...pageProps} /></PageRoute>} />

          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <ChatPanel
        open={chatOpen}
        onClose={() => { setChatOpen(false); setChatQuery(null); }}
        deepLinkQuery={chatQuery}
        width={chatWidth}
        onWidthChange={setChatWidth}
      />
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
