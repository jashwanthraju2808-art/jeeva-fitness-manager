import API from "./axios";

/**
 * Get paginated, filtered audit logs (admin only).
 * params: { username, action, module, search, date_from, date_to, page, page_size }
 */
export const getAuditLogs = (params = {}) =>
  API.get("/audit-logs/", { params });

/** Get distinct action/module values for filter dropdowns. */
export const getAuditLogFilters = () =>
  API.get("/audit-logs/filters");

/**
 * Download audit logs as .xlsx.
 * Returns a Blob that can be used with URL.createObjectURL().
 * params: same filters as getAuditLogs
 */
export const exportAuditLogs = (params = {}) =>
  API.get("/audit-logs/export", {
    params,
    responseType: "blob",
  });
