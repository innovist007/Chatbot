import { createContext, useContext, useState, useEffect } from "react";
import { clearAiSummaryCache } from "./api";
import { registerUser, getUserPermissions } from "./permissionsService";

const AuthContext = createContext(null);

const TOKEN_KEY = "auth_token";
const USER_KEY  = "auth_user";

const SUPER_ADMINS = (import.meta.env.VITE_SUPER_ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null);
  const [token, setToken]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [permissions, setPermissions] = useState(null); // null = still loading

  async function loadPermissions(userData) {
    const email = userData?.email?.toLowerCase();
    if (!email) { setPermissions([]); return; }
    if (SUPER_ADMINS.includes(email)) { setPermissions("all"); return; }
    try {
      const routes = await getUserPermissions(email);
      setPermissions(routes);
    } catch {
      setPermissions([]);
    }
  }

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    const savedUser  = localStorage.getItem(USER_KEY);
    if (savedToken && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        setToken(savedToken);
        setUser(parsed);
        loadPermissions(parsed).finally(() => setLoading(false));
        return;
      } catch {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
      }
    }
    // No saved session — not loading, no permissions
    setPermissions([]);
    setLoading(false);
  }, []);

  async function login(accessToken, userData) {
    localStorage.setItem(TOKEN_KEY, accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
    // Register user in Firestore (creates doc if first login)
    try {
      await registerUser(userData.email, userData.name);
      console.log("✅ Firestore: user registered", userData.email);
    } catch (err) {
      console.error("❌ Firestore registerUser failed:", err);
    }
    await loadPermissions(userData);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    clearAiSummaryCache();
    setToken(null);
    setUser(null);
    setPermissions(null);
  }

  const email    = user?.email?.toLowerCase() || "";
  const isAdmin  = SUPER_ADMINS.includes(email);
  // canAccess(route) → true if admin or route in permitted list
  function canAccess(route) {
    if (isAdmin) return true;
    if (!Array.isArray(permissions)) return false;
    return permissions.includes(route);
  }

  const value = {
    user,
    token,
    loading: loading || permissions === null,
    isAuthenticated: !!token,
    isAdmin,
    permissions,
    canAccess,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY);
}
