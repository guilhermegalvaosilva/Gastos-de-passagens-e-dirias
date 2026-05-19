const COLLECTIONS = {
  solicitacoes: "solicitacoes_passagens_diarias",
  alteracoes: "alteracoes_solicitacoes",
};

function firebaseConfig() {
  return window.FIREBASE_CONFIG?.enabled ? window.FIREBASE_CONFIG : null;
}

function firestoreBaseUrl() {
  const config = firebaseConfig();
  if (!config?.projectId) return "";
  const database = encodeURIComponent("(default)");
  return `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/${database}/documents`;
}

function endpoint(collection, id = "") {
  const config = firebaseConfig();
  const base = firestoreBaseUrl();
  const key = config?.apiKey ? `?key=${encodeURIComponent(config.apiKey)}` : "";
  const encodedId = id ? `/${encodeURIComponent(id)}` : "";
  return `${base}/${collection}${encodedId}${key}`;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toFirestoreValue) } };
  }
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: value } : { doubleValue: value };
  }
  if (typeof value === "object") {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value).map(([key, nestedValue]) => [key, toFirestoreValue(nestedValue)]),
        ),
      },
    };
  }
  return { stringValue: String(value) };
}

function fromFirestoreValue(value) {
  if (!value || "nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) {
    return (value.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ("mapValue" in value) {
    return fromFirestoreFields(value.mapValue.fields || {});
  }
  return null;
}

function toFirestoreDocument(data) {
  return {
    fields: Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, toFirestoreValue(value)]),
    ),
  };
}

function fromFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]),
  );
}

function fromFirestoreDocument(document) {
  const item = fromFirestoreFields(document.fields || {});
  return {
    ...item,
    id: item.id || document.name?.split("/").pop() || "",
  };
}

async function requestFirestore(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Firebase indisponível.");
  }
  return payload;
}

function sortRows(rows, path) {
  const params = new URLSearchParams(path.split("?")[1] || "");
  const sortField = params.get("sort") || "createdAt";
  const direction = params.get("order") === "asc" ? 1 : -1;
  return [...rows].sort(
    (a, b) =>
      String(a[sortField] || "").localeCompare(String(b[sortField] || "")) *
      direction,
  );
}

function parseCollectionPath(path) {
  const cleanPath = path.split("?")[0].replace(/^\/+/, "");
  const [collectionKey, id = ""] = cleanPath.split("/");
  return {
    collection: COLLECTIONS[collectionKey],
    id: decodeURIComponent(id),
  };
}

export function canUseFirebaseRest() {
  const config = firebaseConfig();
  return Boolean(config?.projectId && config?.apiKey);
}

export async function firebaseApiRequest(path, options = {}) {
  if (!canUseFirebaseRest()) {
    throw new Error("Firebase não configurado.");
  }

  if (path === "/health") {
    return {
      ok: true,
      mode: "firebase-rest",
      database: "firestore",
      projectId: firebaseConfig().projectId,
    };
  }

  const { collection, id } = parseCollectionPath(path);
  if (!collection) throw new Error("Rota não disponível no Firebase.");

  const method = options.method || "GET";

  if (method === "GET" && id) {
    const document = await requestFirestore(endpoint(collection, id));
    return { data: fromFirestoreDocument(document), database: "firestore" };
  }

  if (method === "GET") {
    const payload = await requestFirestore(endpoint(collection));
    const rows = (payload.documents || []).map(fromFirestoreDocument);
    return { data: sortRows(rows, path), database: "firestore" };
  }

  if ((method === "PUT" || method === "POST") && id) {
    const body = JSON.parse(options.body || "{}");
    const document = await requestFirestore(endpoint(collection, id), {
      method: "PATCH",
      body: JSON.stringify(toFirestoreDocument({ ...body, id })),
    });
    return { data: fromFirestoreDocument(document), database: "firestore" };
  }

  if (method === "DELETE" && id) {
    await requestFirestore(endpoint(collection, id), { method: "DELETE" });
    return { deleted: true, database: "firestore" };
  }

  throw new Error("Operação não disponível no Firebase.");
}
