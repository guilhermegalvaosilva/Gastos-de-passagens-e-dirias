import http from "node:http";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { linkedProjects } from "./src/data/formData.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fsSync.existsSync(envPath)) return;

  const source = fsSync.readFileSync(envPath, "utf8");
  source.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    if (!process.env[key]) process.env[key] = value;
  });
}

loadDotEnv();

const PORT = Number(process.env.PORT || 3002);
const ROOT_DIR = __dirname;
const DIST_DIR = path.join(ROOT_DIR, "dist");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const DB_PATH = path.join(DATA_DIR, "db.json");
const FIREBASE_CONFIG_PATH =
  process.env.FIREBASE_CONFIG_PATH ||
  path.join(ROOT_DIR, "js", "firebase-config.js");
const FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID || "(default)";
const DATA_COLLECTIONS = ["solicitacoes", "alteracoes", "admins", "sessions"];
const PRESERVED_COLLECTIONS = new Set(["solicitacoes", "alteracoes"]);
const FIRESTORE_COLLECTION_NAMES = {
  solicitacoes:
    process.env.FIRESTORE_SOLICITACOES_COLLECTION ||
    "solicitacoes_passagens_diarias",
  alteracoes:
    process.env.FIRESTORE_ALTERACOES_COLLECTION || "alteracoes_solicitacoes",
  admins: process.env.FIRESTORE_ADMINS_COLLECTION || "admins",
  sessions: process.env.FIRESTORE_SESSIONS_COLLECTION || "sessions",
};
const SUPABASE_TABLE_NAMES = {
  solicitacoes: process.env.SUPABASE_SOLICITACOES_TABLE || "solicitacoes",
  alteracoes: process.env.SUPABASE_ALTERACOES_TABLE || "alteracoes",
  admins: process.env.SUPABASE_ADMINS_TABLE || "admins",
  sessions: process.env.SUPABASE_SESSIONS_TABLE || "sessions",
};
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const DEFAULT_ADMIN_LOGIN = process.env.DEFAULT_ADMIN_LOGIN || "admin";
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "123456";
const MAX_BODY_SIZE_BYTES = 1024 * 1024;
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_RATE_LIMIT_ATTEMPTS = 12;
const FIRESTORE_TIMEOUT_MS = 8000;
const SUPABASE_TIMEOUT_MS = 8000;
const loginAttempts = new Map();
let dataStoreState = null;

const REQUEST_STATUS_OPTIONS = [
  "Recebida",
  "Em análise",
  "Pendente",
  "Aprovada",
  "Concluída",
  "Cancelada",
];

const REQUIRED_REQUEST_FIELDS = [
  "descricaoSolicitacao",
  "nomeEvento",
  "dataEvento",
  "localEvento",
  "justificativa",
  "idFiotec",
  "metaProjeto",
  "coordenador",
  "setorFiocruz",
  "nomeCompleto",
  "dataNascimento",
  "cargoFuncao",
  "cpf",
  "banco",
  "agencia",
  "contaCorrente",
  "necessidade",
  "localOrigem",
  "dataIda",
  "horarioIda",
  "localDestino",
  "dataVolta",
  "horarioVolta",
];

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": process.env.CORS_ORIGIN || "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  };
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...securityHeaders(),
    ...corsHeaders(),
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, {
    ...securityHeaders(),
    ...corsHeaders(),
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end(text);
}

