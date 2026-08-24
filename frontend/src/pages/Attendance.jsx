import { useEffect, useState, useCallback } from "react";
import { getMembers, getInactiveMembers, toggleMemberStatus } from "../api/memberApi";
import { getBatches } from "../api/studioApi";
import { getAttendance, markAttendance, getAttendanceReport } from "../api/attendanceApi";
import { openWhatsApp, normalizePhone, msgAbsent } from "../utils/whatsapp";

const today      = new Date();
const THIS_MONTH = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
const todayStr   = today.toISOString().slice(0, 10);

/* ── A→Z sort ───────────────────────────────────────────── */
function sortMembers(list) {
  return [...list].sort((a, b) => {
    const fn = (a.first_name || "").localeCompare(b.first_name || "", "en", { sensitivity: "base" });
    if (fn !== 0) return fn;
    return (a.last_name || "").localeCompare(b.last_name || "", "en", { sensitivity: "base" });
  });
}

/* ── Group by batch, No Batch last ──────────────────────── */
function groupByBatch(members, batches) {
  const batchMap = {};
  batches.forEach((b) => { batchMap[b.id] = b; });
  const groups = {};
  members.forEach((m) => {
    const key = m.batch_id ?? "none";
    if (!groups[key]) {
      const b = m.batch_id ? batchMap[m.batch_id] : null;
      groups[key] = { key, label: b ? b.name : "No Batch Assigned", startTime: b ? b.start_time : "99:99", members: [] };
    }
    groups[key].members.push(m);
  });
  return Object.values(groups)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((g) => ({ ...g, members: sortMembers(g.members) }));
}

