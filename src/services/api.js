import { API_BASE, DEFAULT_ADMIN_CREDENTIALS } from "../config/appConfig";
import { STORAGE_KEYS } from "../config/storageKeys";
import {
  firebaseApiRequest,
  shouldUseFirebaseDirect,
} from "./firebaseApi";
import { readJSON, removeStorage, writeJSON } from "./storage";

export function savedSession() {
  return readJSON(STORAGE_KEYS.session, {});
}

export function clearSession() {
  removeStorage(STORAGE_KEYS.session);
}

export function saveSession(payload) {
  writeJSON(STORAGE_KEYS.session, {
    login: payload.user.login,
    token: payload.token,
    expiresAt: payload.expiresAt,
    loggedAt: new Date().toISOString(),
  });
}

export async function apiRequest(path, options = {}) {
  if (shouldUseFirebaseDirect(API_BASE)) {
    return firebaseApiRequest(path, options);
  }

  const token = savedSession().token;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch {
    if (shouldUseFirebaseDirect("/api")) {
      return firebaseApiRequest(path, options);
    }
    throw new Error("Backend indisponivel. Inicie o servidor com `npm run dev:api` e tente novamente.");
  }
  const payload = await response.json().catch(() => ({}));
  if (response.status === 404 && shouldUseFirebaseDirect("/api")) {
    return firebaseApiRequest(path, options);
  }
  if (!response.ok) {
    throw new Error(payload.error || "Erro ao acessar o backend.");
  }
  return payload;
}

export async function loginAdmin(login, password) {
  const payload = await apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ login, password }),
  });
  saveSession(payload);
  return payload.user;
}

export async function validateSession() {
  const session = savedSession();
  if (!session.token) return null;
  if (session.expiresAt && Number(session.expiresAt) <= Date.now()) {
    clearSession();
    return null;
  }

  try {
    const payload = await apiRequest("/auth/me");
    return payload.user;
  } catch {
    clearSession();
    return null;
  }
}

export async function ensureDefaultAdminSession() {
  const currentUser = await validateSession();
  if (currentUser) return currentUser;

  try {
    return await loginAdmin(
      DEFAULT_ADMIN_CREDENTIALS.login,
      DEFAULT_ADMIN_CREDENTIALS.password,
    );
  } catch {
    clearSession();
    return null;
  }
}

export async function logoutAdmin() {
  await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
  clearSession();
}
