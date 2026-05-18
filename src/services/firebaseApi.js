import { DEFAULT_ADMIN_CREDENTIALS } from "../config/appConfig";
import { FIREBASE_CONFIG, FIRESTORE_COLLECTIONS } from "../config/firebaseConfig";
import { STORAGE_KEYS } from "../config/storageKeys";
import { readJSON } from "./storage";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_BITS = 256;

export function canUseFirebaseDirect() {
  return Boolean(
    FIREBASE_CONFIG.enabled &&
      FIREBASE_CONFIG.apiKey &&
      FIREBASE_CONFIG.projectId &&
      window.crypto?.subtle,
  );
}

export function shouldUseFirebaseDirect(apiBase) {
  if (!canUseFirebaseDirect()) return false;
  if (apiBase === "firebase") return true;
  if (apiBase && apiBase !== "/api") return false;
  return window.location.hostname.endsWith("github.io");
}

export async function firebaseApiRequest(path, options = {}) {
  const requestUrl = new URL(path, "https://firebase.local");
  const collection = collectionNameFromPath(requestUrl.pathname);

  if (requestUrl.pathname === "/health") {
    return {
      ok: true,
      mode: "firebase-direct",
      database: "firestore",
      projectId: FIREBASE_CONFIG.projectId,
      collections: FIRESTORE_COLLECTIONS,
      warning: "",
    };
  }

  if (requestUrl.pathname === "/auth/login" && method(options) === "POST") {
    return login(await requestBody(options));
  }

  if (requestUrl.pathname === "/auth/me" && method(options) === "GET") {
    const session = await activeSession();
    return {
      user: { login: session.login },
      expiresAt: session.expiresAt,
    };
  }

  if (requestUrl.pathname === "/auth/logout" && method(options) === "POST") {
    const session = readSession();
    if (session.token) await deleteDocument("sessions", session.token);
    return { ok: true };
  }

  if (requestUrl.pathname === "/admins" && method(options) === "GET") {
    await activeSession();
    const admins = await readCollection("admins");
    return { data: admins.map(publicAdmin) };
  }

  if (requestUrl.pathname === "/admins" && method(options) === "POST") {
    await activeSession();
    const body = await requestBody(options);
    const admin = await createAdmin(body.login, body.password);
    return { user: publicAdmin(admin) };
  }

  if (requestUrl.pathname === "/dashboard/resumo" && method(options) === "GET") {
    await activeSession();
    const rows = await readCollection("solicitacoes");
    return { data: dashboardSummary(rows) };
  }

  if (!collection) {
    throw new Error("Rota nao encontrada no Firebase.");
  }

  const id = idFromPath(requestUrl.pathname, collection);
  const requestMethod = method(options);

  if (requestMethod === "GET" && !id) {
    await activeSession();
    const rows = sortRows(await readCollection(collection), requestUrl.searchParams);
    return { data: rows };
  }

  if (requestMethod === "GET" && id) {
    const row = await readDocument(collection, id);
    if (!row) throw new Error("Registro nao encontrado.");
    return { data: row };
  }

  if ((requestMethod === "POST" && !id) || (requestMethod === "PUT" && id)) {
    const body = await requestBody(options);
    const rowId = id || body.id || crypto.randomUUID();
    const previous = await readDocument(collection, rowId);
    const row = normalizeSavedRow(collection, { ...body, id: rowId }, previous);
    await writeDocument(collection, rowId, row);

    if (collection === "solicitacoes") {
      const statusAudit = buildStatusAudit(previous, row);
      if (statusAudit) {
        await writeDocument("alteracoes", statusAudit.id, statusAudit);
      }
    }

    return {
      data: row,
      database: "firestore",
      projectId: FIREBASE_CONFIG.projectId,
      collections: FIRESTORE_COLLECTIONS,
      warning: "",
    };
  }

  if (requestMethod === "DELETE" && id) {
    await activeSession();
    const exists = Boolean(await readDocument(collection, id));
    if (exists) await deleteDocument(collection, id);
    return { deleted: exists };
  }

  throw new Error("Metodo nao permitido no Firebase.");
}

function method(options) {
  return String(options.method || "GET").toUpperCase();
}

async function requestBody(options) {
  if (!options.body) return {};
  return typeof options.body === "string" ? JSON.parse(options.body) : options.body;
}

function collectionNameFromPath(pathname) {
  if (pathname.startsWith("/solicitacoes")) return "solicitacoes";
  if (pathname.startsWith("/alteracoes")) return "alteracoes";
  return null;
}

