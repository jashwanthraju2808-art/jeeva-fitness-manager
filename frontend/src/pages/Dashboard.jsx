import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard } from "../api/dashboardApi";
import { sendBulkReminders, sendSingleReminder } from "../api/notificationApi";
import { openWhatsApp, normalizePhone, msgFeeReminder, msgMembershipExpiring } from "../utils/whatsapp";
import { useAuth } from "../context/AuthContext";

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [data,      setData]      = useState(null);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [loading,   setLoading]   = useState(true);
  const [sending,   setSending]   = useState(false);
  const [sendingId, setSendingId] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError("");
    try { const res = await getDashboard(); setData(res.data); }
    catch { setError("Could not connect to the API. Is the backend running?"); }
    finally { setLoading(false); }
  }

  function buildReminderMsg(member) {
    const month = data?.current_month || new Date().toISOString().slice(0, 7);
    return msgFeeReminder(member, month);
  }

  function handleOpenWA(member) {
    const num = normalizePhone(member.phone_number);
    if (!num) { alert(`No valid phone for ${member.first_name}.`); return; }
    openWhatsApp(member.phone_number, buildReminderMsg(member));
  }

  async function handleSendAllReminders() {
    if (!window.confirm(`Send WhatsApp reminders to all ${data.unpaid_members.length} unpaid members?`)) return;
    setSending(true);
    try {
      const res     = await sendBulkReminders(data.current_month);
      const sent    = res.data.results.filter((r) => r.whatsapp.status === "sent").length;
      const skipped = res.data.results.filter((r) => r.whatsapp.status === "skipped").length;
      const failed  = res.data.results.filter((r) => r.whatsapp.status === "failed").length;
      flash(`Reminders: ${sent} sent, ${skipped} skipped, ${failed} failed.`, "success");
      load();
    } catch { flash("Failed to send reminders.", "error"); }
    finally { setSending(false); }
  }

  async function handleSingleReminder(member) {
    setSendingId(member.id);
    try {
      const res = await sendSingleReminder(member.id);
      const st  = res.data.whatsapp?.status;
      if (st === "sent") flash(`Reminder sent to ${member.first_name}!`, "success");
      else handleOpenWA(member);
    } catch { handleOpenWA(member); }
    finally { setSendingId(null); }
  }

  function handleExpiryWA(member) {
    if (!normalizePhone(member.phone_number)) { alert(`No valid phone for ${member.first_name}.`); return; }
    openWhatsApp(member.phone_number, msgMembershipExpiring(member));
  }

  function flash(msg, type) {
    if (type === "success") { setSuccess(msg); setTimeout(() => setSuccess(""), 5000); }
    else                    { setError(msg);   setTimeout(() => setError(""),   5000); }
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "60vh", flexDirection: "column", gap: 12, color: "var(--text-muted)" }}>
      <span style={{ fontSize: 32, color: "var(--gold)", opacity: 0.7 }}>🏋️</span>
      <span>Loading dashboard…</span>
    </div>
  );
  if (error && !data) return <div className="alert alert-error">{error}</div>;
  if (!data) return null;

  const maxCollected = Math.max(...data.monthly_summary.map((m) => m.collected), 1);

  return (
    <>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: 2 }}>
            {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <button className="btn btn-outline btn-sm" onClick={load}>↺ Refresh</button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* ── Primary stat cards ─────────────────────────── */}
      <div className="stat-grid">
        <div className="stat-card accent" onClick={() => navigate("/members")}
          style={{ cursor: "pointer" }} title="View all members">
          <div className="stat-value">{data.total_active_members}</div>
          <div className="stat-label">Active Members</div>
        </div>
        <div className="stat-card success">
          <div className="stat-value">₹{data.total_collected_this_month.toLocaleString("en-IN")}</div>
          <div className="stat-label">Collected This Month</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">₹{data.total_expected_this_month.toLocaleString("en-IN")}</div>
          <div className="stat-label">Expected This Month</div>
        </div>
        <div className="stat-card danger">
          <div className="stat-value">₹{data.pending_this_month.toLocaleString("en-IN")}</div>
          <div className="stat-label">Pending This Month</div>
        </div>
      </div>

      {/* ── Gym-specific stat cards ─────────────────────── */}
      <div className="stat-grid" style={{ marginBottom: 22 }}>
        <div className="stat-card warning" onClick={() => navigate("/members?status=expiring_soon")}
          style={{ cursor: "pointer" }} title="View expiring memberships">
          <div className="stat-value">{data.expiring_soon_count ?? 0}</div>
          <div className="stat-label">Expiring Soon</div>
        </div>
        <div className="stat-card danger" onClick={() => navigate("/members?status=expired")}
          style={{ cursor: "pointer" }} title="View expired memberships">
          <div className="stat-value">{data.expired_count ?? 0}</div>
          <div className="stat-label">Expired Memberships</div>
        </div>
        <div className="stat-card accent" onClick={() => navigate("/members")}
          style={{ cursor: "pointer" }} title="Members joined this month">
          <div className="stat-value">{data.new_members_this_month ?? 0}</div>
          <div className="stat-label">New This Month</div>
        </div>
        {data.notification_stats && (data.notification_stats.sent + data.notification_stats.skipped + data.notification_stats.failed) > 0 && (
          <div className="stat-card">
            <div className="stat-value">{data.notification_stats.skipped}</div>
            <div className="stat-label">Skipped</div>
          </div>
        )}
      </div>

      {/* ── Two-column grid ────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 22 }}>

        {/* Monthly collections chart */}
        <div className="card">
          <h2 style={{ marginBottom: 18, fontSize: "0.95rem", letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
            Collections — 6 Months
          </h2>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "0 4px" }}>
            {data.monthly_summary.map((m) => {
              const isCurrent = m.month === data.current_month;
              const pct  = maxCollected > 0 ? (m.collected / maxCollected) * 100 : 0;
              const barH = Math.max(pct * 0.88, m.collected > 0 ? 6 : 2);
              const [yr, mo] = m.month.split("-");
              const label = new Date(Number(yr), Number(mo) - 1, 1).toLocaleString("en-IN", { month: "short" });
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", gap: 4 }}>
                  <div style={{ fontSize: "0.62rem", fontWeight: 600, lineHeight: 1.2, textAlign: "center", color: isCurrent ? "var(--gold)" : "var(--text-muted)", minHeight: 24, display: "flex", alignItems: "flex-end", visibility: m.collected > 0 ? "visible" : "hidden" }}>
                    ₹{m.collected >= 1000 ? (m.collected / 1000).toFixed(m.collected % 1000 === 0 ? 0 : 1) + "k" : m.collected.toLocaleString("en-IN")}
                  </div>
                  <div style={{ width: "100%", borderRadius: "4px 4px 0 0", height: `${barH}%`, background: isCurrent ? "var(--gold)" : "var(--sage)", opacity: isCurrent ? 1 : 0.65, transition: "height 0.3s ease", minHeight: 3 }}
                    title={`${label} ${yr}: ₹${m.collected.toLocaleString("en-IN")}`} />
                  <div style={{ fontSize: "0.7rem", fontWeight: isCurrent ? 700 : 400, color: isCurrent ? "var(--gold)" : "var(--text-muted)", marginTop: 4, whiteSpace: "nowrap" }}>{label}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Unpaid members */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
            <h2 style={{ margin: 0, fontSize: "0.95rem", letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--text-muted)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
              Unpaid This Month
              <span className="badge badge-danger" style={{ marginLeft: 8, verticalAlign: "middle" }}>{data.unpaid_members.length}</span>
            </h2>
            {data.unpaid_members.length > 0 && (
              <button className="btn btn-success btn-sm" onClick={handleSendAllReminders} disabled={sending}>
                {sending ? "Sending…" : "📲 Remind All"}
              </button>
            )}
          </div>
          {data.unpaid_members.length === 0 ? (
            <div style={{ color: "var(--success)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: 8 }}>
              {data.total_active_members === 0
                ? <><span style={{ fontSize: 18 }}>ℹ</span> No active members yet.</>
                : <><span style={{ fontSize: 18 }}>✓</span> Everyone has paid this month!</>}
            </div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0, maxHeight: 260, overflowY: "auto" }}>
              {data.unpaid_members.map((m) => (
                <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{m.first_name} {m.last_name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 1 }}>₹{m.fee} pending</div>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => handleSingleReminder(m)} disabled={sendingId === m.id} style={{ flexShrink: 0 }}>
                    {sendingId === m.id ? "…" : "📲"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Expiring memberships section ───────────────── */}
      {data.expiring_members && data.expiring_members.length > 0 && (
        <div className="card" style={{ marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: "0.95rem", letterSpacing: "0.03em", textTransform: "uppercase", color: "var(--warning)", fontFamily: "var(--font-sans)", fontWeight: 600 }}>
              ⚠ Memberships Expiring Soon
              <span className="badge badge-warning" style={{ marginLeft: 8, verticalAlign: "middle" }}>{data.expiring_members.length}</span>
            </h2>
            <button className="btn btn-outline btn-sm" onClick={() => navigate("/members")}>View All →</button>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {data.expiring_members.map((m) => (
              <li key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--border-light)" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem" }}>{m.first_name} {m.last_name || ""}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 1 }}>{m.phone_number} · ₹{m.fee}/mo</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {normalizePhone(m.phone_number) && (
                    <button className="btn btn-warning btn-sm" onClick={() => handleExpiryWA(m)} title="Send expiry reminder">📲</button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Admin quick-link to Audit Logs ─────────────── */}
      {isAdmin && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "var(--gold-pale)", border: "1px solid var(--gold-light)", borderRadius: "var(--radius)", marginBottom: 8 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text)" }}>Audit Logs</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 2 }}>Full activity history is available in the Audit Logs section.</div>
          </div>
          <a href="/audit-logs" className="btn btn-gold btn-sm" style={{ textDecoration: "none" }}>View Logs →</a>
        </div>
      )}
    </>
  );
}
