import { useCallback, useEffect, useState } from "react";
import {
  getMembers, getInactiveMembers,
  searchMembers, createMember, updateMember,
  deleteMember, toggleMemberStatus, permanentlyDeleteMember,
} from "../api/memberApi";
import { getBatches } from "../api/studioApi";
import {
  openWhatsApp, normalizePhone,
  msgWelcome, msgFeeReminder, msgDiscontinued, msgReactivated,
  msgMembershipExpiring, msgMembershipExpired,
} from "../utils/whatsapp";

/* ── Constants ───────────────────────────────────────────── */
const MEMBERSHIP_TYPES = [
  { value: "monthly",   label: "Monthly" },
  { value: "3_months",  label: "3 Months" },
  { value: "6_months",  label: "6 Months" },
  { value: "yearly",    label: "1 Year" },
  { value: "custom",    label: "Custom" },
];
const FITNESS_GOALS = [
  "Weight Loss", "Muscle Gain", "Strength", "General Fitness",
  "Fat Loss", "Flexibility", "Other",
];
const GENDERS = ["Male", "Female", "Other"];

const EMPTY_FORM = {
  first_name: "", last_name: "", gender: "", date_of_birth: "",
  phone_number: "", email: "", emergency_contact: "",
  height_cm: "", weight_kg: "", health_notes: "", fitness_goal: "",
  join_date: "", fee: "", batch_id: "",
  trainer: "", membership_type: "",
  membership_start_date: "", membership_expiry_date: "",
  freeze_start_date: "", freeze_end_date: "", freeze_reason: "",
};

/* ── Helpers ─────────────────────────────────────────────── */
function calcAge(dob) {
  if (!dob) return null;
  const today = new Date(), d = new Date(dob);
  let age = today.getFullYear() - d.getFullYear();
  if (today.getMonth() < d.getMonth() ||
     (today.getMonth() === d.getMonth() && today.getDate() < d.getDate())) age--;
  return age >= 0 ? age : null;
}
function displayAge(m) {
  const a = m.date_of_birth ? calcAge(m.date_of_birth) : m.age;
  return a != null ? `${a} yrs` : "—";
}
function initials(m) {
  return ((m.first_name?.[0] || "") + (m.last_name?.[0] || "")).toUpperCase() || "?";
}
function sortMembers(list) {
  return [...list].sort((a, b) => {
    const fn = (a.first_name || "").localeCompare(b.first_name || "", "en", { sensitivity: "base" });
    if (fn !== 0) return fn;
    return (a.last_name || "").localeCompare(b.last_name || "", "en", { sensitivity: "base" });
  });
}
function groupByBatch(members, batches) {
  const batchMap = {};
  batches.forEach((b) => { batchMap[b.id] = b; });
  const groups = {};
  members.forEach((m) => {
    const key = m.batch_id ?? "none";
    if (!groups[key]) {
      const b         = m.batch_id ? (batchMap[m.batch_id] || m.batch) : null;
      const batchName = (b ? b.name : null) || m.batch_name || "No Batch Assigned";
      const startTime = (b ? b.start_time : null) || "99:99";
      groups[key] = { batchId: key, batchName, startTime, members: [] };
    }
    groups[key].members.push(m);
  });
  return Object.values(groups)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((g) => ({ ...g, members: sortMembers(g.members) }));
}

/* Compute membership status + days remaining */
function membershipStatus(m) {
  const today = new Date(); today.setHours(0,0,0,0);
  // Frozen?
  if (m.freeze_start_date && m.freeze_end_date) {
    const fs = new Date(m.freeze_start_date); fs.setHours(0,0,0,0);
    const fe = new Date(m.freeze_end_date);   fe.setHours(0,0,0,0);
    if (today >= fs && today <= fe) return { status: "frozen", days: null };
  }
  if (!m.membership_expiry_date) return { status: "active", days: null };
  const exp = new Date(m.membership_expiry_date); exp.setHours(0,0,0,0);
  const diff = Math.round((exp - today) / 86400000);
  if (diff < 0)  return { status: "expired",       days: Math.abs(diff) };
  if (diff <= 7) return { status: "expiring_soon", days: diff };
  return { status: "active", days: diff };
}