class ApiError extends Error {
  constructor(statusCode, message, details = []) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
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

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
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

function isValidDateInput(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && Boolean(dateValue(value));
}

function daysUntil(value) {
  const date = dateValue(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function normalizeStatus(status) {
  return REQUEST_STATUS_OPTIONS.includes(status) ? status : "Recebida";
}

function findLinkedProject(idFiotec) {
  const id = normalizeText(idFiotec).toUpperCase();
  return linkedProjects.find((project) => project.idFiotec.toUpperCase() === id);
}

function isProjectCodeValue(value) {
  return /^\d+\.\d+$/.test(normalizeText(value));
}

function visibleMetaProjeto(value) {
  return normalizeText(value);
}

function publicProject(project) {
  if (!project || typeof project !== "object") return project;
  return {
    idFiotec: project.idFiotec,
    coordenador: project.coordenador,
    setorFiocruz: project.setorFiocruz,
  };
}

function publicRequest(row) {
  return {
    ...row,
    metaProjeto: visibleMetaProjeto(row.metaProjeto),
    projetoVinculado: publicProject(row.projetoVinculado),
  };
}

function publicAuditRow(row) {
  return {
    ...row,
    valorOriginal: isProjectCodeValue(row.valorOriginal) ? "-" : row.valorOriginal,
    valorNovo: isProjectCodeValue(row.valorNovo) ? "-" : row.valorNovo,
  };
}

function publicRows(collection, rows) {
  if (collection === "solicitacoes") return rows.map(publicRequest);
  if (collection === "alteracoes") return rows.map(publicAuditRow);
  return rows;
}

function normalizeLogin(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  const hash = pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString(
    "hex",
  );
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || "").split(":");
  if (!salt || !hash) return false;

  const candidate = hashPassword(password, salt).split(":")[1];
  const hashBuffer = Buffer.from(hash, "hex");
  const candidateBuffer = Buffer.from(candidate, "hex");
  return (
    hashBuffer.length === candidateBuffer.length &&
    timingSafeEqual(hashBuffer, candidateBuffer)
  );
}

function createAdminRecord(
  login,
  password,
  createdAt = new Date().toLocaleString("pt-BR"),
) {
  return {
    id: randomUUID(),
    login: normalizeLogin(login),
    passwordHash: hashPassword(password),
    createdAt,
  };
}

function defaultDb() {
  return {
    solicitacoes: [],
    alteracoes: [],
    admins: [createAdminRecord(DEFAULT_ADMIN_LOGIN, DEFAULT_ADMIN_PASSWORD, "padrao")],
    sessions: [],
  };
}

function parseFirebaseConfigSource(source) {
  const match = source.match(/FIREBASE_CONFIG\s*=\s*({[\s\S]*?});?/);
  if (!match) return null;

  const jsonText = match[1]
    .replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')
    .replace(/,\s*([}\]])/g, "$1");
  return JSON.parse(jsonText);
}

async function loadFirebaseConfig() {
  const config = {
    enabled: process.env.FIREBASE_ENABLED
      ? process.env.FIREBASE_ENABLED !== "false"
      : undefined,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
  };

  try {
    const source = await fs.readFile(FIREBASE_CONFIG_PATH, "utf8");
    Object.assign(config, parseFirebaseConfigSource(source) || {}, {
      ...Object.fromEntries(
        Object.entries(config).filter(([, value]) => value !== undefined),
      ),
    });
  } catch {
    // Environment variables can still provide the Firebase connection in deploys.
  }

  return config;
}

function firebaseConfigReady(config) {
  if (!config || config.enabled === false) return false;
  return ["apiKey", "projectId"].every((key) => {
    const value = String(config[key] || "");
    return value && !value.startsWith("COLE_") && !value.startsWith("SEU_");
  });
}

function firestoreDocumentPath(...segments) {
  return segments.map((segment) => encodeURIComponent(String(segment))).join("/");
}

function firestoreBaseUrl(config) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    config.projectId,
  )}/databases/${encodeURIComponent(FIRESTORE_DATABASE_ID)}/documents`;
}

function firestoreCollectionName(collection) {
  return FIRESTORE_COLLECTION_NAMES[collection] || collection;
}

async function firestoreRequest(config, method, documentPath = "", body, params = {}) {
  const query = new URLSearchParams({
    key: config.apiKey,
    ...params,
  });
  const url = `${firestoreBaseUrl(config)}${
    documentPath ? `/${documentPath}` : ""
  }?${query.toString()}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FIRESTORE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Firestore sem resposta em ${FIRESTORE_TIMEOUT_MS / 1000}s.`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload?.error?.message || `Firestore retornou HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
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

function documentIdForRow(collection, row) {
  if (row.id) return String(row.id);
  if (collection === "sessions" && row.token) return String(row.token);
  if (collection === "admins" && row.login) return String(row.login);
  return randomUUID();
}

