import { useCallback, useEffect, useState } from "react";
import { getAuditLogs, getAuditLogFilters, exportAuditLogs } from "../api/auditLogApi";
import { triggerDownload } from "../api/exportApi";

const PAGE_SIZE = 50;

const thStyle = { textAlign: "left", padding: "12px 14px", borderBottom: "1px solid #e5e7eb", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" };
const tdStyle = { padding: "11px 14px", borderBottom: "1px solid #f1f5f9", fontSize: 13, verticalAlign: "top" };

export default function AuditLogs() {
  const [logs, setLogs]           = useState([]);
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError]         = useState("");

  // Filter state
  const [username, setUsername]   = useState("");
  const [action, setAction]       = useState("");
  const [module, setModule]       = useState("");
  const [search, setSearch]       = useState("");
  const [dateFrom, setDateFrom]   = useState("");
  const [dateTo, setDateTo]       = useState("");

  // Dropdown options
  const [actions, setActions] = useState([]);
  const [modules, setModules] = useState([]);

  // Load filter options once
  useEffect(() => {
    getAuditLogFilters()
      .then((r) => { setActions(r.data.actions); setModules(r.data.modules); })
      .catch(() => {});
  }, []);

  const loadLogs = useCallback(async (pg = 1) => {
    setLoading(true);
    setError("");
    try {
      const params = {
        page, page_size: PAGE_SIZE,
        ...(username  && { username }),
        ...(action    && { action }),
        ...(module    && { module }),
        ...(search    && { search }),
        ...(dateFrom  && { date_from: dateFrom }),
        ...(dateTo    && { date_to: dateTo }),
      };
      params.page = pg;
      const r = await getAuditLogs(params);
      setLogs(r.data.items);
      setTotal(r.data.total);
      setPage(pg);
    } catch (e) {
      setError(e.response?.data?.detail || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [username, action, module, search, dateFrom, dateTo]);

  useEffect(() => { loadLogs(1); }, []); // initial load

  function handleSearch(e) {
    e.preventDefault();
    loadLogs(1);
  }

  function handleClear() {
    setUsername(""); setAction(""); setModule("");
    setSearch(""); setDateFrom(""); setDateTo("");
    // Re-fetch with cleared filters after state settles
    setTimeout(() => loadLogs(1), 0);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params = {
        ...(username  && { username }),
        ...(action    && { action }),
        ...(module    && { module }),
        ...(search    && { search }),
        ...(dateFrom  && { date_from: dateFrom }),
        ...(dateTo    && { date_to: dateTo }),
      };
      const r = await exportAuditLogs(params);
      triggerDownload(r.data, `audit_logs_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch {
      alert("Export failed. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function formatDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }); }
    catch { return iso; }
  }

  function actionBadgeStyle(act) {
    const map = {
      LOGIN:           { bg: "#dcfce7", color: "#15803d" },
      LOGIN_FAILED:    { bg: "#fee2e2", color: "#991b1b" },
      LOGOUT:          { bg: "#f3f4f6", color: "#6b7280" },
      CREATE:          { bg: "#dbeafe", color: "#1d4ed8" },
      UPDATE:          { bg: "#fef3c7", color: "#92400e" },
      DELETE:          { bg: "#fee2e2", color: "#991b1b" },
      DEACTIVATE:      { bg: "#fce7f3", color: "#9d174d" },
      IMPORT:          { bg: "#ede9fe", color: "#5b21b6" },
      EXPORT:          { bg: "#e0f2fe", color: "#0369a1" },
      SEND_REMINDER:   { bg: "#dcfce7", color: "#166534" },
      PASSWORD_CHANGE: { bg: "#fef9c3", color: "#854d0e" },
      PASSWORD_RESET:  { bg: "#fef9c3", color: "#854d0e" },
    };
    return map[act] || { bg: "#f3f4f6", color: "#374151" };
  }

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h1>Audit Logs</h1>
          <p style={{ color: "#777", marginTop: 4 }}>
            Complete record of all system activity. Admin access only.
          </p>
        </div>
        <button
          className="btn btn-primary btn-sm"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? "Exporting…" : "⬇ Export Excel"}
        </button>
      </div>

      {/* Filters */}
      <form
        onSubmit={handleSearch}
        style={{
          background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb",
          padding: 20, marginBottom: 20,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Username</label>
            <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Filter by user…" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Action</label>
            <select value={action} onChange={(e) => setAction(e.target.value)}>
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Module</label>
            <select value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">All modules</option>
              {modules.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>Search description</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>From date</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 4 }}>To date</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
          <button type="submit" className="btn btn-primary btn-sm">🔍 Search</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={handleClear}>✕ Clear</button>
        </div>
      </form>

      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      {/* Summary row */}
      <div style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
        {loading ? "Loading…" : `${total.toLocaleString()} log${total !== 1 ? "s" : ""} found`}
        {totalPages > 1 && ` — page ${page} of ${totalPages}`}
      </div>

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #e5e7eb", overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>Loading audit logs…</div>
        ) : logs.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: "#888" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            No audit logs match the current filters.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th style={thStyle}>Date / Time</th>
                  <th style={thStyle}>Username</th>
                  <th style={thStyle}>Action</th>
                  <th style={thStyle}>Module</th>
                  <th style={{ ...thStyle, width: "40%" }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const badge = actionBadgeStyle(log.action);
                  return (
                    <tr key={log.id} style={{ transition: "background 0.1s" }}>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap", color: "#555" }}>
                        {formatDate(log.created_at)}
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        {log.username || <span style={{ color: "#aaa" }}>—</span>}
                      </td>
                      <td style={tdStyle}>
                        <span style={{
                          padding: "3px 9px", borderRadius: 20,
                          background: badge.bg, color: badge.color,
                          fontSize: 11, fontWeight: 700,
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, color: "#666" }}>{log.module}</td>
                      <td style={{ ...tdStyle, color: "#444", wordBreak: "break-word" }}>
                        {log.description}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 20 }}>
          <button
            className="btn btn-outline btn-sm"
            disabled={page <= 1}
            onClick={() => loadLogs(page - 1)}
          >
            ← Prev
          </button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            const pg = page <= 4 ? i + 1 : page - 3 + i;
            if (pg < 1 || pg > totalPages) return null;
            return (
              <button
                key={pg}
                className={`btn btn-sm ${pg === page ? "btn-primary" : "btn-outline"}`}
                onClick={() => loadLogs(pg)}
              >
                {pg}
              </button>
            );
          })}
          <button
            className="btn btn-outline btn-sm"
            disabled={page >= totalPages}
            onClick={() => loadLogs(page + 1)}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