function idFromPath(pathname, collection) {
  const prefix = `/${collection}`;
  const id = pathname.slice(prefix.length).replace(/^\/+/, "");
  return id ? decodeURIComponent(id) : "";
}

function firestoreCollection(collection) {
  return FIRESTORE_COLLECTIONS[collection] || collection;
}

function firestoreDocumentPath(...segments) {
  return segments.map((segment) => encodeURIComponent(String(segment))).join("/");
}

function firestoreBaseUrl() {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    FIREBASE_CONFIG.projectId,
  )}/databases/(default)/documents`;
}

async function firestoreRequest(methodName, documentPath = "", body, params = {}) {
  const query = new URLSearchParams({
    key: FIREBASE_CONFIG.apiKey,
    ...params,
  });
  const url = `${firestoreBaseUrl()}${
    documentPath ? `/${documentPath}` : ""
  }?${query.toString()}`;

  const response = await fetch(url, {
    method: methodName,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(payload?.error?.message || "Erro ao acessar o Firebase.");
  }

  return payload;
}

async function readCollection(collection) {
  const firestoreName = firestoreCollection(collection);
  const rows = [];
  let pageToken = "";

  do {
    const payload = await firestoreRequest(
      "GET",
      firestoreDocumentPath(firestoreName),
      null,
      {
        pageSize: "1000",
        ...(pageToken ? { pageToken } : {}),
      },
    );
    if (!payload) return rows;

    rows.push(
      ...(payload.documents || []).map((document) => {
        const id = document.name.split("/").pop();
        return { id, ...fromFirestoreFields(document.fields || {}) };
      }),
    );
    pageToken = payload.nextPageToken || "";
  } while (pageToken);

  return rows;
}

async function readDocument(collection, id) {
  const payload = await firestoreRequest(
    "GET",
    firestoreDocumentPath(firestoreCollection(collection), id),
  );
  if (!payload) return null;
  return { id, ...fromFirestoreFields(payload.fields || {}) };
}

async function writeDocument(collection, id, data) {
  await firestoreRequest(
    "PATCH",
    firestoreDocumentPath(firestoreCollection(collection), id),
    { fields: toFirestoreFields({ ...data, id }) },
  );
}

async function deleteDocument(collection, id) {
  await firestoreRequest(
    "DELETE",
    firestoreDocumentPath(firestoreCollection(collection), id),
  );
}

function toFirestoreFields(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, toFirestoreValue(value)]),
  );
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return {
      arrayValue: {
        ...(value.length ? { values: value.map(toFirestoreValue) } : {}),
      },
    };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  }
  if (typeof value === "object") {
    return { mapValue: { fields: toFirestoreFields(value) } };
  }
  return { stringValue: String(value) };
}

function fromFirestoreFields(fields = {}) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  );
}

function fromFirestoreValue(value = {}) {
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "booleanValue")) return value.booleanValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (Object.hasOwn(value, "arrayValue")) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }
  if (Object.hasOwn(value, "mapValue")) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }
  return value.stringValue || "";
}

function readSession() {
  return readJSON(STORAGE_KEYS.session, {});
}

async function activeSession() {
  const session = readSession();
  if (!session.token || Number(session.expiresAt || 0) <= Date.now()) {
    throw new Error("Sessao expirada. Faca login novamente.");
  }
  return session;
}

async function login(body) {
  const cleanLogin = normalizeLogin(body.login);
  const admins = await readCollection("admins");
  const user = admins.find((admin) => normalizeLogin(admin.login) === cleanLogin);
  const valid = user
    ? await verifyPassword(body.password, user.passwordHash)
    : cleanLogin === DEFAULT_ADMIN_CREDENTIALS.login &&
      String(body.password) === DEFAULT_ADMIN_CREDENTIALS.password;

  if (!valid) throw new Error("Login ou senha invalidos.");

  const session = {
    token: crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, ""),
    login: cleanLogin,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
  await writeDocument("sessions", session.token, session);

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    user: publicAdmin(user || { id: "default-admin", login: cleanLogin, createdAt: "padrao" }),
  };
}

async function createAdmin(login, password) {
  const cleanLogin = normalizeLogin(login);
  const cleanPassword = String(password || "").trim();
  if (!cleanLogin) throw new Error("Informe um login.");
  if (cleanPassword.length < 6) {
    throw new Error("A senha precisa ter pelo menos 6 caracteres.");
  }

  const admins = await readCollection("admins");
  if (admins.some((admin) => normalizeLogin(admin.login) === cleanLogin)) {
    throw new Error("Este login ja esta cadastrado.");
  }

  const admin = {
    id: crypto.randomUUID(),
    login: cleanLogin,
    passwordHash: await hashPassword(cleanPassword),
    createdAt: new Date().toLocaleString("pt-BR"),
  };
  await writeDocument("admins", admin.id, admin);
  return admin;
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    login: admin.login,
    createdAt: admin.createdAt,
  };
}

async function hashPassword(password, salt = randomHex(16)) {
  const hash = await pbkdf2Hex(password, salt);
  return `${salt}:${hash}`;
}

async function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;
  const candidate = await pbkdf2Hex(password, salt);
  return timingSafeEqualHex(hash, candidate);
}

async function pbkdf2Hex(password, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    keyMaterial,
    PASSWORD_KEY_BITS,
  );
  return bytesToHex(new Uint8Array(bits));
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedFilterText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function sortRows(rows, query) {
  const sortField = query.get("sort") || "createdAt";
  const direction = query.get("order") === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      String(a[sortField] || "").localeCompare(String(b[sortField] || "")) *
      direction,
  );
}

function normalizeSavedRow(collection, row, previous) {
  if (collection !== "solicitacoes") return row;

  const now = new Date();
  return {
    ...row,
    status: row.status || "Recebida",
    createdAt: previous?.createdAt || row.createdAt || now.toISOString(),
    createdAtIso: previous?.createdAtIso || row.createdAtIso || row.createdAt || now.toISOString(),
    createdAtClient:
      previous?.createdAtClient || row.createdAtClient || now.toLocaleString("pt-BR"),
    updatedAt: previous ? row.updatedAt || now.toISOString() : row.updatedAt || "",
    updatedAtClient: previous
      ? row.updatedAtClient || now.toLocaleString("pt-BR")
      : row.updatedAtClient || "",
  };
}

function buildStatusAudit(previous, next) {
  if (!previous || previous.status === next.status) return null;
  const now = new Date();
  const id = `ALT-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${crypto
    .randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  return {
    id,
    titulo: next.nomeCompleto || next.nomeEvento || "Solicitacao sem titulo",
    idAlteracao: id,
    idChamado: next.id,
    tipoAlteracao: "ALTERACAO DE STATUS",
    motivoAlteracao: "Status atualizado no painel administrativo",
    dataAlteracao: now.toISOString(),
    dataAlteracaoClient: now.toLocaleString("pt-BR"),
    campoAlterado: "Status",
    alteradoPor: readSession().login || "sistema",
    valorOriginal: previous.status || "Recebida",
    valorNovo: next.status || "Recebida",
    origem: "Firebase direto",
    observacao: "Registro automatico gerado pelo app estatico.",
  };
}

