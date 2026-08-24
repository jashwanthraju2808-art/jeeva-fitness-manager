import API from "./axios";

/**
 * All export functions return a Blob response.
 * Use triggerDownload() helper below to save the file.
 */

export function triggerDownload(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href  = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const exportMembers = (params = {}) =>
  API.get("/export/members", { params, responseType: "blob" });

export const exportPayments = (params = {}) =>
  API.get("/export/payments", { params, responseType: "blob" });

export const exportAttendance = (params = {}) =>
  API.get("/export/attendance", { params, responseType: "blob" });

/** Admin only */
export const exportUsers = () =>
  API.get("/export/users", { responseType: "blob" });

/** Admin only */
export const exportAuditLogs = () =>
  API.get("/export/audit-logs", { responseType: "blob" });
