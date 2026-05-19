import { API_BASE } from "../config/appConfig";
import { STORAGE_KEYS } from "../config/storageKeys";
import { canUseFirebaseRest, firebaseApiRequest } from "./firebaseRest";
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

function shouldUseFirebaseFallback(path) {
  return canUseFirebaseRest() && !path.startsWith("/auth/");
}

export async function apiRequest(path, options = {}) {
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
    if (canUseFirebaseRest()) return firebaseApiRequest(path, options);
    throw new Error("Backend indisponível. Inicie o servidor com `npm run dev:api` e tente novamente.");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (shouldUseFirebaseFallback(path)) return firebaseApiRequest(path, options);
    throw new Error(payload.error || "Erro ao acessar o backend.");
  }
  return payload;
}

export async function loginAdmin(login, password) {
  try {
    const payload = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    });
    saveSession(payload);
    return payload.user;
  } catch (error) {
    if (!canUseFirebaseRest()) throw error;
    if (login !== "admin" || password !== "123456") {
      throw new Error("Login ou senha inválidos.", { cause: error });
    }
    const payload = {
      token: "firebase-rest-session",
      expiresAt: Date.now() + 8 * 60 * 60 * 1000,
      user: { login: "admin" },
    };
    saveSession(payload);
    return payload.user;
  }
}

export async function validateSession() {
  const session = savedSession();
  if (!session.token) return null;
  if (session.expiresAt && Number(session.expiresAt) <= Date.now()) {
    clearSession();
    return null;
  }

  try {
    if (session.token === "firebase-rest-session" && canUseFirebaseRest()) {
      return { login: session.login || "admin" };
    }
    const payload = await apiRequest("/auth/me");
    return payload.user;
  } catch {
    clearSession();
    return null;
  }
}

export async function logoutAdmin() {
  await apiRequest("/auth/logout", { method: "POST" }).catch(() => {});
  clearSession();
}
