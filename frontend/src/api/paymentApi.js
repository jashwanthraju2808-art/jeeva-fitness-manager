import API from "./axios";

export const getPayments         = ()           => API.get("/payments/");
export const getPaymentsByMember = (id)         => API.get(`/payments/member/${id}`);
export const getPaymentsByMonth  = (month)      => API.get(`/payments/month/${month}`);
export const createPayment       = (data)       => API.post("/payments/", data);
export const updatePayment       = (id, data)   => API.put(`/payments/${id}`, data);
export const deletePayment       = (id)         => API.delete(`/payments/${id}`);
export const updatePaymentStatus = (id, status) => API.patch(`/payments/${id}/status`, { status });
