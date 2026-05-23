import { linkedProjects, labels, requestFields } from "../data/formData";
import { savedSession } from "../services/api";
import { displayValue, normalizeText } from "./formatters";

function createRequestId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `SOL-${date}-${suffix}`;
}

function createAuditId() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `ALT-${date}-${suffix}`;
}

export function findLinkedProject(idFiotec) {
  const id = normalizeText(idFiotec).toUpperCase();
  return linkedProjects.find((project) => project.idFiotec.toUpperCase() === id);
}

export function buildRequestObject(form, existingRequest) {
  const now = new Date();
  const project = findLinkedProject(form.idFiotec);
  if (!project) throw new Error("Projeto não localizado. Confira o ID FIOTEC.");

  const data = { ...form };
  Object.keys(data).forEach((key) => {
    if (typeof data[key] === "string") data[key] = normalizeText(data[key]);
  });

  if (data.solicitarAluguelCarro !== "SIM") {
    data.categoriaVeiculo = "";
    data.tipoCambio = "";
    data.numeroPortas = "";
    data.arCondicionado = "";
    data.localRetiradaDevolucao = "";
    data.cnhPdf = null;
  }

  data.id = existingRequest?.id || createRequestId();
  data.status = existingRequest?.status || "Recebida";
  data.createdAt = existingRequest?.createdAt || now.toISOString();
  data.createdAtClient = existingRequest?.createdAtClient || now.toLocaleString("pt-BR");
  data.createdAtIso = existingRequest?.createdAtIso || data.createdAt;
  data.updatedAt = existingRequest ? now.toISOString() : "";
  data.updatedAtClient = existingRequest ? now.toLocaleString("pt-BR") : "";
  data.coordenador = project.coordenador;
  data.setorFiocruz = project.setorFiocruz;
  data.projetoVinculado = project;
  return data;
}

function auditTitle(data) {
  return (
    normalizeText(data.nomeCompleto) ||
    normalizeText(data.nomeEvento) ||
    "Solicitação sem título"
  );
}

function buildAuditEntry(data, overrides = {}) {
  const id = createAuditId();
  const now = new Date();
  return {
    id,
    titulo: auditTitle(data),
    idAlteracao: id,
    idChamado: data.id,
    tipoAlteracao: "EDIÇÃO",
    motivoAlteracao: "Formulário atualizado",
    dataAlteracao: now.toISOString(),
    dataAlteracaoClient: now.toLocaleString("pt-BR"),
    campoAlterado: "-",
    alteradoPor: savedSession().login || "usuário do formulário",
    valorOriginal: "-",
    valorNovo: "-",
    origem: "Formulário",
    observacao: "Registro automático do sistema.",
    ...overrides,
  };
}

export function buildCreationAudit(data) {
  return [
    buildAuditEntry(data, {
      tipoAlteracao: "CRIAÇÃO",
      motivoAlteracao: "Novo formulário enviado",
      campoAlterado: "Formulário",
      valorNovo: data.status || "Recebida",
      origem: "Formulário público",
      observacao:
        "Nova solicitação disponível para todos os usuários administrativos.",
    }),
  ];
}

export function buildChangeAuditLogs(previous, next) {
  const ignored = new Set([
    "id",
    "createdAt",
    "createdAtClient",
    "createdAtIso",
    "updatedAt",
    "updatedAtClient",
    "status",
    "projetoVinculado",
  ]);

  return requestFields
    .filter(
      (field) =>
        !ignored.has(field) &&
        normalizeText(displayValue(field, previous)) !==
          normalizeText(displayValue(field, next)),
    )
    .map((field) =>
      buildAuditEntry(next, {
        campoAlterado: labels[field] || field,
        valorOriginal: displayValue(field, previous),
        valorNovo: displayValue(field, next),
        origem: "Edição de formulário",
        observacao: "Alteração registrada automaticamente ao salvar a edição.",
      }),
    );
}
