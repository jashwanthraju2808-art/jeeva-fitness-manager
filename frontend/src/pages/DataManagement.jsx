import { useRef, useState } from "react";
import {
  exportMembers, exportPayments, exportAttendance,
  exportUsers, exportAuditLogs, triggerDownload,
} from "../api/exportApi";
import {
  downloadMemberTemplate,
  validateMemberImport,
  commitMemberImport,
} from "../api/importApi";

const today = new Date().toISOString().slice(0, 7); // YYYY-MM

export default function DataManagement() {
  const fileRef = useRef();

  // Export state
  const [exportMonth, setExportMonth] = useState(today);
  const [exportBusy, setExportBusy]   = useState("");
  const [exportMsg, setExportMsg]     = useState("");

  // Import state
  const [selectedFile, setSelectedFile]   = useState(null);
  const [preview, setPreview]             = useState(null);
  const [validating, setValidating]       = useState(false);
  const [committing, setCommitting]       = useState(false);
  const [importResult, setImportResult]   = useState(null);
  const [importError, setImportError]     = useState("");
  const [updateExisting, setUpdateExisting] = useState(true);

  // ── Export helpers ────────────────────────────────────────

  async function doExport(label, apiFn, filename) {
    setExportBusy(label);
    setExportMsg("");
    try {
      const r = await apiFn();
      triggerDownload(r.data, filename);
      setExportMsg(`✅ ${label} exported successfully`);
    } catch (e) {
      const msg = e.response?.data?.detail || e.message || "Export failed";
      setExportMsg(`❌ ${label}: ${msg}`);
    } finally {
      setExportBusy("");
    }
  }

  // ── Import helpers ────────────────────────────────────────

  function handleFileSelect(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setImportError("Only .xlsx files are accepted.");
      return;
    }
    setSelectedFile(f);
    setPreview(null);
    setImportResult(null);
    setImportError("");
  }

  async function handleValidate() {
    if (!selectedFile) return;
    setValidating(true);
    setImportError("");
    setPreview(null);
    try {
      const r = await validateMemberImport(selectedFile);
      setPreview(r.data);
    } catch (e) {
      setImportError(e.response?.data?.detail || "Validation failed");
    } finally {
      setValidating(false);
    }
  }

  async function handleCommit() {
    if (!selectedFile) return;
    setCommitting(true);
    setImportError("");
    setImportResult(null);
    try {
      const r = await commitMemberImport(selectedFile, updateExisting);
      setImportResult(r.data);
      setPreview(null);
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setImportError(e.response?.data?.detail || "Import failed");
    } finally {
      setCommitting(false);
    }
  }

  function handleTemplateDl() {
    downloadMemberTemplate()
      .then((r) => triggerDownload(r.data, "member_import_template.xlsx"))
      .catch(() => alert("Could not download template"));
  }

  const cardStyle = {
    background: "#fff", borderRadius: 12,
    border: "1px solid #e5e7eb", padding: 24,
    marginBottom: 24,
  };

  const exportBtnStyle = (label) => ({
    opacity: exportBusy && exportBusy !== label ? 0.5 : 1,
  });

  return (
    <div className="page">
      <div style={{ marginBottom: 28 }}>
        <h1>Data Management</h1>
        <p style={{ color: "#777" }}>Export data to Excel or import members from a spreadsheet.</p>
      </div>

      {/* ── EXPORT ── */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>📤 Export Data</h2>
        <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
          Download data as .xlsx files. User and Audit Log exports are admin-only.
        </p>

        {exportMsg && (
          <div style={{
            padding: "10px 14px", borderRadius: 8, marginBottom: 16,
            background: exportMsg.startsWith("✅") ? "#f0fdf4" : "#fef2f2",
            color:      exportMsg.startsWith("✅") ? "#166534"  : "#991b1b",
            fontSize: 13,
          }}>
            {exportMsg}
          </div>
        )}

        {/* Month filter for payments/attendance */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <label style={{ fontSize: 13, color: "#555" }}>Month filter (for Payments &amp; Attendance):</label>
          <input
            type="month"
            value={exportMonth}
            onChange={(e) => setExportMonth(e.target.value)}
            style={{ width: 160 }}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
          {[
            { label: "Members",    fn: () => exportMembers({ active_only: false }),                            file: `members_${today}.xlsx` },
            { label: "Payments",   fn: () => exportPayments({ month: exportMonth }),                           file: `payments_${exportMonth}.xlsx` },
            { label: "Attendance", fn: () => exportAttendance({ month: exportMonth }),                         file: `attendance_${exportMonth}.xlsx` },
            { label: "Users",      fn: exportUsers,                                                            file: `users_${today}.xlsx`,      adminOnly: true },
            { label: "Audit Logs", fn: exportAuditLogs,                                                        file: `audit_logs_${today}.xlsx`, adminOnly: true },
          ].map(({ label, fn, file, adminOnly }) => (
            <button
              key={label}
              className="btn btn-outline"
              onClick={() => doExport(label, fn, file)}
              disabled={!!exportBusy}
              style={exportBtnStyle(label)}
            >
              {exportBusy === label ? "Exporting…" : `⬇ ${label}`}
              {adminOnly && <span style={{ fontSize: 10, marginLeft: 6, opacity: 0.7 }}>(admin)</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── IMPORT ── */}
      <div style={cardStyle}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>📥 Import Members</h2>
        <p style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>
          Upload an .xlsx file to bulk-create or update members. Use the template below for the correct format.
        </p>

        <div style={{ marginBottom: 16 }}>
          <button className="btn btn-outline btn-sm" onClick={handleTemplateDl}>
            ⬇ Download Sample Template
          </button>
        </div>

        {importError && (
          <div className="alert alert-error" style={{ marginBottom: 16 }}>{importError}</div>
        )}

        {importResult && (
          <div style={{
            padding: 16, borderRadius: 8, marginBottom: 16,
            background: "#f0fdf4", border: "1px solid #bbf7d0",
          }}>
            <strong style={{ color: "#166534" }}>✅ Import complete</strong>
            <div style={{ marginTop: 8, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 14 }}>
              <span>✅ Created: <strong>{importResult.created}</strong></span>
              <span>🔄 Updated: <strong>{importResult.updated}</strong></span>
              <span>⏭ Skipped: <strong>{importResult.skipped}</strong></span>
              <span>❌ Failed:  <strong>{importResult.failed}</strong></span>
            </div>
            {importResult.errors?.length > 0 && (
              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, color: "#666" }}>
                  View {importResult.errors.length} row error(s)
                </summary>
                <ul style={{ margin: "8px 0 0 16px", fontSize: 12, color: "#666" }}>
                  {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* File picker */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileSelect}
            style={{ flex: 1, minWidth: 200 }}
          />
          <label style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={updateExisting}
              onChange={(e) => setUpdateExisting(e.target.checked)}
            />
            Update existing members (match by phone)
          </label>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-outline"
            onClick={handleValidate}
            disabled={!selectedFile || validating}
          >
            {validating ? "Validating…" : "🔍 Validate File"}
          </button>
          {preview && (
            <button
              className="btn btn-primary"
              onClick={handleCommit}
              disabled={committing || preview.valid_rows === 0}
            >
              {committing
                ? "Importing…"
                : `✅ Confirm Import (${preview.valid_rows} valid rows)`}
            </button>
          )}
        </div>

        {/* Preview table */}
        {preview && (
          <div style={{ marginTop: 24 }}>
            <div style={{ marginBottom: 10, display: "flex", gap: 20, fontSize: 14, flexWrap: "wrap" }}>
              <span style={{ color: "#166534" }}>✅ Valid: {preview.valid_rows}</span>
              <span style={{ color: "#dc2626" }}>❌ Invalid: {preview.invalid_rows}</span>
              <span style={{ color: "#2563eb" }}>➕ Create: {preview.create_count}</span>
              <span style={{ color: "#d97706" }}>🔄 Update: {preview.update_count}</span>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 400, border: "1px solid #e5e7eb", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead style={{ background: "#f8fafc", position: "sticky", top: 0 }}>
                  <tr>
                    {["Row", "Name", "Phone", "Age", "Fee", "Batch", "Action", "Errors"].map((h) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: "left", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.previews.map((r) => (
                    <tr key={r.row} style={{ background: r.valid ? "#fff" : "#fff5f5" }}>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.row}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.first_name} {r.last_name}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.phone_number}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.age}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>₹{r.fee}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>{r.batch_name || "—"}</td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6" }}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 12, fontSize: 11,
                          background: r.action === "create" ? "#dbeafe" : r.action === "update" ? "#fef3c7" : "#f3f4f6",
                          color:      r.action === "create" ? "#1d4ed8" : r.action === "update" ? "#92400e" : "#6b7280",
                          fontWeight: 600,
                        }}>
                          {r.action}
                        </span>
                      </td>
                      <td style={{ padding: "6px 10px", borderBottom: "1px solid #f3f4f6", color: "#dc2626" }}>
                        {r.errors.join("; ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
