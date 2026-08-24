import API from "./axios";

export const getMembers         = (params = "")  => API.get(`/members/${params}`);
export const getInactiveMembers = ()             => API.get("/members/inactive");
export const getExpiringMembers = (days = 7)     => API.get(`/members/expiring?days=${days}`);
export const getExpiredMembers  = ()             => API.get("/members/expired");
export const searchMembers      = (q)            => API.get(`/members/search?q=${encodeURIComponent(q)}`);
export const getMember          = (id)           => API.get(`/members/${id}`);
export const createMember       = (data)         => API.post("/members/", data);
export const updateMember       = (id, data)     => API.put(`/members/${id}`, data);
export const deleteMember       = (id)           => API.delete(`/members/${id}`);
export const permanentlyDeleteMember = (id)      => API.delete(`/members/${id}/permanent`);
export const toggleMemberStatus = (id)           => API.patch(`/members/${id}/status`);