function MembershipBadge({ m }) {
  const { status, days } = membershipStatus(m);
  if (!m.membership_expiry_date && status === "active") return null;
  const cfg = {
    active:        { label: days != null ? `Active · ${days}d left` : "Active",            bg: "var(--success-bg)",  color: "var(--success)" },
    expiring_soon: { label: `⚠ Expiring in ${days}d`,                                       bg: "var(--warning-bg)", color: "var(--warning)" },
    expired:       { label: `Expired ${days}d ago`,                                          bg: "var(--danger-bg)",  color: "var(--danger)"  },
    frozen:        { label: "❄ Frozen",                                                      bg: "#e8f4f8",           color: "#1a6080"        },
  }[status];
  return (
    <span style={{ fontSize: "0.7rem", fontWeight: 600, padding: "2px 7px", borderRadius: 12,
      background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>
      {cfg.label}
    </span>
  );
}

/* Auto-calculate expiry date from start + membership type */
function calcExpiry(startDate, type) {
  if (!startDate || !type || type === "custom") return "";
  const d = new Date(startDate);
  if (isNaN(d)) return "";
  const durations = { monthly: [1, "m"], "3_months": [3, "m"], "6_months": [6, "m"], yearly: [1, "y"] };
  const [n, unit] = durations[type] || [0, "m"];
  if (unit === "m") d.setMonth(d.getMonth() + n);
  else              d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}

/* ── Component ───────────────────────────────────────────── */
export default function Members() {
  const [members,         setMembers]        = useState([]);
  const [inactiveMembers, setInactiveMembers] = useState([]);
  const [batches,         setBatches]        = useState([]);
  const [search,          setSearch]         = useState("");
  const [loading,         setLoading]        = useState(true);
  const [error,           setError]          = useState("");
  const [success,         setSuccess]        = useState("");
  const [tab,             setTab]            = useState("active");
  const [collapsed,       setCollapsed]      = useState({});

  /* Add/Edit */
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [formError,  setFormError]  = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showFreeze, setShowFreeze] = useState(false);

  /* Per-row state */
  const [sendingId,  setSendingId]  = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  /* Selection */
  const [selected, setSelected] = useState(new Set());

  /* Bulk WA modal */
  const [bulkModal,    setBulkModal]   = useState(false);
  const [bulkMsg,      setBulkMsg]     = useState("");
  const [bulkSending,  setBulkSending] = useState(false);

  /* Individual message modal */
  const [msgModal,   setMsgModal]  = useState(false);
  const [msgTarget,  setMsgTarget] = useState(null);
  const [msgText,    setMsgText]   = useState("");
  const [msgSending, setMsgSending]= useState(false);

  /* ── Load ──────────────────────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mRes, iRes, bRes] = await Promise.all([
        getMembers(), getInactiveMembers(), getBatches(),
      ]);
      setMembers(mRes.data);
      setBatches(bRes.data);
      setInactiveMembers(iRes.data);
    } catch { setError("Could not load members."); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSearch(val) {
    setSearch(val);
    if (!val.trim()) { load(); return; }
    try { const res = await searchMembers(val.trim()); setMembers(res.data); }
    catch { /* ignore */ }
  }

  /* ── Derived ───────────────────────────────────────────── */
  const groups          = groupByBatch(members, batches);
  const selectedMembers = members.filter((m) => selected.has(m.id));
  const withPhone       = selectedMembers.filter((m) => normalizePhone(m.phone_number));
  const withoutPhone    = selectedMembers.filter((m) => !normalizePhone(m.phone_number));

  /* ── Selection ─────────────────────────────────────────── */
  function toggleOne(id)   { setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleBatch(ms) { const ids = ms.map((m) => m.id); const allOn = ids.every((id) => selected.has(id)); setSelected((p) => { const n = new Set(p); ids.forEach((id) => allOn ? n.delete(id) : n.add(id)); return n; }); }
  function toggleAll()     { const all = members.map((m) => m.id); setSelected(all.every((id) => selected.has(id)) ? new Set() : new Set(all)); }
  function clearSel()      { setSelected(new Set()); }
  function toggleCollapse(key) { setCollapsed((p) => ({ ...p, [key]: !p[key] })); }

  /* ── Modal helpers ─────────────────────────────────────── */
  function openAdd() {
    setEditTarget(null);
    setForm({ ...EMPTY_FORM, join_date: new Date().toISOString().slice(0, 10), membership_start_date: new Date().toISOString().slice(0, 10) });
    setFormError(""); setShowFreeze(false); setModalOpen(true);
  }
  function openEdit(m) {
    setEditTarget(m);
    setForm({
      first_name:             m.first_name || "",
      last_name:              m.last_name  || "",
      gender:                 m.gender     || "",
      date_of_birth:          m.date_of_birth || "",
      phone_number:           m.phone_number  || "",
      email:                  m.email         || "",
      emergency_contact:      m.emergency_contact || "",
      height_cm:              m.height_cm   != null ? String(m.height_cm)  : "",
      weight_kg:              m.weight_kg   != null ? String(m.weight_kg)  : "",
      health_notes:           m.health_notes  || "",
      fitness_goal:           m.fitness_goal  || "",
      join_date:              m.join_date     || "",
      fee:                    String(m.fee),
      batch_id:               m.batch_id ? String(m.batch_id) : "",
      trainer:                m.trainer   || "",
      membership_type:        m.membership_type        || "",
      membership_start_date:  m.membership_start_date  || "",
      membership_expiry_date: m.membership_expiry_date || "",
      freeze_start_date:      m.freeze_start_date || "",
      freeze_end_date:        m.freeze_end_date   || "",
      freeze_reason:          m.freeze_reason     || "",
    });
    setShowFreeze(!!(m.freeze_start_date || m.freeze_end_date));
    setFormError(""); setModalOpen(true);
  }
  function closeModal() { setModalOpen(false); setFormError(""); }
  function fld(f, v) {
    setForm((p) => {
      const next = { ...p, [f]: v };
      // Auto-calculate expiry when type or start date changes
      if ((f === "membership_type" || f === "membership_start_date") && next.membership_type !== "custom") {
        const exp = calcExpiry(next.membership_start_date, next.membership_type);
        if (exp) next.membership_expiry_date = exp;
      }
      return next;
    });
  }

  /* ── Submit ────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault(); setFormError("");
    if (!form.first_name.trim())   { setFormError("First name is required."); return; }
    if (!form.phone_number.trim()) { setFormError("Phone number is required."); return; }
    const fee = parseInt(form.fee, 10);
    if (isNaN(fee) || fee < 0)    { setFormError("Enter a valid monthly fee."); return; }
    const payload = {
      first_name:             form.first_name.trim(),
      last_name:              form.last_name.trim()  || null,
      gender:                 form.gender            || null,
      date_of_birth:          form.date_of_birth     || null,
      phone_number:           form.phone_number.trim(),
      email:                  form.email.trim()      || null,
      emergency_contact:      form.emergency_contact.trim() || null,
      height_cm:              form.height_cm  ? parseFloat(form.height_cm)  : null,
      weight_kg:              form.weight_kg  ? parseFloat(form.weight_kg)  : null,
      health_notes:           form.health_notes.trim()  || null,
      fitness_goal:           form.fitness_goal         || null,
      join_date:              form.join_date            || null,
      fee,
      batch_id:               form.batch_id ? parseInt(form.batch_id, 10) : null,
      trainer:                form.trainer.trim()        || null,
      membership_type:        form.membership_type       || null,
      membership_start_date:  form.membership_start_date  || null,
      membership_expiry_date: form.membership_expiry_date || null,
      freeze_start_date:      form.freeze_start_date  || null,
      freeze_end_date:        form.freeze_end_date    || null,
      freeze_reason:          form.freeze_reason.trim() || null,
    };
    setSubmitting(true);
    try {
      if (editTarget) { await updateMember(editTarget.id, payload); flash("Member updated."); }
      else            { await createMember(payload); flash("Member added. Payment auto-recorded."); }
      closeModal(); load();
    } catch (err) { setFormError(err.response?.data?.detail || "An error occurred."); }
    finally { setSubmitting(false); }
  }

  /* ── Deactivate ────────────────────────────────────────── */
  async function handleDelete(m) {
    if (!window.confirm(`Discontinue ${m.first_name} ${m.last_name || ""}? Historical records will be preserved.`)) return;
    try {
      await deleteMember(m.id);
      flash("Member discontinued.");
      setSelected((p) => { const n = new Set(p); n.delete(m.id); return n; });
      load();
    } catch (err) { flash(err.response?.data?.detail || "Could not discontinue.", "error"); }
  }

  async function handleBulkDeactivate() {
    const names = selectedMembers.map((m) => `${m.first_name} ${m.last_name || ""}`.trim()).join(", ");
    if (!window.confirm(`Discontinue ${selectedMembers.length} member(s)?\n\n${names}`)) return;
    let done = 0;
    for (const m of selectedMembers) {
      try { await deleteMember(m.id); done++; } catch { /* continue */ }
    }
    flash(`${done} member(s) discontinued.`); clearSel(); load();
  }

  async function handleReactivate(m) {
    if (!window.confirm(`Reactivate ${m.first_name} ${m.last_name || ""}?`)) return;
    setTogglingId(m.id);
    try { await toggleMemberStatus(m.id); flash(`${m.first_name} reactivated!`); load(); }
    catch (err) { flash(err.response?.data?.detail || "Could not reactivate.", "error"); }
    finally { setTogglingId(null); }
  }

  async function handlePermanentDelete(m) {
    const name = `${m.first_name} ${m.last_name || ""}`.trim();
    if (!window.confirm(`⚠ PERMANENTLY DELETE ${name}?\n\nThis will remove ALL records forever. This CANNOT be undone.`)) return;
    try { await permanentlyDeleteMember(m.id); flash(`${name} permanently deleted.`); load(); }
    catch (err) { flash(err.response?.data?.detail || "Could not delete.", "error"); }
  }

  /* ── WhatsApp handlers ─────────────────────────────────── */
  const wa = (m, msg) => { if (!normalizePhone(m.phone_number)) { alert(`No valid phone for ${m.first_name}.`); return; } openWhatsApp(m.phone_number, msg); };
  const month = new Date().toISOString().slice(0, 7);
  const handleReminderWA    = (m) => wa(m, msgFeeReminder(m, month));
  const handleDiscontinuedWA = (m) => wa(m, msgDiscontinued(m));
  const handleReactivatedWA  = (m) => wa(m, msgReactivated(m));
  const handleExpiryWA       = (m) => wa(m, msgMembershipExpiring(m));
  const handleExpiredWA      = (m) => wa(m, msgMembershipExpired(m));

  /* ── Individual message modal ──────────────────────────── */
  function openMsgModal(m) { setMsgTarget(m); setMsgText(`Hello ${m.first_name} 💪\n\n`); setMsgModal(true); }
  async function handleSendMsg(e) {
    e.preventDefault(); if (!msgText.trim()) return;
    setMsgSending(true);
    const opened = openWhatsApp(msgTarget.phone_number, msgText);
    if (!opened) flash(`No valid phone for ${msgTarget.first_name}.`, "error");
    else { flash(`WhatsApp opened for ${msgTarget.first_name}.`); setMsgModal(false); }
    setMsgSending(false);
  }

  /* ── Bulk WA modal ─────────────────────────────────────── */
  function openBulkModal() {
    setBulkMsg(`Dear Member 💪\n\nThis is a reminder from Jeeva Fitness.\n\nThank you,\n— Jeeva Fitness`);
    setBulkModal(true);
  }
  async function handleBulkSend(e) {
    e.preventDefault(); if (!bulkMsg.trim()) return;
    setBulkSending(true);
    let opened = 0;
    for (const m of withPhone) { openWhatsApp(m.phone_number, bulkMsg); opened++; await new Promise((r) => setTimeout(r, 300)); }
    flash(`WhatsApp opened for ${opened} member(s).`);
    setBulkModal(false); setBulkSending(false); clearSel();
  }

  function flash(msg, type = "success") {
    if (type === "success") { setSuccess(msg); setTimeout(() => setSuccess(""), 3500); }
    else                    { setError(msg);   setTimeout(() => setError(""),   3500); }
  }

  /* ── Member row ────────────────────────────────────────── */
  function MemberRow({ m, rowNum }) {
    const hasPhone   = !!normalizePhone(m.phone_number);
    const { status } = membershipStatus(m);
    return (
      <tr>
        <td style={{ width: 36, textAlign: "center" }}>
          <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleOne(m.id)} style={{ cursor: "pointer", width: 15, height: 15 }} />
        </td>
        <td style={{ color: "var(--text-light)", width: 40 }}>{rowNum}</td>
        <td>
          <div style={{ fontWeight: 600 }}>{m.first_name} {m.last_name || ""}</div>
          {m.trainer && <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>🏋️ {m.trainer}</div>}
          {m.membership_expiry_date && <MembershipBadge m={m} />}
        </td>
        <td>{m.phone_number}</td>
        <td>{displayAge(m)}</td>
        <td style={{ fontWeight: 700, color: "var(--sage)" }}>₹{m.fee.toLocaleString("en-IN")}</td>
        <td style={{ maxWidth: 160 }}>
          {m.health_notes
            ? <span title={m.health_notes} style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                {m.health_notes.length > 40 ? m.health_notes.slice(0, 40) + "…" : m.health_notes}
              </span>
            : <span style={{ color: "var(--text-light)" }}>—</span>}
        </td>
        <td>
          <span className={`badge ${m.is_active ? "badge-success" : "badge-danger"}`}>
            {m.is_active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            <button className="btn btn-outline btn-sm" onClick={() => openEdit(m)}>Edit</button>
            {hasPhone && <>
              <button className="btn btn-outline btn-sm" onClick={() => handleReminderWA(m)} title="Fee reminder">📱</button>
              {(status === "expiring_soon") && (
                <button className="btn btn-warning btn-sm" onClick={() => handleExpiryWA(m)} title="Expiry reminder">⚠</button>
              )}
              {(status === "expired") && (
                <button className="btn btn-danger btn-sm" onClick={() => handleExpiredWA(m)} title="Expired reminder">❌</button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => openMsgModal(m)} title="Custom message">💬</button>
            </>}
            <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m)}>✕</button>
          </div>
        </td>
      </tr>
    );
  }

  /* ── Batch section ─────────────────────────────────────── */
  function BatchSection({ group }) {
    const key        = group.batchId;
    const isCollapsed = !!collapsed[key];
    const bms        = group.members;
    const allChecked  = bms.length > 0 && bms.every((m) => selected.has(m.id));
    const someChecked = bms.some((m) => selected.has(m.id));
    return (
      <div className="card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px", background: "var(--cream-deep)", borderBottom: isCollapsed ? "none" : "1px solid var(--border)", cursor: "pointer", userSelect: "none" }}
          onClick={() => toggleCollapse(key)}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="checkbox" checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }}
              onChange={(e) => { e.stopPropagation(); toggleBatch(bms); }}
              onClick={(e) => e.stopPropagation()}
              style={{ cursor: "pointer", width: 15, height: 15 }} />
            <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{group.batchName}</span>
            <span className="badge badge-muted" style={{ fontSize: "0.72rem" }}>{bms.length} member{bms.length !== 1 ? "s" : ""}</span>
          </div>
          <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{isCollapsed ? "▶ expand" : "▼ collapse"}</span>
        </div>
        {!isCollapsed && (
          <div className="table-wrapper">
            <table>
              <thead><tr><th style={{ width: 36 }}></th><th style={{ width: 40 }}>#</th><th>Name</th><th>Phone</th><th>Age</th><th>Fee/mo</th><th>Health</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {bms.length === 0
                  ? <tr><td colSpan="9" className="empty">No members.</td></tr>
                  : bms.map((m, idx) => <MemberRow key={m.id} m={m} rowNum={idx + 1} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ── RENDER ─────────────────────────────────────────────── */
  return (
    <>
      <div className="page-header">
        <h1>Members</h1>
        <button className="btn btn-primary desktop-only" onClick={openAdd}>+ Add Member</button>
      </div>
      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "2px solid var(--border)", paddingBottom: 8 }}>
        {[
          { key: "active",       label: `Active (${members.length})` },
          { key: "discontinued", label: `Discontinued (${inactiveMembers.length})` },
        ].map(({ key, label }) => (
          <button key={key} onClick={() => setTab(key)} style={{
            padding: "6px 16px", border: "none", borderRadius: "6px 6px 0 0",
            cursor: "pointer", fontWeight: tab === key ? 700 : 400, fontSize: "0.875rem",
            background: tab === key ? "var(--sidebar-bg)" : "transparent",
            color: tab === key ? "#fff" : "var(--text-muted)",
          }}>{label}</button>
        ))}
      </div>

      {/* ── ACTIVE TAB ──────────────────────────────────────── */}
      {tab === "active" && (
        <>
          <div className="card" style={{ padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input type="text" placeholder="🔍  Search by name or phone…" value={search}
                onChange={(e) => handleSearch(e.target.value)} style={{ flex: "1 1 200px", minWidth: 140 }} />
              <button className="btn btn-outline btn-sm" onClick={toggleAll}>
                {members.length > 0 && members.every((m) => selected.has(m.id)) ? "☐ Deselect All" : "☑ Select All"}
              </button>
              {selected.size > 0 && (
                <>
                  <span style={{ fontSize: "0.85rem", color: "var(--sage)", fontWeight: 600 }}>{selected.size} selected</span>
                  <button className="btn btn-success btn-sm" onClick={openBulkModal}>📱 WhatsApp</button>
                  <button className="btn btn-danger btn-sm" onClick={handleBulkDeactivate}>🚫 Discontinue</button>
                  <button className="btn btn-outline btn-sm" onClick={clearSel}>✕ Clear</button>
                </>
              )}
              <button className="btn btn-outline btn-sm" style={{ marginLeft: "auto" }} onClick={load}>↺</button>
            </div>
          </div>

          {loading ? <div className="loading">Loading…</div>
           : members.length === 0 ? <div className="card"><div className="empty">No active members.</div></div>
           : <div className="desktop-only">{groups.map((g) => <BatchSection key={g.batchId} group={g} />)}</div>}

          {/* Mobile */}
          {!loading && members.length > 0 && (
            <div className="mobile-only">
              {groups.map((g) => (
                <div key={g.batchId} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px", background: "var(--cream-deep)", borderRadius: "var(--radius) var(--radius) 0 0", border: "1px solid var(--border)", borderBottom: "none" }}>
                    <span style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)" }}>{g.batchName}</span>
                    <span className="badge badge-muted" style={{ fontSize: "0.7rem" }}>{g.members.length} member{g.members.length !== 1 ? "s" : ""}</span>
                  </div>
                  {g.members.map((m, idx) => (
                    <div key={m.id} style={{ border: "1px solid var(--border)", borderTop: idx === 0 ? "1px solid var(--border)" : "none", borderRadius: idx === g.members.length - 1 ? "0 0 var(--radius) var(--radius)" : 0, padding: "12px 14px", display: "flex", gap: 12, alignItems: "center", background: "#fff" }}>
                      <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--sage-pale)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--sage)", fontSize: "1rem", flexShrink: 0 }}>{initials(m)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}><span style={{ color: "var(--text-muted)", fontSize: "0.72rem", marginRight: 6 }}>{idx + 1}.</span>{m.first_name} {m.last_name || ""}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{m.phone_number}{displayAge(m) !== "—" && <> · {displayAge(m)}</>}</div>
                        {m.membership_expiry_date && <div style={{ marginTop: 3 }}><MembershipBadge m={m} /></div>}
                        <div style={{ display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" }}>
                          <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggleOne(m.id)} style={{ cursor: "pointer", width: 15, height: 15, alignSelf: "center" }} />
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(m)}>Edit</button>
                          {normalizePhone(m.phone_number) && (
                            <><button className="btn btn-outline btn-sm" onClick={() => handleReminderWA(m)}>📱</button>
                            <button className="btn btn-outline btn-sm" onClick={() => openMsgModal(m)}>💬</button></>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(m)}>✕</button>
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--sage)", flexShrink: 0 }}>₹{m.fee.toLocaleString("en-IN")}</div>
                    </div>
                  ))}
                </div>
              ))}
              <button className="fab" onClick={openAdd} aria-label="Add Member">+</button>
            </div>
          )}
        </>
      )}

      {/* ── DISCONTINUED TAB ─────────────────────────────────── */}
      {tab === "discontinued" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "10px 18px", background: "var(--danger-bg)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, color: "var(--danger)" }}>Discontinued Members</span>
            <span className="badge badge-danger">{inactiveMembers.length}</span>
            <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: "var(--text-muted)" }}>Historical records preserved</span>
          </div>
          {inactiveMembers.length === 0 ? (
            <div className="empty" style={{ padding: 32 }}>No discontinued members.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>#</th><th>Name</th><th>Phone</th><th>Fee/mo</th><th>Actions</th></tr></thead>
                <tbody>
                  {sortMembers(inactiveMembers).map((m, idx) => (
                    <tr key={m.id}>
                      <td style={{ color: "var(--text-light)" }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{m.first_name} {m.last_name || ""}</td>
                      <td style={{ color: "var(--text-muted)" }}>{m.phone_number || "—"}</td>
                      <td style={{ color: "var(--text-muted)" }}>₹{m.fee.toLocaleString("en-IN")}</td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button className="btn btn-success btn-sm" onClick={() => handleReactivate(m)} disabled={togglingId === m.id}>
                            {togglingId === m.id ? "…" : "↺ Reactivate"}
                          </button>
                          {normalizePhone(m.phone_number) && (
                            <><button className="btn btn-outline btn-sm" onClick={() => handleDiscontinuedWA(m)}>📱 WA</button>
                            <button className="btn btn-gold btn-sm" onClick={() => handleReactivatedWA(m)}>↩ Welcome</button></>
                          )}
                          <button className="btn btn-danger btn-sm" onClick={() => handlePermanentDelete(m)}>🗑 Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── ADD / EDIT MODAL ─────────────────────────────────── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <h2>{editTarget ? "Edit Member" : "Add Member"}</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            {!editTarget && <div className="alert alert-info" style={{ fontSize: "0.82rem" }}>A payment record will be auto-created for the current month when fee &gt; ₹0.</div>}
            <form onSubmit={handleSubmit}>

              {/* Personal */}
              <div className="modal-section-label">Personal Information</div>
              <div className="form-row">
                <div className="form-group"><label>First Name *</label><input value={form.first_name} onChange={(e) => fld("first_name", e.target.value)} required /></div>
                <div className="form-group"><label>Last Name</label><input value={form.last_name} onChange={(e) => fld("last_name", e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Gender</label>
                  <select value={form.gender} onChange={(e) => fld("gender", e.target.value)}>
                    <option value="">— Select —</option>
                    {GENDERS.map((g) => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date of Birth</label>
                  <input type="date" value={form.date_of_birth} onChange={(e) => fld("date_of_birth", e.target.value)} max={new Date().toISOString().slice(0, 10)} />
                  {form.date_of_birth && <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: 4 }}>Age: <strong>{calcAge(form.date_of_birth)} yrs</strong></div>}
                </div>
              </div>

              {/* Contact */}
              <div className="modal-section-label">Contact</div>
              <div className="form-row">
                <div className="form-group"><label>Phone *</label><input value={form.phone_number} onChange={(e) => fld("phone_number", e.target.value)} required /></div>
                <div className="form-group"><label>Email</label><input type="email" value={form.email} onChange={(e) => fld("email", e.target.value)} /></div>
              </div>
              <div className="form-group"><label>Emergency Contact</label><input value={form.emergency_contact} onChange={(e) => fld("emergency_contact", e.target.value)} placeholder="Name & phone number" /></div>

              {/* Gym Info */}
              <div className="modal-section-label">Gym Information</div>
              <div className="form-row">
                <div className="form-group"><label>Monthly Fee (₹) *</label><input type="number" min="0" value={form.fee} onChange={(e) => fld("fee", e.target.value)} required /></div>
                <div className="form-group">
                  <label>Batch / Workout Time</label>
                  <select value={form.batch_id} onChange={(e) => fld("batch_id", e.target.value)}>
                    <option value="">— No batch —</option>
                    {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Trainer</label><input value={form.trainer} onChange={(e) => fld("trainer", e.target.value)} placeholder="e.g. Jeevan" /></div>
                <div className="form-group"><label>Join Date</label><input type="date" value={form.join_date} onChange={(e) => fld("join_date", e.target.value)} /></div>
              </div>

              {/* Membership */}
              <div className="modal-section-label">Membership</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Membership Type</label>
                  <select value={form.membership_type} onChange={(e) => fld("membership_type", e.target.value)}>
                    <option value="">— Select —</option>
                    {MEMBERSHIP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Start Date</label><input type="date" value={form.membership_start_date} onChange={(e) => fld("membership_start_date", e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Expiry Date</label>
                  <input type="date" value={form.membership_expiry_date} onChange={(e) => fld("membership_expiry_date", e.target.value)} />
                  {form.membership_type && form.membership_type !== "custom" && form.membership_start_date && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>Auto-calculated from start date</div>
                  )}
                </div>
                <div className="form-group" style={{ alignSelf: "flex-end" }}>
                  <button type="button" className="btn btn-outline btn-sm" style={{ width: "100%" }}
                    onClick={() => setShowFreeze((v) => !v)}>
                    {showFreeze ? "▲ Hide Freeze" : "❄ Freeze Membership"}
                  </button>
                </div>
              </div>
              {showFreeze && (
                <>
                  <div className="form-row">
                    <div className="form-group"><label>Freeze Start</label><input type="date" value={form.freeze_start_date} onChange={(e) => fld("freeze_start_date", e.target.value)} /></div>
                    <div className="form-group"><label>Freeze End</label><input type="date" value={form.freeze_end_date} onChange={(e) => fld("freeze_end_date", e.target.value)} /></div>
                  </div>
                  <div className="form-group"><label>Freeze Reason</label><input value={form.freeze_reason} onChange={(e) => fld("freeze_reason", e.target.value)} placeholder="e.g. Medical leave, travel" /></div>
                </>
              )}

              {/* Health & Fitness */}
              <div className="modal-section-label">Health &amp; Fitness</div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fitness Goal</label>
                  <select value={form.fitness_goal} onChange={(e) => fld("fitness_goal", e.target.value)}>
                    <option value="">— Select —</option>
                    {FITNESS_GOALS.map((g) => <option key={g} value={g.toLowerCase().replace(/ /g,"_")}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group"><label>Height (cm)</label><input type="number" min="50" max="250" step="0.1" value={form.height_cm} onChange={(e) => fld("height_cm", e.target.value)} /></div>
              </div>
              <div className="form-row">
                <div className="form-group"><label>Weight (kg)</label><input type="number" min="10" max="300" step="0.1" value={form.weight_kg} onChange={(e) => fld("weight_kg", e.target.value)} /></div>
                <div className="form-group" />
              </div>
              <div className="form-group"><label>Medical / Health Notes</label><textarea rows={3} value={form.health_notes} onChange={(e) => fld("health_notes", e.target.value)} style={{ resize: "vertical" }} /></div>

              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? "Saving…" : editTarget ? "Update Member" : "Add Member"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── BULK WA MODAL ───────────────────────────────────── */}
      {bulkModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setBulkModal(false)}>
          <div className="modal">
            <h2>📱 Send WhatsApp Message</h2>
            <div style={{ marginBottom: 14, padding: "10px 14px", background: "var(--cream)", borderRadius: 8, border: "1px solid var(--border)", fontSize: "0.83rem" }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{withPhone.length} recipient(s)</div>
              {withPhone.map((m) => <div key={m.id} style={{ color: "var(--text-muted)" }}>✓ {m.first_name} {m.last_name || ""} — {m.phone_number}</div>)}
              {withoutPhone.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
                  <div style={{ color: "var(--danger)", fontWeight: 600, marginBottom: 4 }}>⚠ No valid phone — will be skipped:</div>
                  {withoutPhone.map((m) => <div key={m.id} style={{ color: "var(--danger)" }}>{m.first_name} {m.last_name || ""}</div>)}
                </div>
              )}
            </div>
            {withPhone.length === 0
              ? <div className="alert alert-error">None of the selected members have a valid phone number.</div>
              : <form onSubmit={handleBulkSend}>
                  <div className="alert alert-info" style={{ fontSize: "0.8rem", marginBottom: 10 }}>WhatsApp will open for each recipient. You must manually press Send in each chat.</div>
                  <div className="form-group"><label>Message *</label><textarea rows={6} value={bulkMsg} onChange={(e) => setBulkMsg(e.target.value)} required style={{ resize: "vertical" }} /></div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline" onClick={() => setBulkModal(false)}>Cancel</button>
                    <button type="submit" className="btn btn-success" disabled={bulkSending || !bulkMsg.trim()}>{bulkSending ? "Opening…" : `📱 Open WhatsApp (${withPhone.length})`}</button>
                  </div>
                </form>
            }
          </div>
        </div>
      )}

      {/* ── INDIVIDUAL MESSAGE MODAL ─────────────────────────── */}
      {msgModal && msgTarget && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setMsgModal(false)}>
          <div className="modal">
            <h2>WhatsApp Message</h2>
            <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", marginBottom: 16 }}>To: <strong>{msgTarget.first_name} {msgTarget.last_name || ""}</strong> · {msgTarget.phone_number}</p>
            <form onSubmit={handleSendMsg}>
              <div className="form-group">
                <label>Message *</label>
                <textarea rows={6} value={msgText} onChange={(e) => setMsgText(e.target.value)} required style={{ resize: "vertical" }} />
              </div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>Quick templates</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { label: "Welcome",          text: msgWelcome(msgTarget) },
                    { label: "Fee Reminder",     text: msgFeeReminder(msgTarget, new Date().toISOString().slice(0, 7)) },
                    { label: "Expiry Reminder",  text: msgMembershipExpiring(msgTarget) },
                    { label: "Gym Holiday",      text: `Hello ${msgTarget.first_name} 💪\n\nJeeva Fitness will be closed tomorrow. We will resume the day after.\n\nThank you!\n— Jeeva Fitness` },
                    { label: "Class Cancelled",  text: `Hello ${msgTarget.first_name} 💪\n\nToday's session has been cancelled. We'll resume tomorrow as usual.\n\nSorry for the inconvenience!\n— Jeeva Fitness` },
                  ].map((t) => (
                    <button key={t.label} type="button" className="btn btn-outline btn-sm" onClick={() => setMsgText(t.text)}>{t.label}</button>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setMsgModal(false)}>Cancel</button>
                <button type="submit" className="btn btn-success" disabled={msgSending || !msgText.trim()}>📱 Open WhatsApp</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