function loadSupabaseConfig() {
  const url = String(process.env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";
  const projectId = (() => {
    try {
      return url ? new URL(url).hostname.split(".")[0] : "";
    } catch {
      return "";
    }
  })();
  return {
    url,
    key,
    projectId,
  };
}

function supabaseConfigReady(config) {
  return Boolean(config.url && config.key);
}

function missingSupabaseEnv(config = loadSupabaseConfig()) {
  return [
    ...(config.url ? [] : ["SUPABASE_URL"]),
    ...(config.key ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
  ];
}

function supabaseConfigRequired() {
  return (
    process.env.SUPABASE_LOCAL_FALLBACK === "false" ||
    process.env.NODE_ENV === "production"
  );
}

function supabaseTableName(collection) {
  return SUPABASE_TABLE_NAMES[collection] || collection;
}

function supabaseEndpoint(config, table, query = "") {
  return `${config.url}/rest/v1/${encodeURIComponent(table)}${query}`;
}

async function supabaseRequest(config, method, table, query = "", body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(supabaseEndpoint(config, table, query), {
      method,
      signal: controller.signal,
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation,resolution=merge-duplicates",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Supabase sem resposta em ${SUPABASE_TIMEOUT_MS / 1000}s.`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error_description ||
      `Supabase retornou HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return payload;
}

function rowFromSupabaseRecord(record = {}) {
  return {
    ...(record.data && typeof record.data === "object" ? record.data : {}),
    id: record.id,
  };
}

function createSupabaseStore(config) {
  async function readCollection(collection) {
    const table = supabaseTableName(collection);
    const rows = await supabaseRequest(config, "GET", table, "?select=id,data");
    return Array.isArray(rows) ? rows.map(rowFromSupabaseRecord) : [];
  }

  async function upsertDocument(collection, row) {
    const table = supabaseTableName(collection);
    const id = documentIdForRow(collection, row);
    await supabaseRequest(config, "POST", table, "?on_conflict=id", {
      id,
      data: { ...row, id },
      updated_at: new Date().toISOString(),
    });
  }

  async function deleteDocument(collection, id) {
    const table = supabaseTableName(collection);
    await supabaseRequest(
      config,
      "DELETE",
      table,
      `?id=eq.${encodeURIComponent(id)}`,
    );
  }

  return {
    mode: "supabase",
    projectId: config.projectId,
    collections: SUPABASE_TABLE_NAMES,
    async ping() {
      await readCollection("admins");
    },
    async read() {
      const entries = await Promise.all(
        DATA_COLLECTIONS.map(async (collection) => [
          collection,
          await readCollection(collection),
        ]),
      );
      return Object.fromEntries(entries);
    },
    async write(db) {
      for (const collection of DATA_COLLECTIONS) {
        const nextRows = Array.isArray(db[collection]) ? db[collection] : [];
        const nextIds = new Set(
          nextRows.map((row) => documentIdForRow(collection, row)),
        );
        const currentRows = await readCollection(collection);
        await Promise.all(
          currentRows
            .filter((row) => !nextIds.has(documentIdForRow(collection, row)))
            .map((row) => deleteDocument(collection, documentIdForRow(collection, row))),
        );
        await Promise.all(nextRows.map((row) => upsertDocument(collection, row)));
      }
    },
  };
}

function createFirestoreStore(config) {
  async function readCollection(collection) {
    const firestoreCollection = firestoreCollectionName(collection);
    const rows = [];
    let pageToken = "";
    do {
      const payload = await firestoreRequest(
        config,
        "GET",
        firestoreDocumentPath(firestoreCollection),
        null,
        {
          pageSize: "1000",
          ...(pageToken ? { pageToken } : {}),
        },
      );
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

  async function writeDocument(collection, row) {
    const firestoreCollection = firestoreCollectionName(collection);
    const id = documentIdForRow(collection, row);
    await firestoreRequest(
      config,
      "PATCH",
      firestoreDocumentPath(firestoreCollection, id),
      { fields: toFirestoreFields({ ...row, id }) },
    );
  }

  async function deleteDocument(collection, id) {
    const firestoreCollection = firestoreCollectionName(collection);
    try {
      await firestoreRequest(
        config,
        "DELETE",
        firestoreDocumentPath(firestoreCollection, id),
      );
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  return {
    mode: "firestore",
    projectId: config.projectId,
    collections: FIRESTORE_COLLECTION_NAMES,
    async ping() {
      await readCollection("admins");
    },
    async read() {
      const entries = await Promise.all(
        DATA_COLLECTIONS.map(async (collection) => [
          collection,
          await readCollection(collection),
        ]),
      );
      return Object.fromEntries(entries);
    },
    async write(db) {
      for (const collection of DATA_COLLECTIONS) {
        const nextRows = Array.isArray(db[collection]) ? db[collection] : [];
        if (!PRESERVED_COLLECTIONS.has(collection)) {
          const nextIds = new Set(
            nextRows.map((row) => documentIdForRow(collection, row)),
          );
          const currentRows = await readCollection(collection);
          await Promise.all(
            currentRows
              .filter((row) => !nextIds.has(documentIdForRow(collection, row)))
              .map((row) => deleteDocument(collection, documentIdForRow(collection, row))),
          );
        }
        await Promise.all(nextRows.map((row) => writeDocument(collection, row)));
      }
    },
    async delete(collection, id) {
      await deleteDocument(collection, id);
    },
  };
}

function normalizeDb(db) {
  let changed = false;
  const next = db && typeof db === "object" ? { ...db } : defaultDb();

  if (!Array.isArray(next.solicitacoes)) {
    next.solicitacoes = [];
    changed = true;
  }
  if (!Array.isArray(next.alteracoes)) {
    next.alteracoes = [];
    changed = true;
  }
  if (!Array.isArray(next.admins) || !next.admins.length) {
    next.admins = [
      createAdminRecord(DEFAULT_ADMIN_LOGIN, DEFAULT_ADMIN_PASSWORD, "padrao"),
    ];
    changed = true;
  }
  if (!Array.isArray(next.sessions)) {
    next.sessions = [];
    changed = true;
  }

  next.admins = next.admins.map((admin) => {
    if (admin.passwordHash) return admin;
    changed = true;
    return createAdminRecord(
      admin.login,
      admin.password || DEFAULT_ADMIN_PASSWORD,
      admin.createdAt || new Date().toLocaleString("pt-BR"),
    );
  });
  next.sessions = next.sessions.filter((session) => {
    const valid = Number(session.expiresAt || 0) > Date.now();
    if (!valid) changed = true;
    return valid;
  });

  return { db: next, changed };
}

async function ensureLocalDb() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(defaultDb(), null, 2));
  }
}

async function readLocalDb() {
  await ensureLocalDb();
  const raw = await fs.readFile(DB_PATH, "utf8");
  try {
    return JSON.parse(raw || "{}");
  } catch {
    const backupPath = `${DB_PATH}.corrompido-${Date.now()}.bak`;
    await fs.writeFile(backupPath, raw);
    const db = defaultDb();
    await writeLocalDb(db);
    return db;
  }
}

async function writeLocalDb(db) {
  await ensureLocalDb();
  const tempPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2));
  await fs.rename(tempPath, DB_PATH);
}

const localJsonStore = {
  mode: "local-json",
  async read() {
    return readLocalDb();
  },
  async write(db) {
    await writeLocalDb(db);
  },
  async delete(collection, id) {
    const db = normalizeDb(await readLocalDb()).db;
    db[collection] = (db[collection] || []).filter(
      (item) => String(documentIdForRow(collection, item)) !== String(id),
    );
    await writeLocalDb(db);
  },
};

async function getDataStore() {
  if (dataStoreState) return dataStoreState.store;

  const supabaseConfig = loadSupabaseConfig();
  if (supabaseConfigReady(supabaseConfig)) {
    const supabaseStore = createSupabaseStore(supabaseConfig);
    try {
      await supabaseStore.ping();
      dataStoreState = { store: supabaseStore, warning: "" };
      console.log(`Banco Supabase conectado: ${supabaseConfig.projectId}`);
      return supabaseStore;
    } catch (error) {
      if (process.env.SUPABASE_LOCAL_FALLBACK === "false") throw error;
      const warning = `Supabase indisponível (${error.message}). Usando db.json local.`;
      console.error(warning);
      dataStoreState = { store: localJsonStore, warning };
      return localJsonStore;
    }
  }

  if (supabaseConfigRequired()) {
    const missing = missingSupabaseEnv(supabaseConfig);
    throw new Error(
      `Supabase nao configurado. Variaveis ausentes: ${missing.join(", ")}.`,
    );
  }

  const firebaseConfig = await loadFirebaseConfig();
  if (firebaseConfigReady(firebaseConfig) && process.env.FIREBASE_ENABLED === "true") {
    const firestoreStore = createFirestoreStore(firebaseConfig);
    try {
      await firestoreStore.ping();
      dataStoreState = { store: firestoreStore, warning: "" };
      console.log(`Banco Firebase Firestore conectado: ${firebaseConfig.projectId}`);
      return firestoreStore;
    } catch (error) {
      if (process.env.FIREBASE_LOCAL_FALLBACK === "false") throw error;
      const warning = `Firebase indisponível (${error.message}). Usando db.json local.`;
      console.error(warning);
      dataStoreState = { store: localJsonStore, warning };
      return localJsonStore;
    }
  }

  dataStoreState = { store: localJsonStore, warning: "" };
  return localJsonStore;
}

function dataStoreInfo() {
  const store = dataStoreState?.store;
  return {
    database: store?.mode || "inicializando",
    projectId: store?.projectId || "",
    collections: store?.collections || {},
    warning: dataStoreState?.warning || "",
  };
}

async function readDb() {
  const store = await getDataStore();
  const { db, changed } = normalizeDb(await store.read());
  if (changed) await store.write(db);
  return db;
}

async function writeDb(db) {
  const store = await getDataStore();
  await store.write(normalizeDb(db).db);
}

async function deleteDbRow(collection, id) {
  const store = await getDataStore();
  if (typeof store.delete === "function") {
    await store.delete(collection, id);
    return;
  }
  const db = await readDb();
  db[collection] = (db[collection] || []).filter(
    (item) => String(documentIdForRow(collection, item)) !== String(id),
  );
  await writeDb(db);
}

function publicAdmin(admin) {
  return {
    id: admin.id,
    login: admin.login,
    createdAt: admin.createdAt,
  };
}

function createSession(login) {
  return {
    token: `${randomUUID()}${randomUUID()}`.replace(/-/g, ""),
    login,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_DURATION_MS,
  };
}

function bearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  return type === "Bearer" ? token : "";
}

async function requireAuth(req, res) {
  const token = bearerToken(req);
  const db = await readDb();
  const session = db.sessions.find(
    (item) => item.token === token && Number(item.expiresAt || 0) > Date.now(),
  );
  if (!session) {
    sendJson(res, 401, { error: "Sessão expirada. Faça login novamente." });
    return null;
  }

  const user = db.admins.find(
    (admin) => normalizeLogin(admin.login) === normalizeLogin(session.login),
  );
  if (!user) {
    sendJson(res, 401, { error: "Usuário administrativo não encontrado." });
    return null;
  }
  return { db, user, session };
}

async function optionalAuth(req) {
  const token = bearerToken(req);
  if (!token) return null;
  const db = await readDb();
  const session = db.sessions.find(
    (item) => item.token === token && Number(item.expiresAt || 0) > Date.now(),
  );
  const user = session
    ? db.admins.find(
        (admin) => normalizeLogin(admin.login) === normalizeLogin(session.login),
      )
    : null;
  return user && session ? { db, user, session } : null;
}


function collectionNameFromUrl(pathname) {
  if (pathname.startsWith("/api/solicitacoes")) return "solicitacoes";
  if (pathname.startsWith("/api/alteracoes")) return "alteracoes";
  return null;
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

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_SIZE_BYTES) {
      throw new ApiError(413, "Payload muito grande.");
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "JSON inválido no corpo da requisição.");
  }
}

function requestIdFromPath(pathname, prefix) {
  const id = pathname.slice(prefix.length).replace(/^\/+/, "");
  return id ? decodeURIComponent(id) : "";
}

function assertLoginAllowed(req) {
  const key = req.socket.remoteAddress || "local";
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter(
    (timestamp) => now - timestamp < LOGIN_RATE_LIMIT_WINDOW_MS,
  );
  if (attempts.length >= LOGIN_RATE_LIMIT_ATTEMPTS) {
    throw new ApiError(
      429,
      "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
    );
  }
  attempts.push(now);
  loginAttempts.set(key, attempts);
}

function clearLoginAttempts(req) {
  loginAttempts.delete(req.socket.remoteAddress || "local");
}

function validateRequestPayload(row) {
  const errors = [];
  const missing = REQUIRED_REQUEST_FIELDS.filter((field) => !normalizeText(row[field]));
  if (missing.length) {
    errors.push(`Campos obrigatórios ausentes: ${missing.join(", ")}.`);
  }

  if (digitsOnly(row.cpf).length !== 11) {
    errors.push("CPF precisa ter 11 números.");
  }

  ["dataEvento", "dataNascimento", "dataIda", "dataVolta"].forEach((field) => {
    if (row[field] && !isValidDateInput(row[field])) {
      errors.push(`Data inválida em ${field}.`);
    }
  });

  if (row.dataIda && row.dataVolta && row.dataVolta < row.dataIda) {
    errors.push("A data de volta não pode ser anterior à data de ida.");
  }

  if (row.dataEvento && row.dataIda && row.dataEvento < row.dataIda) {
    errors.push("A data do evento não pode ser anterior à data de ida.");
  }

  if (!findLinkedProject(row.idFiotec)) {
    errors.push("ID FIOTEC não localizado na lista de projetos.");
  }

  if (row.status && !REQUEST_STATUS_OPTIONS.includes(row.status)) {
    errors.push(`Status inválido. Use: ${REQUEST_STATUS_OPTIONS.join(", ")}.`);
  }

  if (
    normalizedFilterText(row.necessarioValorMaximoDiaria) === "sim" &&
    parseMoneyValue(row.valorMaximoDiaria) === 0
  ) {
    errors.push("Informe o valor máximo da diária quando o campo 25 estiver marcado como SIM.");
  }

  if (errors.length) {
    throw new ApiError(422, "Revise os dados da solicitação.", errors);
  }
}

function enrichRequestPayload(row, previous) {
  const now = new Date();
  const project = findLinkedProject(row.idFiotec);
  return {
    ...row,
    status: normalizeStatus(row.status),
    createdAt: previous?.createdAt || row.createdAt || now.toISOString(),
    createdAtIso: previous?.createdAtIso || row.createdAtIso || row.createdAt || now.toISOString(),
    createdAtClient:
      previous?.createdAtClient || row.createdAtClient || now.toLocaleString("pt-BR"),
    updatedAt: previous ? now.toISOString() : row.updatedAt || "",
    updatedAtClient: previous ? now.toLocaleString("pt-BR") : row.updatedAtClient || "",
    coordenador: project?.coordenador || row.coordenador,
    setorFiocruz: project?.setorFiocruz || row.setorFiocruz,
    projetoVinculado: publicProject(project || row.projetoVinculado),
  };
}

function buildStatusAudit(previous, next, authContext) {
  if (!previous || previous.status === next.status) return null;
  const now = new Date();
  const id = `ALT-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
  return {
    id,
    titulo: next.nomeCompleto || next.nomeEvento || "Solicitação sem título",
    idAlteracao: id,
    idChamado: next.id,
    tipoAlteracao: "ALTERAÇÃO DE STATUS",
    motivoAlteracao: "Status atualizado no painel administrativo",
    dataAlteracao: now.toISOString(),
    dataAlteracaoClient: now.toLocaleString("pt-BR"),
    campoAlterado: "Status",
    alteradoPor: authContext?.user?.login || "sistema",
    valorOriginal: previous.status || "Recebida",
    valorNovo: next.status || "Recebida",
    origem: "Backend",
    observacao: "Registro automático gerado pela API.",
  };
}

function countBy(rows, getter) {
  return rows.reduce((acc, item) => {
    const key = normalizeText(getter(item)) || "Não informado";
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

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (url.pathname === "/api/health") {
    await getDataStore();
    sendJson(res, 200, { ok: true, mode: "backend-api", ...dataStoreInfo() });
    return;
  }

  if (url.pathname === "/api/auth/login" && req.method === "POST") {
    assertLoginAllowed(req);
    const body = await readBody(req);
    const db = await readDb();
    const user = db.admins.find(
      (item) =>
        normalizeLogin(item.login) === normalizeLogin(body.login) &&
        verifyPassword(body.password, item.passwordHash),
    );
    if (!user) {
      sendJson(res, 401, { error: "Login ou senha inválidos." });
      return;
    }

    const session = createSession(user.login);
    clearLoginAttempts(req);
    db.sessions.push(session);
    await writeDb(db);
    sendJson(res, 200, {
      token: session.token,
      expiresAt: session.expiresAt,
      user: publicAdmin(user),
    });
    return;
  }

  if (url.pathname === "/api/auth/me" && req.method === "GET") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, {
      user: publicAdmin(authContext.user),
      expiresAt: authContext.session.expiresAt,
    });
    return;
  }

  if (url.pathname === "/api/auth/logout" && req.method === "POST") {
    const token = bearerToken(req);
    const db = await readDb();
    db.sessions = db.sessions.filter((session) => session.token !== token);
    await writeDb(db);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/admins" && req.method === "GET") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, { data: authContext.db.admins.map(publicAdmin) });
    return;
  }

  if (url.pathname === "/api/admins" && req.method === "POST") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;

    const body = await readBody(req);
    const login = normalizeLogin(body.login);
    const password = String(body.password || "").trim();
    if (!login) {
      sendJson(res, 400, { error: "Informe um login." });
      return;
    }
    if (password.length < 6) {
      sendJson(res, 400, { error: "A senha precisa ter pelo menos 6 caracteres." });
      return;
    }
    if (authContext.db.admins.some((admin) => normalizeLogin(admin.login) === login)) {
      sendJson(res, 409, { error: "Este login já está cadastrado." });
      return;
    }

    const user = createAdminRecord(login, password);
    authContext.db.admins.push(user);
    await writeDb(authContext.db);
    sendJson(res, 201, { user: publicAdmin(user) });
    return;
  }

  if (url.pathname === "/api/dashboard/resumo" && req.method === "GET") {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, { data: dashboardSummary(authContext.db.solicitacoes) });
    return;
  }

  if (url.pathname === "/api/public/solicitacoes") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Método não permitido." });
      return;
    }

    const db = await readDb();
    sendJson(res, 200, {
      data: publicRows("solicitacoes", sortRows(db.solicitacoes, url.searchParams)),
    });
    return;
  }

  if (url.pathname === "/api/public/alteracoes") {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Método não permitido." });
      return;
    }

    const db = await readDb();
    sendJson(res, 200, {
      data: publicRows("alteracoes", sortRows(db.alteracoes, url.searchParams)),
    });
    return;
  }

  const publicRequestAuditMatch = url.pathname.match(
    /^\/api\/public\/solicitacoes\/([^/]+)\/alteracoes\/?$/,
  );
  if (publicRequestAuditMatch) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Método não permitido." });
      return;
    }

    const requestId = decodeURIComponent(publicRequestAuditMatch[1]);
    const db = await readDb();
    const rows = db.alteracoes.filter(
      (item) =>
        String(item.idChamado || "").toUpperCase() === requestId.toUpperCase(),
    );
    sendJson(res, 200, {
      data: publicRows("alteracoes", sortRows(rows, url.searchParams)),
    });
    return;
  }

  const requestAuditMatch = url.pathname.match(
    /^\/api\/solicitacoes\/([^/]+)\/alteracoes\/?$/,
  );
  if (requestAuditMatch) {
    if (req.method !== "GET") {
      sendJson(res, 405, { error: "Método não permitido." });
      return;
    }

    const requestId = decodeURIComponent(requestAuditMatch[1]);
    const db = await readDb();
    const rows = db.alteracoes.filter(
      (item) =>
        String(item.idChamado || "").toUpperCase() === requestId.toUpperCase(),
    );
    sendJson(res, 200, {
      data: publicRows("alteracoes", sortRows(rows, url.searchParams)),
    });
    return;
  }

  const collection = collectionNameFromUrl(url.pathname);
  if (!collection) {
    sendJson(res, 404, { error: "Rota não encontrada." });
    return;
  }

  const prefix = `/api/${collection}`;
  const id = requestIdFromPath(url.pathname, prefix);

  if (req.method === "GET" && !id) {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    sendJson(res, 200, {
      data: publicRows(collection, sortRows(authContext.db[collection], url.searchParams)),
    });
    return;
  }

  const db = await readDb();

  if (req.method === "GET" && id) {
    const item = db[collection].find(
      (row) => String(row.id).toUpperCase() === id.toUpperCase(),
    );
    if (!item) {
      sendJson(res, 404, { error: "Registro não encontrado." });
      return;
    }
    sendJson(res, 200, { data: publicRows(collection, [item])[0] });
    return;
  }

  if ((req.method === "POST" && !id) || (req.method === "PUT" && id)) {
    const body = await readBody(req);
    const rowId = id || body.id || randomUUID();
    let row = { ...body, id: rowId };
    const index = db[collection].findIndex((item) => String(item.id) === String(rowId));

    if (collection === "solicitacoes") {
      validateRequestPayload(row);
      const previous = index >= 0 ? db[collection][index] : null;
      row = enrichRequestPayload(row, previous);
      const authContext = await optionalAuth(req);
      const statusAudit = buildStatusAudit(previous, row, authContext);
      if (statusAudit) db.alteracoes.unshift(statusAudit);
    }

    if (collection === "alteracoes") {
      row = {
        ...row,
        dataAlteracao: row.dataAlteracao || new Date().toISOString(),
        dataAlteracaoClient: row.dataAlteracaoClient || new Date().toLocaleString("pt-BR"),
      };
    }

    if (index >= 0) db[collection][index] = row;
    else db[collection].push(row);
    await writeDb(db);
    sendJson(res, index >= 0 ? 200 : 201, {
      data: publicRows(collection, [row])[0],
      ...dataStoreInfo(),
    });
    return;
  }

  if (req.method === "DELETE" && id) {
    const authContext = await requireAuth(req, res);
    if (!authContext) return;
    const existed = authContext.db[collection].some(
      (item) => String(documentIdForRow(collection, item)) === String(id),
    );
    await deleteDbRow(collection, id);
    sendJson(res, 200, { deleted: existed });
    return;
  }

  sendJson(res, 405, { error: "Método não permitido." });
}

