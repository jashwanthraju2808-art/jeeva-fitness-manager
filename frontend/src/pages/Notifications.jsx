import { useCallback, useEffect, useState } from "react";
import { getNotifications, retryNotification, deleteNotification } from "../api/notificationApi";
import { useAuth } from "../context/AuthContext";

const TABS    = ["all", "sent", "failed", "skipped"];
const thStyle = { textAlign: "left", padding: "11px 14px", borderBottom: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle = { padding: "10px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 13 };

function statusBadge(status) {
  const map = {
    sent:    { bg: "#dcfce7", color: "#15803d" },
    failed:  { bg: "#fee2e2", color: "#991b1b" },
    skipped: { bg: "#fef3c7", color: "#92400e" },
    pending: { bg: "#e0f2fe", color: "#0369a1" },
  };
  const s = map[status] || { bg: "#f3f4f6", color: "#374151" };
  return (
    <span style={{
      padding: "3px 9px", borderRadius: 20, fontSize: 11,
      fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {status}
    </span>
  );
}

export default function Notifications() {
  const { isAdmin } = useAuth();

  const [tab, setTab]               = useState("all");
  const [notifications, setNotifs]  = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [retryingId, setRetryingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Filters
  const [duoMonth, setDuoMonth]     = useState("");
  const [memberQ, setMemberQ]       = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = {
        limit: 200,
        ...(tab !== "all"  && { status: tab }),
        ...(duoMonth       && { due_month: duoMonth }),
      };
      const r = await getNotifications(params);
      let data = r.data;
      // Client-side member name filter
      if (memberQ.trim()) {
        const q = memberQ.trim().toLowerCase();
        data = data.filter((n) => n.member_name?.toLowerCase().includes(q));
      }
      setNotifs(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [tab, duoMonth, memberQ]);

  useEffect(() => { load(); }, [load]);

  async function handleRetry(id) {
    setRetryingId(id);
    try {
      await retryNotification(id);
      await load();
    } catch (e) {
      alert(e.response?.data?.detail || "Retry failed");
    } finally {
      setRetryingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this notification log entry? This cannot be undone.")) return;
    setDeletingId(id);
    try {
      await deleteNotification(id);
      await load();
    } catch (e) {
      alert(e.response?.data?.detail || "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  // Tab counts
  const counts = {
    all:     notifications.length,
    sent:    notifications.filter((n) => n.status === "sent").length,
    failed:  notifications.filter((n) => n.status === "failed").length,
    skipped: notifications.filter((n) => n.status === "skipped").length,
  };

  function formatDate(iso) {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return iso; }
  }

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1>Notifications</h1>
        <p style={{ color: "#777" }}>Fee reminder history and status.</p>
      </div>

      {/* Filters */}
      <div style={{
        background: "#fff", borderRadius: 12,
        border: "1px solid #e5e7eb", padding: 16,
        marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
      }}>
        <div>
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Month</label>
          <input type="month" value={duoMonth} onChange={(e) => setDuoMonth(e.target.value)} style={{ width: 160 }} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Member name</label>
          <input value={memberQ} onChange={(e) => setMemberQ(e.target.value)} placeholder="Search member…" style={{ width: 200 }} />
        </div>
        <button className="btn btn-outline btn-sm" onClick={() => { setDuoMonth(""); setMemberQ(""); }}>
          ✕ Clear
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: "6px 16px", borderRadius: 20, border: "1px solid",
              cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 700 : 400,
              background: tab === t ? "#1e1b2e" : "#fff",
              color:      tab === t ? "#fff"    : "#555",
              borderColor: tab === t ? "#1e1b2e" : "#d1d5db",
            }}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {" "}
            <span style={{
              marginLeft: 4, fontSize: 11,
              background: "rgba(255,255,255,0.2)",
              padding: "1px 6px", borderRadius: 10,
            }}>
              {counts[t]}
            </span>
          </button>
        ))}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading…</div>
        ) : notifications.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🔔</div>
            No notifications found.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th style={thStyle}>Member</th>
                  <th style={thStyle}>Due Month</th>
                  <th style={thStyle}>Type</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Sent At</th>
                  <th style={thStyle}>Error</th>
                  {isAdmin && <th style={thStyle}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td style={{ ...tdStyle, fontWeight: 600 }}>{n.member_name || `#${n.member_id}`}</td>
                    <td style={tdStyle}>{n.due_month}</td>
                    <td style={{ ...tdStyle, color: "#666" }}>{n.notification_type}</td>
                    <td style={tdStyle}>{statusBadge(n.status)}</td>
                    <td style={{ ...tdStyle, color: "#666", whiteSpace: "nowrap" }}>{formatDate(n.sent_at)}</td>
                    <td style={{ ...tdStyle, color: "#dc2626", fontSize: 12, maxWidth: 260, wordBreak: "break-word" }}>
                      {n.error_message || "—"}
                    </td>
                    {isAdmin && (
                      <td style={tdStyle}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {(n.status === "failed" || n.status === "skipped") && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleRetry(n.id)}
                              disabled={retryingId === n.id}
                            >
                              {retryingId === n.id ? "…" : "↺ Retry"}
                            </button>
                          )}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(n.id)}
                            disabled={deletingId === n.id}
                            title="Delete this log entry"
                          >
                            {deletingId === n.id ? "…" : "🗑"}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
