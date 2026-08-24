import API from "./axios";

export const getDashboard = () => API.get("/dashboard/");
