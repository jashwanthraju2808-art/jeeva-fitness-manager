import API from "./axios";

export const sendBulkReminders  = (month)          => API.post(`/notifications/whatsapp/reminders${month ? `?month=${month}` : ""}`);
export const sendSingleReminder = (id)              => API.post(`/notifications/whatsapp/reminder/${id}`);
export const sendCustomMessage  = (id, message)     => API.post(`/notifications/whatsapp/send/${id}`, { message });
export const sendPaymentEmail   = (id)              => API.post(`/notifications/email/payment-confirmation/${id}`);

/**
 * List fee notifications.
 * params: { status, due_month, member_id, skip, limit }
 */
export const getNotifications = (params = {}) =>
  API.get("/notifications/", { params });

/** Retry a failed/skipped notification (admin only). */
export const retryNotification = (id) =>
  API.post(`/notifications/${id}/retry`);

/** Delete a notification log entry (admin only). */
export const deleteNotification = (id) =>
  API.delete(`/notifications/${id}`);
