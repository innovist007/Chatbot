import { useEffect, useState } from "react";
import { getAllUsers, setUserPermissions, ALL_PAGES } from "@/lib/permissionsService";
import { useAuth } from "@/lib/AuthContext";
import { Navigate } from "react-router-dom";
import { cn } from "@/lib/utils";

// Group pages by tab for display
const TABS = [...new Set(ALL_PAGES.map((p) => p.tab))];

export default function AdminPage() {
  const { isAdmin } = useAuth();
  const [users, setUsers]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState({}); // { email: true/false }
  const [drafts, setDrafts]   = useState({}); // { email: Set(routes) }

  if (!isAdmin) return <Navigate to="/web-cr" replace />;

  useEffect(() => {
    getAllUsers()
      .then((all) => {
        setUsers(all);
        const initial = {};
        all.forEach((u) => {
          initial[u.email] = new Set(u.permitted_routes || []);
        });
        setDrafts(initial);
      })
      .finally(() => setLoading(false));
  }, []);

  function toggle(email, route) {
    setDrafts((prev) => {
      const next = new Set(prev[email] || []);
      next.has(route) ? next.delete(route) : next.add(route);
      return { ...prev, [email]: next };
    });
  }

  function toggleAll(email, routes) {
    setDrafts((prev) => {
      const current = prev[email] || new Set();
      const allOn   = routes.every((r) => current.has(r));
      const next    = new Set(current);
      routes.forEach((r) => (allOn ? next.delete(r) : next.add(r)));
      return { ...prev, [email]: next };
    });
  }

  async function save(email) {
    setSaving((s) => ({ ...s, [email]: true }));
    try {
      await setUserPermissions(email, [...(drafts[email] || [])]);
    } finally {
      setSaving((s) => ({ ...s, [email]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted text-sm">
        Loading users…
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-text">User Access Management</h1>
        <p className="text-sm text-muted mt-1">
          Control which dashboard pages each user can access.
        </p>
      </div>

      {users.length === 0 && (
        <div className="text-sm text-muted">
          No users have logged in yet.
        </div>
      )}

      <div className="flex flex-col gap-4">
        {users.map((u) => {
          const userRoutes = drafts[u.email] || new Set();
          return (
            <div key={u.email} className="bg-surface border border-border rounded-lg p-5">
              {/* User header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm font-semibold text-text">{u.name || u.email}</div>
                  <div className="text-xs text-muted">{u.email}</div>
                </div>
                <button
                  onClick={() => save(u.email)}
                  disabled={saving[u.email]}
                  className={cn(
                    "px-4 py-1.5 text-xs font-medium rounded transition-colors",
                    saving[u.email]
                      ? "bg-elevated text-muted cursor-not-allowed"
                      : "bg-accent hover:bg-accent-hover text-white"
                  )}
                >
                  {saving[u.email] ? "Saving…" : "Save"}
                </button>
              </div>

              {/* Pages grouped by tab */}
              {TABS.map((tab) => {
                const tabPages = ALL_PAGES.filter((p) => p.tab === tab);
                const tabRoutes = tabPages.map((p) => p.route);
                const allOn = tabRoutes.every((r) => userRoutes.has(r));
                return (
                  <div key={tab} className="mb-3 last:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                        {tab}
                      </span>
                      <button
                        onClick={() => toggleAll(u.email, tabRoutes)}
                        className="text-[11px] text-accent hover:underline"
                      >
                        {allOn ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tabPages.map(({ route, label }) => {
                        const on = userRoutes.has(route);
                        return (
                          <button
                            key={route}
                            onClick={() => toggle(u.email, route)}
                            className={cn(
                              "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                              on
                                ? "bg-accent text-white border-accent"
                                : "bg-surface text-muted border-border hover:border-accent hover:text-accent"
                            )}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