function resolveInside(baseDir, requestedPath) {
  const base = path.resolve(baseDir);
  const relative = requestedPath.replace(/^\/+/, "");
  const target = path.resolve(base, relative);
  return target === base || target.startsWith(`${base}${path.sep}`) ? target : null;
}

async function tryServeFile(res, filePath) {
  try {
    const content = await fs.readFile(filePath);
    res.writeHead(200, {
      ...securityHeaders(),
      ...corsHeaders(),
      "Content-Type":
        mimeTypes[path.extname(filePath).toLowerCase()] ||
        "application/octet-stream",
    });
    res.end(content);
    return true;
  } catch {
    return false;
  }
}

async function serveStatic(req, res, url) {
  const requestedPath =
    url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);

  const candidateRoots = [DIST_DIR, PUBLIC_DIR];
  for (const root of candidateRoots) {
    const filePath = resolveInside(root, requestedPath);
    if (filePath && (await tryServeFile(res, filePath))) return;
  }

  if (!path.extname(requestedPath)) {
    const indexPath = resolveInside(DIST_DIR, "/index.html");
    if (indexPath && (await tryServeFile(res, indexPath))) return;
  }

  sendText(
    res,
    404,
    "Arquivo não encontrado. Rode `npm run build` para gerar o frontend em dist/.",
  );
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof ApiError) {
      sendJson(res, error.statusCode, {
        error: error.message,
        ...(error.details?.length ? { details: error.details } : {}),
      });
      return;
    }
    console.error(error);
    if (url?.pathname === "/api/health") {
      sendJson(res, 500, {
        ok: false,
        mode: "backend-api",
        error: error.message || "Erro ao verificar backend.",
        ...dataStoreInfo(),
      });
      return;
    }
    sendJson(res, 500, { error: "Erro interno do servidor." });
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Porta ${PORT} ja esta em uso. Feche o outro backend ou rode com outra porta: PORT=3003 npm run server`,
    );
    process.exit(1);
  }

  console.error("Erro ao iniciar o servidor:", error);
  process.exit(1);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor NUGB rodando em http://localhost:${PORT}`);
});
