import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AuthGuard({ children }) {
  const { user, loading } = useAuth();

  // Hard timeout — if loading hasn't resolved in 8 seconds, stop waiting.
  // This covers Render cold-start delays and network failures.
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!loading) return; // already resolved, no timer needed
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [loading]);

  // No token at all — go to login immediately without showing loading spinner
  if (!loading && !user) {
    return <Navigate to="/login" replace />;
  }

  // Still loading but timed out — treat as unauthenticated
  if (timedOut && !user) {
    return <Navigate to="/login" replace />;
  }

  // Waiting for /auth/me to respond (only shown when a token exists)
  if (loading && !timedOut) {
    return (
      <div style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "#888",
        gap: 12,
      }}>
        <div style={{ fontSize: 32 }}>🏋️</div>
        <div>Loading Jeeva Fitness…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
