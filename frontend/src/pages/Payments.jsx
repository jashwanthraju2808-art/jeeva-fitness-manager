import { useCallback, useEffect, useState } from "react";
import { getMembers } from "../api/memberApi";
import {
  getPayments, getPaymentsByMonth,
  createPayment, updatePayment, deletePayment, updatePaymentStatus,
} from "../api/paymentApi";
import {
  openWhatsApp,
  msgFeeReminder,
  msgPaymentConfirmation,
  normalizePhone,
} from "../utils/whatsapp";

const today      = new Date();
const THIS_MONTH = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

const EMPTY_FORM = {
  member_id: "", amount: "", month: THIS_MONTH,
  payment_date: today.toISOString().slice(0, 10),
  note: "", status: "paid", payment_method: "cash",
};

function monthLabel(m) {
  // "2026-08" → "August 2026"
  try {
    const [y, mo] = m.split("-");
    return new Date(Number(y), Number(mo) - 1, 1)
      .toLocaleString("en-IN", { month: "long", year: "numeric" });
  } catch { return m; }
}

export default function Payments() {
  const [payments,     setPayments]    = useState([]);
  const [members,      setMembers]     = useState([]);
  const [filterMonth,  setFilterMonth] = useState(THIS_MONTH);
  const [loading,      setLoading]     = useState(true);
  const [error,        setError]       = useState("");
  const [success,      setSuccess]     = useState("");

  const [modalOpen,    setModalOpen]   = useState(false);
  const [editTarget,   setEditTarget]  = useState(null);
  const [form,         setForm]        = useState(EMPTY_FORM);
  const [formError,    setFormError]   = useState("");
  const [submitting,   setSubmitting]  = useState(false);
  const [togglingId,   setTogglingId]  = useState(null);

  /* ── Load ────────────────────────────────────────────── */
  const loadPayments = useCallback(async (month) => {
    setLoading(true);
    setError("");
    try {
      const res = month ? await getPaymentsByMonth(month) : await getPayments();
      setPayments(res.data);
    } catch { setError("Could not load payments."); }
    finally  { setLoading(false); }
  }, []);

  useEffect(() => {
    loadPayments(filterMonth);
    getMembers().then((r) => setMembers(r.data)).catch(() => {});
  }, [loadPayments, filterMonth]);

  /* ── Helpers ─────────────────────────────────────────── */
  const memberById = (id) => members.find((m) => m.id === id);
  const memberName = (id) => {
    const m = memberById(id);
    return m ? `${m.first_name} ${m.last_name || ""}`.trim() : `Member #${id}`;
  };

  function flash(msg, type = "success") {
    if (type === "success") { setSuccess(msg); setTimeout(() => setSuccess(""), 3500); }
    else                    { setError(msg);   setTimeout(() => setError(""),   3500); }
  }

  /* ── Modal ───────────────────────────────────────────── */
  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError("");
    setModalOpen(true);
  }

  function openEdit(p) {
    setEditTarget(p);
    setForm({
      member_id:      String(p.member_id),
      amount:         String(p.amount),
      month:          p.month,
      payment_date:   p.payment_date,
      note:           p.note || "",
      status:         p.status || "paid",
      payment_method: p.payment_method || "",
    });
    setFormError("");
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditTarget(null); setFormError(""); }

  /* ── Submit ──────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const payload = {
      member_id:      parseInt(form.member_id, 10),
      amount:         parseInt(form.amount, 10),
      month:          form.month,
      payment_date:   form.payment_date,
      note:           form.note.trim() || null,
      status:         form.status,
      payment_method: form.payment_method || null,
    };
    if (!payload.member_id || isNaN(payload.amount) || !payload.month || !payload.payment_date) {
      setFormError("Please fill in all required fields."); return;
    }
    setSubmitting(true);
    try {
      if (editTarget) {
        await updatePayment(editTarget.id, payload);
        flash("Payment updated.");
      } else {
        await createPayment(payload);
        flash("Payment recorded.");
      }
      closeModal();
      loadPayments(filterMonth);   // only reached on success — never on duplicate
    } catch (err) {
      const detail = err.response?.data?.detail;
      const status = err.response?.status;
      if (status === 409) {
        // Duplicate — show clearly, do NOT update any state
        setFormError(detail || "A payment for this member and month already exists.");
      } else {
        setFormError(detail || "Could not save payment.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Delete ──────────────────────────────────────────── */
  async function handleDelete(p) {
    if (!window.confirm(`Delete ₹${p.amount} payment for ${p.month}?`)) return;
    try {
      await deletePayment(p.id);
      flash("Payment deleted.");
      loadPayments(filterMonth);
    } catch (err) { flash(err.response?.data?.detail || "Could not delete.", "error"); }
  }

  /* ── Toggle paid / not_paid ──────────────────────────── */
  async function handleToggleStatus(p) {
    const newStatus = p.status === "paid" ? "not_paid" : "paid";
    setTogglingId(p.id);
    try {
      await updatePaymentStatus(p.id, newStatus);
      flash(`Marked as ${newStatus === "paid" ? "Paid ✓" : "Not Paid"}.`);
      loadPayments(filterMonth);
    } catch (err) { flash(err.response?.data?.detail || "Could not update status.", "error"); }
    finally       { setTogglingId(null); }
  }

  /* ── WhatsApp ────────────────────────────────────────── */
  function handleWhatsApp(p) {
    const m = memberById(p.member_id);
    if (!m) { alert("Member not found."); return; }
    if (!normalizePhone(m.phone_number)) {
      alert(`No valid WhatsApp number for ${m.first_name}.`); return;
    }
    const label = monthLabel(p.month);
    const msg   = p.status === "paid"
      ? msgPaymentConfirmation(m, p.amount, label)
      : msgFeeReminder({ ...m, fee: p.amount }, label);
    const opened = openWhatsApp(m.phone_number, msg);
    if (!opened) alert("No valid phone number for this member.");
  }

  /* ── Sort A→Z ────────────────────────────────────────── */
  const sortedPayments = [...payments].sort((a, b) => {
    const na = memberName(a.member_id).toLowerCase();
    const nb = memberName(b.member_id).toLowerCase();
    if (na !== nb) return na.localeCompare(nb, "en", { sensitivity: "base" });
    return b.payment_date.localeCompare(a.payment_date);
  });

  const totalCollected = payments
    .filter((p) => p.status === "paid")
    .reduce((s, p) => s + p.amount, 0);

  /* ── Render ──────────────────────────────────────────── */
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Payments</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
            Track and manage member payments.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Record Payment</button>
      </div>

      {error   && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        {/* Toolbar */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 500 }}>Month:</label>
          <input
            type="month" value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: "0.88rem" }}
          />
          <button className="btn btn-outline btn-sm" onClick={() => setFilterMonth("")}>Show All</button>
          <span style={{ marginLeft: "auto", fontWeight: 700, color: "var(--success)" }}>
            Collected: ₹{totalCollected.toLocaleString("en-IN")}
          </span>
        </div>

        {loading ? <div className="loading">Loading payments…</div> : (
          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Member</th>
                  <th>Amount</th>
                  <th>Month</th>
                  <th>Date</th>
                  <th>Method</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPayments.length === 0 ? (
                  <tr><td colSpan="9" className="empty">No payments found.</td></tr>
                ) : sortedPayments.map((p, idx) => {
                  const isPaid = (p.status || "paid") === "paid";
                  return (
                    <tr key={p.id}>
                      <td style={{ color: "var(--text-light)" }}>{idx + 1}</td>
                      <td style={{ fontWeight: 600 }}>{memberName(p.member_id)}</td>
                      <td style={{ fontWeight: 700, color: isPaid ? "var(--success)" : "var(--danger)" }}>
                        ₹{p.amount.toLocaleString("en-IN")}
                      </td>
                      <td>{p.month}</td>
                      <td style={{ color: "var(--text-muted)" }}>{p.payment_date}</td>
                      <td>
                        {p.payment_method
                          ? <span className="badge badge-info" style={{ textTransform: "capitalize" }}>{p.payment_method.replace("_"," ")}</span>
                          : <span style={{ color: "var(--text-light)" }}>—</span>}
                      </td>
                      <td>
                        {/* Paid / Not Paid toggle button */}
                        <button
                          onClick={() => handleToggleStatus(p)}
                          disabled={togglingId === p.id}
                          style={{
                            padding: "3px 10px", borderRadius: 20, border: "none",
                            cursor: "pointer", fontSize: "0.78rem", fontWeight: 700,
                            background: isPaid ? "var(--success-bg)" : "var(--danger-bg)",
                            color:      isPaid ? "var(--success)"    : "var(--danger)",
                            opacity: togglingId === p.id ? 0.5 : 1,
                          }}
                          title="Click to toggle paid/not paid"
                        >
                          {togglingId === p.id ? "…" : isPaid ? "🟢 Paid" : "🔴 Not Paid"}
                        </button>
                      </td>
                      <td style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>
                        {p.note || "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => handleWhatsApp(p)}
                            title={isPaid ? "Send payment confirmation" : "Send payment reminder"}
                          >
                            📱 {isPaid ? "Confirm" : "Remind"}
                          </button>
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>✏ Edit</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(p)}>🗑</button>
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

      {/* ── Add / Edit Modal ─────────────────────────────── */}
      {modalOpen && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="modal">
            <h2>{editTarget ? "Edit Payment" : "Record Payment"}</h2>
            {formError && <div className="alert alert-error">{formError}</div>}
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Member *</label>
                <select value={form.member_id} onChange={(e) => setForm({ ...form, member_id: e.target.value })} required>
                  <option value="">— Select member —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.first_name} {m.last_name || ""} (₹{m.fee}/mo)</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Amount (₹) *</label>
                  <input type="number" min="1" value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Month *</label>
                  <input type="month" value={form.month}
                    onChange={(e) => setForm({ ...form, month: e.target.value })} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Date *</label>
                  <input type="date" value={form.payment_date}
                    onChange={(e) => setForm({ ...form, payment_date: e.target.value })} required />
                </div>
                <div className="form-group" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Payment Method</label>
                  <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                    <option value="">— Select —</option>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="card">Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Status</label>
                  <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    <option value="paid">🟢 Paid</option>
                    <option value="not_paid">🔴 Not Paid</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Note (optional)</label>
                <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}
                  placeholder="e.g. Paid in advance" />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? "Saving…" : editTarget ? "Update Payment" : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
