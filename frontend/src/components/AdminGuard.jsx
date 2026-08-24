import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function AdminGuard({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#888" }}>
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== "admin") {
    return (
      <div style={{ padding: 40, maxWidth: 480, margin: "80px auto", textAlign: "center", background: "#fff", borderRadius: 12, border: "1px solid #fee2e2" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
        <h2 style={{ color: "#991b1b", marginBottom: 8 }}>Access Denied</h2>
        <p style={{ color: "#666", marginBottom: 24 }}>
          This page is only accessible to administrators.<br />
          Your current role is <strong>{user.role}</strong>.
        </p>
        <a href="/" style={{ display: "inline-block", padding: "10px 24px", background: "#1e1b2e", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 600 }}>
          ← Back to Dashboard
        </a>
      </div>
    );
  }

  return children;
}
