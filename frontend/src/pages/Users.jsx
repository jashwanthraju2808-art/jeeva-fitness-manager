import { useEffect, useState } from "react";
import {
  getUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
} from "../api/usersApi";
import { useAuth } from "../context/AuthContext";

/* ── Shared inline styles ────────────────────────────── */
const thStyle = {
  textAlign: "left", padding: "12px 16px",
  borderBottom: "1px solid var(--border, #e5e7eb)",
  fontSize: 13, fontWeight: 600,
  background: "var(--cream-deep, #f2ede4)",
};
const tdStyle = {
  padding: "12px 16px",
  borderBottom: "1px solid var(--border-light, #f1f5f9)",
  fontSize: 13,
};

export default function Users() {
  const { user: currentUser } = useAuth();

  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [success, setSuccess] = useState("");

  /* ── Create form ─────────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ username: "", password: "", role: "staff" });
  const [createError, setCreateError] = useState("");

  /* ── Edit modal ──────────────────────────────────────── */
  const [editTarget,   setEditTarget]   = useState(null);
  const [editRole,     setEditRole]     = useState("staff");
  const [editDispName, setEditDispName] = useState("");
  const [editError,    setEditError]    = useState("");

  /* ── Password reset modal ────────────────────────────── */
  const [pwTarget,  setPwTarget]  = useState(null);
  const [pw1,       setPw1]       = useState("");
  const [pw2,       setPw2]       = useState("");
  const [pwError,   setPwError]   = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [showPw1,   setShowPw1]   = useState(false);
  const [showPw2,   setShowPw2]   = useState(false);

  /* ── Load ────────────────────────────────────────────── */
  async function loadUsers() {
    setLoading(true);
    try {
      const res = await getUsers();
      setUsers(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || "Unable to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsers(); }, []);

  function flash(msg, type = "success") {
    if (type === "success") { setSuccess(msg); setTimeout(() => setSuccess(""), 3500); }
    else                    { setError(msg);   setTimeout(() => setError(""),   3500); }
  }

  /* ── Create ──────────────────────────────────────────── */
  async function handleCreate(e) {
    e.preventDefault();
    setCreateError("");
    try {
      await createUser(createForm);
      setCreateForm({ username: "", password: "", role: "staff" });
      setShowCreate(false);
      flash("User created.");
      loadUsers();
    } catch (err) {
      setCreateError(err.response?.data?.detail || "Unable to create user");
    }
  }

  /* ── Toggle active ───────────────────────────────────── */
  async function toggleActive(user) {
    try {
      await updateUser(user.id, { is_active: !user.is_active });
      flash(`${user.username} ${user.is_active ? "deactivated" : "activated"}.`);
      loadUsers();
    } catch (err) {
      flash(err.response?.data?.detail || "Unable to update user", "error");
    }
  }

  /* ── Edit (role) ─────────────────────────────────────── */
  function openEdit(user) {
    setEditTarget(user);
    setEditRole(user.role);
    setEditDispName(user.display_name || "");
    setEditError("");
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditError("");
    try {
      await updateUser(editTarget.id, { role: editRole, display_name: editDispName || null });
      flash(`${editTarget.username} updated.`);
      setEditTarget(null);
      loadUsers();
    } catch (err) {
      setEditError(err.response?.data?.detail || "Unable to update user");
    }
  }

  /* ── Password reset ──────────────────────────────────── */
  function openPwReset(user) {
    setPwTarget(user);
    setPw1(""); setPw2("");
    setPwError(""); setShowPw1(false); setShowPw2(false);
  }

  async function handlePwReset(e) {
    e.preventDefault();
    setPwError("");
    if (pw1.length < 6)   { setPwError("Password must be at least 6 characters."); return; }
    if (pw1 !== pw2)       { setPwError("Passwords do not match."); return; }
    setPwLoading(true);
    try {
      await resetUserPassword(pwTarget.id, pw1);
      flash(`Password reset for ${pwTarget.username}.`);
      setPwTarget(null);
    } catch (err) {
      setPwError(err.response?.data?.detail || "Unable to reset password");
    } finally {
      setPwLoading(false);
    }
  }

  /* ── Delete ──────────────────────────────────────────── */
  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.username}"?\n\nThis cannot be undone.`)) return;
    try {
      await deleteUser(user.id);
      flash(`User "${user.username}" deleted.`);
      loadUsers();
    } catch (err) {
      flash(err.response?.data?.detail || "Unable to delete user", "error");
    }
  }

  /* ── Render ──────────────────────────────────────────── */
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1>Users</h1>
          <p style={{ color: "var(--text-muted, #777)", fontSize: "0.85rem", marginTop: 4 }}>
            Manage Jeeva Fitness staff and administrator accounts.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowCreate(!showCreate); setCreateError(""); }}>
          + Create User
        </button>
      </div>

      {error   && <div className="alert alert-error"   style={{ marginBottom: 16 }}>{error}</div>}
      {success && <div className="alert alert-success" style={{ marginBottom: 16 }}>{success}</div>}

      {/* ── Create form ─────────────────────────────────── */}
      {showCreate && (
        <div className="card" style={{ marginBottom: 24 }}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Create User</h2>
          {createError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{createError}</div>}
          <form onSubmit={handleCreate}>
            <div className="form-row">
              <div className="form-group">
                <label>Username *</label>
                <input
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                  minLength={3} maxLength={50} required placeholder="e.g. priya"
                />
              </div>
              <div className="form-group">
                <label>Password * (min 6 chars)</label>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  minLength={6} maxLength={100} required placeholder="••••••••"
                />
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="submit" className="btn btn-primary">Create User</button>
              <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Users table ─────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Loading users…</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>No users found.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>Username</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Status</th>
                  <th style={thStyle}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSelf = currentUser?.id === u.id ||
                                 currentUser?.username === u.username;
                  return (
                    <tr key={u.id}>
                      <td style={tdStyle}>
                        <strong>{u.username}</strong>
                        {u.display_name && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{u.display_name}</div>
                        )}
                        {isSelf && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--sage, #5a7a52)", fontWeight: 600 }}>
                            (you)
                          </span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                          background: u.role === "admin" ? "#ede9fe" : "#e0f2fe",
                          color:      u.role === "admin" ? "#6d28d9" : "#0369a1",
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        {u.is_active
                          ? <span style={{ color: "#15803d" }}>● Active</span>
                          : <span style={{ color: "#dc2626" }}>● Inactive</span>}
                      </td>
                      <td style={{ ...tdStyle }}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {/* Edit role */}
                          <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)}>
                            ✏ Edit
                          </button>
                          {/* Toggle active — disabled for self */}
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => toggleActive(u)}
                            disabled={isSelf}
                            title={isSelf ? "Cannot deactivate your own account" : ""}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                          {/* Reset password */}
                          <button className="btn btn-outline btn-sm" onClick={() => openPwReset(u)}>
                            🔑 Password
                          </button>
                          {/* Delete — disabled for self */}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => handleDelete(u)}
                            disabled={isSelf}
                            title={isSelf ? "Cannot delete your own account" : "Delete user"}
                          >
                            Delete
                          </button>
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

      {/* ════════════════════════════════════════════════════
          EDIT USER MODAL
          ════════════════════════════════════════════════════ */}
      {editTarget && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setEditTarget(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2>Edit User</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 18 }}>
              Editing: <strong>{editTarget.username}</strong>
            </p>
            {editError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{editError}</div>}
            <form onSubmit={handleEdit}>
              <div className="form-group">
                <label>Display Name</label>
                <input
                  value={editDispName}
                  onChange={(e) => setEditDispName(e.target.value)}
                  placeholder={`e.g. ${editTarget.username.charAt(0).toUpperCase() + editTarget.username.slice(1)} Kumar`}
                  maxLength={100}
                />
                <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: 3 }}>
                  Username <strong>{editTarget.username}</strong> stays unchanged — this is the display name only.
                </div>
              </div>
              <div className="form-group">
                <label>Role</label>
                <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  <option value="staff">Staff</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setEditTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          RESET PASSWORD MODAL
          ════════════════════════════════════════════════════ */}
      {pwTarget && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setPwTarget(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h2>Reset Password</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 18 }}>
              Resetting password for: <strong>{pwTarget.username}</strong>
            </p>
            {pwError && <div className="alert alert-error" style={{ marginBottom: 12 }}>{pwError}</div>}
            <form onSubmit={handlePwReset}>
              <div className="form-group">
                <label>New Password *</label>
                <div className="password-wrap">
                  <input
                    type={showPw1 ? "text" : "password"}
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    placeholder="Minimum 6 characters"
                    minLength={6} required
                  />
                  <button type="button" className="password-eye" onClick={() => setShowPw1(!showPw1)} tabIndex={-1}>
                    {showPw1
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label>Confirm Password *</label>
                <div className="password-wrap">
                  <input
                    type={showPw2 ? "text" : "password"}
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    placeholder="Re-enter password"
                    minLength={6} required
                  />
                  <button type="button" className="password-eye" onClick={() => setShowPw2(!showPw2)} tabIndex={-1}>
                    {showPw2
                      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline" onClick={() => setPwTarget(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={pwLoading}>
                  {pwLoading ? "Saving…" : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
