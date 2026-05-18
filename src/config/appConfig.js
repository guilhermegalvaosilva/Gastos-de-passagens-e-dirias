export const API_BASE = import.meta.env.VITE_API_BASE || "/api";

export const REQUESTS_PAGE_SIZE = 15;

export const DEFAULT_ADMIN_CREDENTIALS = {
  login: import.meta.env.VITE_DEFAULT_ADMIN_LOGIN || "admin",
  password: import.meta.env.VITE_DEFAULT_ADMIN_PASSWORD || "123456",
};
