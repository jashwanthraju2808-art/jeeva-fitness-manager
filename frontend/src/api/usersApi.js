import API from "./axios";

export const getUsers = () =>
  API.get("/users/");

export const createUser = (data) =>
  API.post("/users/", data);

export const updateUser = (userId, data) =>
  API.patch(`/users/${userId}`, data);

export const resetUserPassword = (userId, newPassword) =>
  API.post(`/users/${userId}/reset-password`, {
    new_password: newPassword,
  });

export const deleteUser = (userId) =>
  API.delete(`/users/${userId}`);
