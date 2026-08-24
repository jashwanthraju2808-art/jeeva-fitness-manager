import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_BASE = "https://jeeva-fitness-manager.onrender.com";

export default function Login() {
  const [username, setUsername]       = useState("");
  const [password, setPassword]       = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);

  const navigate      = useNavigate();
  const { setUser, setLoading: setAuthLoading } = useAuth();

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append("username", username.trim());
      params.append("password", password);

      const response = await axios.post(
        `${API_BASE}/auth/login`,
        params,
        {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          timeout: 30000,
        }
      );

      const { access_token, username: uname, role } = response.data;

      if (!access_token) throw new Error("No access token returned.");

      localStorage.setItem("token",    access_token);
      localStorage.setItem("username", uname);

      // Hydrate AuthContext immediately â€” avoids the blink/stuck loading screen.
      // setLoading(false) must be called BEFORE navigate() so AuthGuard
      // never enters the loading state when arriving at the dashboard.
      setUser({ id: null, username: uname, role: role || "staff" });
      setAuthLoading(false);

      navigate("/", { replace: true });

    } catch (err) {
      localStorage.removeItem("token");
      localStorage.removeItem("username");

      if (err.response?.status === 401) {
        setError("Incorrect username or password.");
      } else if (err.response?.status === 422) {
        setError("Please enter a valid username and password.");
      } else if (err.code === "ECONNABORTED") {
        setError("Server is taking too long to respond. Please try again.");
      } else {
        setError(
          err.response?.data?.detail ||
          err.message ||
          "Unable to connect to the server."
        );
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-bg">
      <div className="login-card">

        {/* Brand */}
        <div className="login-brand">
          <div className="login-logo-wrap">
            <img
              src="/logo.jpg"
              alt="Jeeva Fitness"
              className="login-logo"
            />
          </div>
          <h1 className="login-title">JEEVA FITNESS</h1>
          <p className="login-subtitle">GYM MANAGEMENT</p>
        </div>

        {error && (
          <div className="login-error">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} autoComplete="on">

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrap">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-eye"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  /* eye-off */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                ) : (
                  /* eye */
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={loading}
          >
            {loading ? "Signing inâ€¦" : "Sign In"}
          </button>

        </form>

        <p className="login-footer">STRENGTH Â· ENDURANCE Â· FITNESS</p>
      </div>
    </div>
  );
}
