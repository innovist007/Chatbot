import { useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

export default function LoginPage() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  // Where to redirect after login (default: home)
  const from = location.state?.from?.pathname || "/";

  async function handleGoogleSuccess(credentialResponse) {
    setError(null);
    setLoading(true);

    try {
      const API_URL = import.meta.env.VITE_API_URL || "";
      const response = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          credential: credentialResponse.credential,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Login failed");
      }

      // Save token and user to context + localStorage
      login(data.access_token, data.user);

      // Redirect to original destination
      navigate(from, { replace: true });
    } catch (err) {
      console.error("Login error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleError() {
    setError("Google login failed. Please try again.");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text mb-2">
            Innovist Analytics
          </h1>
          <p className="text-muted">Sign in to access your dashboard</p>
        </div>

        {/* Login Card */}
        <div className="bg-card rounded-2xl shadow-lg p-8 border border-border">
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-text mb-1">
                Welcome back
              </h2>
              <p className="text-sm text-muted">
                Sign in with your @onestolabs.com account
              </p>
            </div>

            {/* Google Login Button */}
            <div className="flex justify-center">
              {loading ? (
                <div className="text-sm text-muted py-3">Signing you in...</div>
              ) : (
                <GoogleLogin
                  onSuccess={handleGoogleSuccess}
                  onError={handleGoogleError}
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                  width="320"
                />
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400">
                  ⚠️ {error}
                </p>
              </div>
            )}

            {/* Info */}
            <div className="text-xs text-muted text-center pt-2 border-t border-border">
              Access restricted to @onestolabs.com employees only
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-muted">
          © 2026 Innovist · Powered by Anthropic
        </div>
      </div>
    </div>
  );
}