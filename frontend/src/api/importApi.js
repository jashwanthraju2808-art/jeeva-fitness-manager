import API from "./axios";

/** Download the sample member import .xlsx template (admin only). */
export const downloadMemberTemplate = () =>
  API.get("/import/members/template", { responseType: "blob" });

/**
 * Validate an .xlsx file without committing to the database.
 * @param {File} file — the .xlsx file object
 * @returns preview with row-level errors
 */
export const validateMemberImport = (file) => {
  const form = new FormData();
  form.append("file", file);
  return API.post("/import/members/validate", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

/**
 * Commit a validated member import.
 * @param {File} file — the .xlsx file object
 * @param {boolean} updateExisting — update existing members if phone matches
 */
export const commitMemberImport = (file, updateExisting = true) => {
  const form = new FormData();
  form.append("file", file);
  return API.post(`/import/members?update_existing=${updateExisting}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};