function parseMoneyValue(value) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function dateValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value) {
  const date = dateValue(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function countBy(rows, getter) {
  return rows.reduce((acc, item) => {
    const key = normalizeText(getter(item)) || "Nao informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function dashboardSummary(rows) {
  const today = new Date().toDateString();
  const total = rows.length;
  const todayRequests = rows.filter((item) => {
    const created = dateValue(item.createdAtIso || item.createdAt);
    return created && created.toDateString() === today;
  });
  const missingFlight = rows.filter(
    (item) =>
      normalizedFilterText(item.necessidade).includes("passagens") &&
      !normalizeText(item.vooIda),
  );
  const missingDailyValue = rows.filter(
    (item) =>
      normalizedFilterText(item.necessarioValorMaximoDiaria) === "sim" &&
      parseMoneyValue(item.valorMaximoDiaria) === 0,
  );
  const pendingIssues = missingFlight.length + missingDailyValue.length;
  const nextEventDays = rows
    .map((item) => daysUntil(item.dataEvento))
    .filter((value) => value !== null && value >= 0)
    .sort((a, b) => a - b)[0];

  return {
    total,
    today: todayRequests.length,
    readiness: total ? Math.max(0, 100 - Math.round((pendingIssues / total) * 100)) : 100,
    pendingIssues,
    nextEventDays: nextEventDays ?? null,
    status: countBy(rows, (item) => item.status || "Recebida"),
    necessidades: countBy(rows, (item) => item.necessidade),
    setores: countBy(rows, (item) => item.setorFiocruz),
    alertas: {
      passagensSemVoo: missingFlight.length,
      diariasSemValor: missingDailyValue.length,
      semSetor: rows.filter((item) => !normalizeText(item.setorFiocruz)).length,
    },
  };
}
