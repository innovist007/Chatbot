import { useEffect, useRef, useState } from "react";
import { GoogleLogin } from "@react-oauth/google";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "";
const OTP_LENGTH = 6;

export default function LoginPage() {
  const [step, setStep] = useState("google"); // "google" | "otp"
  const [session, setSession] = useState(null); // { session_id, email, expires_in_minutes }
  const [otp, setOtp] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  const otpInputRef = useRef(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const from = location.state?.from?.pathname;
  const redirectTo = !from || from === "/no-access" ? "/" : from;

  useEffect(() => {
    if (step === "otp") otpInputRef.current?.focus();
  }, [step]);

  async function handleGoogleSuccess(credentialResponse) {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Login failed");

      setSession(data);
      setOtp("");
      setStep("otp");
      setInfo(`We sent a ${OTP_LENGTH}-digit code to ${data.email}.`);
    } catch (err) {
      console.error("Google login error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGoogleError() {
    setError("Google login failed. Please try again.");
  }

  async function handleVerifyOtp(e) {
    e?.preventDefault?.();
    if (otp.length !== OTP_LENGTH) {
      setError(`Please enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/auth/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id, otp }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Invalid code");

      await login(data.access_token, data.user);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      console.error("OTP verify error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!session) return;
    setError(null);
    setInfo(null);
    setResending(true);
    try {
      const response = await fetch(`${API_URL}/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: session.session_id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not resend code");

      setSession(data);
      setOtp("");
      setInfo(`A new code was sent to ${data.email}.`);
      otpInputRef.current?.focus();
    } catch (err) {
      console.error("Resend OTP error:", err);
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  function handleBack() {
    setStep("google");
    setSession(null);
    setOtp("");
    setError(null);
    setInfo(null);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-text mb-2">
            Innovist Analytics
          </h1>
          <p className="text-muted">Sign in to access your dashboard</p>
        </div>

        <div className="bg-card rounded-2xl shadow-lg p-8 border border-border">
          {step === "google" && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-text mb-1">
                  Welcome back
                </h2>
                <p className="text-sm text-muted">
                  Sign in with your @onestolabs.com account
                </p>
              </div>

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

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    ⚠️ {error}
                  </p>
                </div>
              )}

              <div className="text-xs text-muted text-center pt-2 border-t border-border">
                Access restricted to @onestolabs.com employees only
              </div>
            </div>
          )}

          {step === "otp" && (
            <form className="space-y-6" onSubmit={handleVerifyOtp}>
              <div className="text-center">
                <h2 className="text-xl font-semibold text-text mb-1">
                  Verify your email
                </h2>
                <p className="text-sm text-muted">
                  Enter the {OTP_LENGTH}-digit code we sent to
                  <br />
                  <span className="font-medium text-text">{session?.email}</span>
                </p>
              </div>

              <div>
                <input
                  ref={otpInputRef}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))
                  }
                  placeholder={"•".repeat(OTP_LENGTH)}
                  className="w-full text-center text-2xl tracking-[0.5em] font-mono
                             bg-bg border border-border rounded-lg px-4 py-3
                             focus:outline-none focus:ring-2 focus:ring-primary
                             text-text"
                  disabled={loading}
                />
                <p className="text-xs text-muted text-center mt-2">
                  Code expires in {session?.expires_in_minutes ?? 10} minutes.
                </p>
              </div>

              {info && (
                <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg">
                  <p className="text-sm text-blue-700 dark:text-blue-400">
                    {info}
                  </p>
                </div>
              )}

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    ⚠️ {error}
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otp.length !== OTP_LENGTH}
                className="w-full bg-primary text-white font-medium py-2.5 rounded-lg
                           disabled:opacity-50 disabled:cursor-not-allowed
                           hover:opacity-90 transition"
              >
                {loading ? "Verifying..." : "Verify and sign in"}
              </button>

              <div className="flex items-center justify-between text-sm">
                <button
                  type="button"
                  onClick={handleBack}
                  className="text-muted hover:text-text transition"
                  disabled={loading}
                >
                  ← Use a different account
                </button>
                <button
                  type="button"
                  onClick={handleResend}
                  className="text-primary hover:underline disabled:opacity-50"
                  disabled={resending || loading}
                >
                  {resending ? "Sending..." : "Resend code"}
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="text-center mt-6 text-xs text-muted">
          © 2026 Innovist · Powered by Anthropic
        </div>
      </div>
    </div>
  );
}
