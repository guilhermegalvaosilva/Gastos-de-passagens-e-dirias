export function normalizeText(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizedFilterText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function isProjectCodeValue(value) {
  return /^\d+\.\d+$/.test(normalizeText(value));
}

export function visibleMetaProjeto(value) {
  return normalizeText(value);
}

export function formatDate(value) {
  if (!value) return "";
  const parts = String(value).split("-");
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : String(value);
}

export function todayInputValue() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

export function createdAtDisplay(item) {
  return item.createdAtClient || item.createdAtIso || item.createdAt || "-";
}

export function displayValue(key, item) {
  if (key === "createdAt") return createdAtDisplay(item);
  if (key === "metaProjeto") return visibleMetaProjeto(item[key]) || "-";
  if (key === "cnhPdf") {
    const file = item?.cnhPdf;
    if (!file || typeof file !== "object") return "-";
    const size = Number(file.size || 0);
    const sizeLabel = size ? ` (${Math.round(size / 1024)} KB)` : "";
    return `${file.name || "CNH.pdf"}${sizeLabel}`;
  }
  if (["dataEvento", "dataNascimento", "dataIda", "dataVolta"].includes(key)) {
    return formatDate(item[key]) || "-";
  }
  return item[key] || "-";
}

export function formatCurrency(value) {
  const number =
    typeof value === "number"
      ? value
      : Number(
          String(value || "")
            .replace(/[^\d,.-]/g, "")
            .replace(/\./g, "")
            .replace(",", "."),
        );
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(number) ? number : 0);
}

export function formatCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  const amount = Number(digits) / 100;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(amount);
}

export function parseMoneyValue(value) {
  const normalized = String(value || "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function isToday(value) {
  const date = new Date(value);
  const today = new Date();
  return !Number.isNaN(date.getTime()) && date.toDateString() === today.toDateString();
}

export function isEditionAuditLog(log) {
  const type = normalizedFilterText(log.tipoAlteracao);
  const origin = normalizedFilterText(log.origem);
  const reason = normalizedFilterText(log.motivoAlteracao);
  const field = normalizedFilterText(log.campoAlterado);
  const hasChangedValue = Boolean(normalizeText(log.valorOriginal) || normalizeText(log.valorNovo));
  const isCreation =
    type.includes("criacao") ||
    reason.startsWith("novo formulario") ||
    (field === "formulario" && origin.includes("formulario publico"));
  if (isCreation) return false;
  return (
    type.includes("edicao") ||
    type.includes("alteracao") ||
    origin.includes("edicao") ||
    reason.includes("atualizado") ||
    (field && field !== "formulario" && hasChangedValue)
  );
}
