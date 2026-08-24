import API from "./axios";

export const getAttendance       = (params)  => API.get("/attendance/", { params });
export const markAttendance      = (data)    => API.post("/attendance/", data);
export const deleteAttendance    = (id)      => API.delete(`/attendance/${id}`);
export const getAttendanceReport = (month)   => API.get(`/attendance/report?month=${month}`);