export default function Attendance() {
  const [activeMembers, setActiveMembers]     = useState([]);
  const [inactiveMembers, setInactiveMembers] = useState([]);
  const [batches,         setBatches]         = useState([]);
  const [month,         setMonth]           = useState(THIS_MONTH);
  const [selDate,       setSelDate]         = useState(todayStr);
  const [attendance,    setAttendance]      = useState([]);
  const [report,        setReport]          = useState([]);
  const [tab,           setTab]             = useState("daily"); // "daily" | "report" | "manage"
  const [loading,       setLoading]         = useState(true);
  const [error,         setError]           = useState("");
  const [success,       setSuccess]         = useState("");
  const [togglingId,    setTogglingId]      = useState(null);

  const loadMembers = useCallback(async () => {
    try {
      const [mRes, iRes, bRes] = await Promise.all([
        getMembers(), getInactiveMembers(), getBatches(),
      ]);
      setActiveMembers(mRes.data);
      setInactiveMembers(iRes.data);
      setBatches(bRes.data);
    } catch { /* non-fatal */ }
  }, []);

  /* ── Load ALL members (active + inactive) for manage tab ─ */
  const loadAllMembers = useCallback(async () => {
    try {
      const [mRes, iRes] = await Promise.all([getMembers(), getInactiveMembers()]);
      setActiveMembers(mRes.data);
      setInactiveMembers(iRes.data);
    } catch { /* non-fatal */ }
  }, []);

  const loadAttendance = useCallback(async (date) => {
    setLoading(true);
    setError("");
    try {
      const res = await getAttendance({ att_date: date });
      setAttendance(res.data);
    } catch {
      setError("Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async (m) => {
    setLoading(true);
    try {
      const res = await getAttendanceReport(m);
      setReport(res.data);
    } catch {
      setError("Could not load report.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  useEffect(() => {
    if (tab === "daily")   loadAttendance(selDate);
    else if (tab === "report") loadReport(month);
    else if (tab === "manage") loadAllMembers();
  }, [tab, selDate, month, loadAttendance, loadReport, loadAllMembers]);

  /* ── Attendance lookup map ──────────────────────────────── */
  const attMap = Object.fromEntries(attendance.map((a) => [a.member_id, a]));

  /* ── Global summary ─────────────────────────────────────── */
  // Only count attendance records that belong to currently active members.
  // Records from discontinued/inactive members must not affect these counts.
  const activeMemberIds = new Set(activeMembers.map((m) => m.id));
  const activeAttendance = attendance.filter((a) => activeMemberIds.has(a.member_id));
  const presentCount  = activeAttendance.filter((a) =>  a.present).length;
  const absentCount   = activeAttendance.filter((a) => !a.present).length;
  const markedIds     = new Set(activeAttendance.map((a) => a.member_id));
  const unmarkedCount = Math.max(0, activeMembers.length - markedIds.size);

  /* ── Attendance actions ─────────────────────────────────── */
  async function toggle(member, presentVal) {
    try {
      await markAttendance({ member_id: member.id, att_date: selDate, present: presentVal });
      flash(`${member.first_name} marked as ${presentVal ? "present" : "absent"}.`, "success");
      loadAttendance(selDate);
    } catch (err) {
      flash(err.response?.data?.detail || "Could not save attendance.", "error");
    }
  }

  async function markAllPresent() {
    const unmarked = activeMembers.filter((m) => !attMap[m.id]);
    await Promise.all(
      unmarked.map((m) => markAttendance({ member_id: m.id, att_date: selDate, present: true }))
    );
    flash("All unmarked members marked as present.", "success");
    loadAttendance(selDate);
  }

  /* ── Discontinue / Continue toggle ─────────────────────── */
  async function handleToggleStatus(member) {
    const action = member.is_active ? "Discontinue" : "Continue";
    const name   = `${member.first_name} ${member.last_name || ""}`.trim();
    if (!window.confirm(
      `${action} member "${name}"?\n\n` +
      (member.is_active
        ? "They will be removed from active attendance. Historical records are preserved."
        : "They will appear again in active attendance and member lists.")
    )) return;

    setTogglingId(member.id);
    try {
      const res = await toggleMemberStatus(member.id);
      flash(res.data.message, "success");
      // Reload active list — discontinued member will disappear, re-activated will appear
      loadMembers();
    } catch (err) {
      flash(err.response?.data?.detail || "Could not update status.", "error");
    } finally {
      setTogglingId(null);
    }
  }

  function flash(msg, type) {
    if (type === "success") { setSuccess(msg); setTimeout(() => setSuccess(""), 3000); }
    else                    { setError(msg);   setTimeout(() => setError(""),   3000); }
  }

  const groups = groupByBatch(activeMembers, batches);

  /* ─────────────────────────────────────────────────────────
     RENDER
     ───────────────────────────────────────────────────────── */
  return (
    <>
      <div className="page-header">
        <h1>Attendance</h1>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`btn ${tab === "daily"   ? "btn-primary" : "btn-outline"} btn-sm`}
            onClick={() => setTab("daily")}
          >
            Daily
          </button>
          <button
            className={`btn ${tab === "report"  ? "btn-primary" : "btn-outline"} btn-sm`}
            onClick={() => setTab("report")}
          >
            Monthly Report
          </button>
          <button
            className={`btn ${tab === "manage"  ? "btn-primary" : "btn-outline"} btn-sm`}
            onClick={() => setTab("manage")}
            title="Continue or discontinue members"
          >
            Continued / Discontinued
          </button>
        </div>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* ══ DAILY VIEW ══════════════════════════════════════ */}
      {tab === "daily" && (
        <>
          <div className="card" style={{ padding: "14px 18px", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Date:</label>
              <input
                type="date"
                value={selDate}
                onChange={(e) => setSelDate(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: "0.88rem" }}
              />
              <button className="btn btn-outline btn-sm" onClick={markAllPresent}>
                ✅ Mark All Present
              </button>
              <span style={{ marginLeft: "auto", fontSize: "0.85rem", color: "#888" }}>
                <span style={{ color: "var(--success)", fontWeight: 600 }}>{presentCount} present</span>
                {" · "}
                <span style={{ color: "var(--danger)", fontWeight: 600 }}>{absentCount} absent</span>
                {" · "}
                {unmarkedCount} unmarked
              </span>
            </div>
          </div>

          {loading ? (
            <div className="loading">Loading…</div>
          ) : activeMembers.length === 0 ? (
            <div className="card"><div className="empty">No active (continued) members.</div></div>
          ) : (
            groups.map((g) => {
              const batchPresent  = g.members.filter((m) =>  attMap[m.id]?.present === true).length;
              const batchAbsent   = g.members.filter((m) =>  attMap[m.id]?.present === false).length;
              const batchUnmarked = g.members.filter((m) => !attMap[m.id]).length;

              return (
                <div key={g.key} className="card" style={{ padding: 0, marginBottom: 18, overflow: "hidden" }}>
                  <div style={{
                    padding: "10px 18px", background: "var(--cream-deep, #f2ede4)",
                    borderBottom: "1px solid var(--border, #e8e4dc)",
                    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                  }}>
                    <span style={{ fontWeight: 700, fontSize: "0.93rem" }}>{g.label}</span>
                    <span style={{ fontSize: "0.75rem", color: "#888" }}>
                      {g.members.length} member{g.members.length !== 1 ? "s" : ""}
                      {" · "}
                      <span style={{ color: "var(--success, #3a7d44)" }}>{batchPresent}✓</span>
                      {batchAbsent   > 0 && <span style={{ color: "var(--danger, #b84040)" }}> {batchAbsent}✗</span>}
                      {batchUnmarked > 0 && <span> {batchUnmarked} unmarked</span>}
                    </span>
                  </div>
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 40 }}>#</th>
                          <th>Member</th>
                          <th>Phone</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.members.map((m, idx) => {
                          const rec = attMap[m.id];
                          return (
                            <tr key={m.id}>
                              <td style={{ color: "#aaa" }}>{idx + 1}</td>
                              <td>{m.first_name} {m.last_name || ""}</td>
                              <td style={{ color: "#888" }}>{m.phone_number}</td>
                              <td>
                                {!rec
                                  ? <span className="badge badge-info">Unmarked</span>
                                  : rec.present
                                    ? <span className="badge badge-success">Present</span>
                                    : <span className="badge badge-danger">Absent</span>}
                              </td>
                              <td style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                <button className="btn btn-success btn-sm" onClick={() => toggle(m, true)}>✓ Present</button>
                                <button className="btn btn-danger btn-sm"  onClick={() => toggle(m, false)}>✗ Absent</button>
                                {rec && !rec.present && normalizePhone(m.phone_number) && (
                                  <button
                                    className="btn btn-outline btn-sm"
                                    onClick={() => openWhatsApp(m.phone_number, msgAbsent(m, selDate))}
                                    title="Send absent notification via WhatsApp"
                                  >📱</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}
        </>
      )}

      {/* ══ MONTHLY REPORT ══════════════════════════════════ */}
      {tab === "report" && (
        <div className="card">
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 20 }}>
            <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Month:</label>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #d1d5db", fontSize: "0.88rem" }}
            />
          </div>
          {loading ? (
            <div className="loading">Loading report…</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Present</th>
                    <th>Absent</th>
                    <th>Total Marked</th>
                    <th>Attendance %</th>
                  </tr>
                </thead>
                <tbody>
                  {report.length === 0 ? (
                    <tr><td colSpan="5" className="empty">No attendance data for this month.</td></tr>
                  ) : report.map((r) => {
                    const pct = r.total_days > 0 ? Math.round((r.present_days / r.total_days) * 100) : 0;
                    return (
                      <tr key={r.member_id}>
                        <td>{r.member_name}</td>
                        <td><span className="badge badge-success">{r.present_days}</span></td>
                        <td><span className="badge badge-danger">{r.absent_days}</span></td>
                        <td>{r.total_days}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 8, background: "#f0f0f0", borderRadius: 4, overflow: "hidden", maxWidth: 120 }}>
                              <div style={{
                                width: `${pct}%`, height: "100%", borderRadius: 4,
                                background: pct >= 75 ? "#16a34a" : pct >= 50 ? "#d97706" : "#dc2626",
                              }} />
                            </div>
                            <span style={{ fontSize: "0.82rem" }}>{pct}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ CONTINUED / DISCONTINUED MANAGEMENT ════════════ */}
      {tab === "manage" && (
        <>
          <div style={{ marginBottom: 14, padding: "10px 16px", background: "var(--gold-pale, #fdf6e3)", borderRadius: 8, border: "1px solid var(--gold-light, #f5e8c8)", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text)" }}>Continued</strong> members appear in daily attendance and active counts.
            {" "}
            <strong style={{ color: "var(--text)" }}>Discontinued</strong> members are hidden from attendance and dashboard but all historical records are preserved.
          </div>

          {/* ── Active / Continued members ───────────────── */}
          <div className="card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
            <div style={{
              padding: "10px 18px", background: "var(--success-bg, #eaf5ec)",
              borderBottom: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <span style={{ fontWeight: 700, fontSize: "0.93rem", color: "var(--success)" }}>
                ✓ Continued Members
              </span>
              <span className="badge badge-success" style={{ fontSize: "0.72rem" }}>
                {activeMembers.length}
              </span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Member</th>
                    <th>Phone</th>
                    <th>Batch</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeMembers.length === 0 ? (
                    <tr><td colSpan="5" className="empty">No continued members.</td></tr>
                  ) : sortMembers(activeMembers).map((m, idx) => (
                    <tr key={m.id}>
                      <td style={{ color: "#aaa" }}>{idx + 1}</td>
                      <td style={{ fontWeight: 500 }}>{m.first_name} {m.last_name || ""}</td>
                      <td style={{ color: "#888" }}>{m.phone_number}</td>
                      <td>
                        {m.batch_name
                          ? <span className="badge badge-info">{m.batch_name}</span>
                          : <span style={{ color: "#ccc" }}>—</span>}
                      </td>
                      <td>
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleToggleStatus(m)}
                          disabled={togglingId === m.id}
                          title="Discontinue this member — hides from active attendance"
                        >
                          {togglingId === m.id ? "…" : "Discontinue"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Discontinued members ─────────────────────── */}
          <div className="card" style={{ padding: 0, marginTop: 0, overflow: "hidden" }}>
            <div style={{ padding: "10px 18px", background: "var(--danger-bg)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontWeight: 700, fontSize: "0.93rem", color: "var(--danger)" }}>✗ Discontinued Members</span>
              <span className="badge badge-danger" style={{ fontSize: "0.72rem" }}>{inactiveMembers.length}</span>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th style={{ width: 40 }}>#</th><th>Member</th><th>Phone</th><th>Batch</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {inactiveMembers.length === 0
                    ? <tr><td colSpan="5" className="empty">No discontinued members.</td></tr>
                    : inactiveMembers.map((m, idx) => (
                      <tr key={m.id}>
                        <td style={{ color: "#aaa" }}>{idx + 1}</td>
                        <td style={{ fontWeight: 500 }}>{m.first_name} {m.last_name || ""}</td>
                        <td style={{ color: "#888" }}>{m.phone_number || "—"}</td>
                        <td>{m.batch_name ? <span className="badge badge-muted">{m.batch_name}</span> : <span style={{ color: "#ccc" }}>—</span>}</td>
                        <td>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleToggleStatus(m)}
                            disabled={togglingId === m.id}
                          >
                            {togglingId === m.id ? "…" : "↺ Reactivate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
