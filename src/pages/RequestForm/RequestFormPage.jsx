import { useCallback, useEffect, useMemo, useState } from "react";

import { Message } from "../../components/common/Message";
import {
  FormSection,
  Input,
  Select,
  TextArea,
} from "../../components/form/FormControls";
import { STORAGE_KEYS } from "../../config/storageKeys";
import { blankForm, linkedProjects } from "../../data/formData";
import { apiRequest } from "../../services/api";
import { removeStorage } from "../../services/storage";
import {
  formatCurrencyInput,
  normalizedFilterText,
  parseMoneyValue,
  todayInputValue,
} from "../../utils/formatters";
import { generatePDF } from "../../utils/pdf";
import {
  buildChangeAuditLogs,
  buildCreationAudit,
  buildRequestObject,
  findLinkedProject,
} from "../../utils/requestBuilder";

const PROGRESS_QUESTIONS = [
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
  "necessarioValorMaximoDiaria",
  "valorMaximoDiaria",
];

const TOTAL_FORM_FIELDS = Object.keys(blankForm).length;
const CNH_PDF_MAX_BYTES = 700 * 1024;
const carRentalFields = [
  "categoriaVeiculo",
  "tipoCambio",
  "numeroPortas",
  "arCondicionado",
  "localRetiradaDevolucao",
  "cnhPdf",
];

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidCpf(value) {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length) => {
    const sum = cpf
      .slice(0, length)
      .split("")
      .reduce(
        (total, digit, index) => total + Number(digit) * (length + 1 - index),
        0,
      );
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return (
    calculateDigit(9) === Number(cpf[9]) &&
    calculateDigit(10) === Number(cpf[10])
  );
}

function dateFromInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function ageFromDate(value) {
  const birth = dateFromInput(value);
  if (!birth) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate()))
    age -= 1;
  return age;
}

function isQuestionAnswered(form, field) {
  if (field === "cpf") return Boolean(digitsOnly(form.cpf));
  if (field === "valorMaximoDiaria") {
    if (
      form.necessarioValorMaximoDiaria &&
      form.necessarioValorMaximoDiaria !== "SIM"
    ) {
      return true;
    }
    return Boolean(String(form.valorMaximoDiaria || "").trim());
  }
  return Boolean(String(form[field] || "").trim());
}

function validateForm(form) {
  const errors = [];
  const need = normalizedFilterText(form.necessidade);

  if (!isValidCpf(form.cpf))
    errors.push("Informe um CPF válido com 11 números.");

  const age = ageFromDate(form.dataNascimento);
  if (age === null || age < 16 || age > 120) {
    errors.push("Informe uma data de nascimento válida para o viajante.");
  }

  if (form.dataIda && form.dataVolta && form.dataVolta < form.dataIda) {
    errors.push("A data de volta não pode ser anterior à data de ida.");
  }

  if (form.dataEvento && form.dataIda && form.dataEvento < form.dataIda) {
    errors.push("A data do evento não pode ser anterior à data de ida.");
  }

  if (!findLinkedProject(form.idFiotec)) {
    errors.push("Selecione um ID FIOTEC válido da lista de projetos.");
  }

  if (!digitsOnly(form.banco))
    errors.push("Selecione um banco válido da lista.");
  if (!digitsOnly(form.agencia)) errors.push("Informe uma agência válida.");
  if (!digitsOnly(form.contaCorrente))
    errors.push("Informe uma conta corrente válida.");

  if (need.includes("diaria") && !form.necessarioValorMaximoDiaria) {
    errors.push("Informe se é necessário valor máximo para diária.");
  }

  if (
    form.necessarioValorMaximoDiaria === "SIM" &&
    parseMoneyValue(form.valorMaximoDiaria) <= 0
  ) {
    errors.push("Informe o valor máximo da diária.");
  }

  if (form.solicitarAluguelCarro === "SIM") {
    [
      ["categoriaVeiculo", "categoria do veiculo"],
      ["tipoCambio", "tipo de cambio"],
      ["numeroPortas", "numero de portas"],
      ["arCondicionado", "ar-condicionado"],
      ["localRetiradaDevolucao", "local de retirada e devolucao"],
    ].forEach(([field, label]) => {
      if (!String(form[field] || "").trim()) {
        errors.push(`Informe ${label} para aluguel de carro.`);
      }
    });
  }

  if (form.cnhPdf) {
    if (form.cnhPdf.type !== "application/pdf") {
      errors.push("A copia da CNH precisa estar em PDF.");
    }
    if (Number(form.cnhPdf.size || 0) > CNH_PDF_MAX_BYTES) {
      errors.push("A copia da CNH deve ter no maximo 700 KB.");
    }
  }

  return errors;
}

export function RequestFormPage({ onBack, onConsult }) {
  const [form, setForm] = useState(blankForm);
  const [editing, setEditing] = useState(null);
  const [editId, setEditId] = useState("");
  const [message, setMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [generatePdfOnSubmit, setGeneratePdfOnSubmit] = useState(true);
  const banks = Array.isArray(window.BRAZILIAN_BANKS)
    ? window.BRAZILIAN_BANKS
    : [];
  const today = todayInputValue();
  const selectedProject = useMemo(
    () => findLinkedProject(form.idFiotec),
    [form.idFiotec],
  );
  const completedFields = PROGRESS_QUESTIONS.filter((field) =>
    isQuestionAnswered(form, field),
  ).length;
  const progress = Math.round(
    (completedFields / PROGRESS_QUESTIONS.length) * 100,
  );

  function setField(name, value) {
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === "idFiotec") {
        const project = findLinkedProject(value);
        next.coordenador = project?.coordenador || "";
        next.setorFiocruz = project?.setorFiocruz || "";
      }
      if (name === "necessarioValorMaximoDiaria" && value !== "SIM") {
        next.valorMaximoDiaria = "";
      }
      if (name === "solicitarAluguelCarro" && value !== "SIM") {
        carRentalFields.forEach((field) => {
          next[field] = field === "cnhPdf" ? null : "";
        });
      }
      if (name === "valorMaximoDiaria") {
        next.valorMaximoDiaria = formatCurrencyInput(value);
      }
      return next;
    });
  }

  async function setCnhFile(file) {
    if (!file) {
      setField("cnhPdf", null);
      return;
    }
    if (file.type !== "application/pdf") {
      setMessage({ type: "error", text: "A copia da CNH precisa estar em PDF." });
      return;
    }
    if (file.size > CNH_PDF_MAX_BYTES) {
      setMessage({ type: "error", text: "A copia da CNH deve ter no maximo 700 KB." });
      return;
    }

    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Nao foi possivel ler o PDF da CNH."));
      reader.readAsDataURL(file);
    });

    setField("cnhPdf", {
      name: file.name,
      size: file.size,
      type: file.type,
      dataUrl,
      uploadedAt: new Date().toISOString(),
    });
    setMessage(null);
  }

  const loadForEditById = useCallback(async (id) => {
    try {
      const payload = await apiRequest(
        `/solicitacoes/${encodeURIComponent(id)}`,
      );
      const item = payload.data;
      setEditing(item);
      setForm({ ...blankForm, ...item });
      setEditId(item.id);
      setMessage({
        type: "success",
        text: `Solicitação ${item.id} carregada para edição.`,
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Erro ao carregar solicitação.",
      });
    }
  }, []);

  useEffect(() => {
    const pendingId = window.localStorage.getItem(STORAGE_KEYS.pendingEditId);
    if (!pendingId) return;
    removeStorage(STORAGE_KEYS.pendingEditId);
    void Promise.resolve().then(() => loadForEditById(pendingId));
  }, [loadForEditById]);

  async function submit(event) {
    event.preventDefault();
    if (submitting) return;

    const validationErrors = validateForm(form);
    if (validationErrors.length) {
      setMessage({ type: "error", text: validationErrors.join(" ") });
      return;
    }

    try {
      setSubmitting(true);
      const data = buildRequestObject(form, editing);
      const auditLogs = editing
        ? buildChangeAuditLogs(editing, data)
        : buildCreationAudit(data);

      const savedRequest = await apiRequest(
        `/solicitacoes/${encodeURIComponent(data.id)}`,
        {
          method: "PUT",
          body: JSON.stringify(data),
        },
      );
      await Promise.all(
        auditLogs.map((log) =>
          apiRequest(`/alteracoes/${encodeURIComponent(log.id)}`, {
            method: "PUT",
            body: JSON.stringify(log),
          }),
        ),
      );

      if (generatePdfOnSubmit) generatePDF(data);

      const pdfMessage = generatePdfOnSubmit
        ? " PDF gerado."
        : " PDF não gerado.";
      setMessage({
        type: "success",
        text: editing
          ? `Solicitação atualizada com sucesso. ${auditLogs.length} alteração(ões) registrada(s).${pdfMessage}`
          : `Solicitação enviada com sucesso. ID: ${data.id}.${pdfMessage}`,
      });
      if (!editing && savedRequest.database === "supabase") {
        setMessage({
          type: "success",
          text: `Solicitação enviada com sucesso. ID: ${data.id} | Supabase confirmado.${pdfMessage}`,
        });
      }
      setForm(blankForm);
      setEditing(null);
      setEditId("");
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Erro ao salvar solicitação.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card form-card journey-form-card">
      <div className="form-shell-header">
        <div>
          <span className="section-kicker">Fiocruz Brasília | NUGB</span>
          <h2>Solicitação de viagem</h2>
          <p className="subtitle">
            Registro institucional para passagens, diárias, alterações e
            acompanhamento administrativo.
          </p>
        </div>
        <div className="form-header-actions">
          <button className="btn btn-ghost" type="button" onClick={onConsult}>
            Consultar solicitação
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            Voltar ao início
          </button>
        </div>
      </div>

      <div className="form-step-nav" aria-label="Seções do formulário">
        <span>Evento</span>
        <span>Carro</span>
        <span>Projeto</span>
        <span>Viajante</span>
        <span>Viagem</span>
      </div>

      <form onSubmit={submit}>
        <div className="form-utility-grid">
          <div className="form-status-panel" aria-label="Progresso">
            <div>
              <span>Progresso</span>
              <strong>{progress}% completo</strong>
            </div>
            <div className="form-progress-bar" aria-hidden="true">
              <span style={{ width: `${progress}%` }} />
            </div>
            <small>
              {completedFields} de {PROGRESS_QUESTIONS.length} perguntas
              preenchidas. Formulário com {TOTAL_FORM_FIELDS} campos.
            </small>
          </div>

          <section className="edit-lookup-section">
            <div>
              <span className="section-kicker">Edição</span>
              <h3>Recuperar solicitação</h3>
            </div>
            <div className="edit-lookup-row">
              <label className="search-label" htmlFor="edit-request-id">
                <span>ID da solicitação</span>
                <input
                  id="edit-request-id"
                  value={editId}
                  onChange={(event) => setEditId(event.target.value)}
                  placeholder="Ex.: SOL-20260519-ABC12345"
                />
              </label>
              <button
                type="button"
                disabled={!editId.trim()}
                onClick={() => loadForEditById(editId)}
              >
                Carregar
              </button>
              {editing && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setForm(blankForm);
                    setEditId("");
                  }}
                >
                  Cancelar
                </button>
              )}
            </div>
          </section>
        </div>

        <FormSection number="01" title="Cadastro do evento">
          <Input
            full
            label="Descrição da solicitação"
            name="descricaoSolicitacao"
            value={form.descricaoSolicitacao}
            setField={setField}
            required
          />
          <TextArea
            full
            label="Nome do evento"
            name="nomeEvento"
            value={form.nomeEvento}
            setField={setField}
            required
          />
          <Input
            label="Data do evento"
            name="dataEvento"
            type="date"
            min={today}
            value={form.dataEvento}
            setField={setField}
            required
          />
          <Input
            label="Local de realização"
            name="localEvento"
            value={form.localEvento}
            setField={setField}
            required
          />
          <TextArea
            full
            label="Justificativa"
            name="justificativa"
            value={form.justificativa}
            setField={setField}
            required
          />
        </FormSection>

        <FormSection number="05" title="Aluguel de carro" accent>
          <Select
            label="Solicitar aluguel de carro?"
            name="solicitarAluguelCarro"
            value={form.solicitarAluguelCarro}
            setField={setField}
            options={["SIM", "NAO"]}
          />
          {form.solicitarAluguelCarro === "SIM" && (
            <>
              <Select
                label="Categoria do veiculo"
                name="categoriaVeiculo"
                value={form.categoriaVeiculo}
                setField={setField}
                options={[
                  "Compacto",
                  "Economico",
                  "Especial",
                  "Intermediario",
                  "Minivan",
                  "Superior",
                ]}
                required
              />
              <Select
                label="Tipo de cambio"
                name="tipoCambio"
                value={form.tipoCambio}
                setField={setField}
                options={["Manual", "Automatico"]}
                required
              />
              <Select
                label="Numero de portas"
                name="numeroPortas"
                value={form.numeroPortas}
                setField={setField}
                options={["2", "4"]}
                required
              />
              <Select
                label="Ar-condicionado"
                name="arCondicionado"
                value={form.arCondicionado}
                setField={setField}
                options={["SIM", "NAO"]}
                required
              />
              <Input
                full
                label="Local de retirada e devolucao"
                name="localRetiradaDevolucao"
                value={form.localRetiradaDevolucao}
                setField={setField}
                required
              />
              <div className="form-group full">
                <label htmlFor="cnhPdf">Copia da CNH em PDF</label>
                <input
                  id="cnhPdf"
                  name="cnhPdf"
                  type="file"
                  accept="application/pdf"
                  onChange={(event) => void setCnhFile(event.target.files?.[0])}
                />
                <small className="field-note">
                  Opcional. Envie PDF com ate 700 KB.
                  {form.cnhPdf ? ` Arquivo: ${form.cnhPdf.name}` : ""}
                </small>
                {form.cnhPdf && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setField("cnhPdf", null)}
                  >
                    Remover CNH
                  </button>
                )}
              </div>
            </>
          )}
        </FormSection>

        <FormSection number="02" title="Projeto vinculado" accent>
          <Input
            label="ID FIOTEC"
            name="idFiotec"
            value={form.idFiotec}
            setField={setField}
            list="projectOptions"
            required
          />
          <Input
            label="Projeto ID / Meta"
            name="metaProjeto"
            value={form.metaProjeto}
            setField={setField}
            placeholder="Informe manualmente"
            required
          />
          <Input
            label="Coordenador"
            name="coordenador"
            value={form.coordenador}
            setField={setField}
            readOnly
          />
          <Input
            label="Setor Fiocruz"
            name="setorFiocruz"
            value={form.setorFiocruz}
            setField={setField}
            readOnly
          />
          {selectedProject && (
            <div className="project-summary-card full">
              <span>Projeto vinculado ao ID FIOTEC</span>
              <strong>{form.metaProjeto || "Informe o Projeto ID / Meta"}</strong>
              <small>
                Referência FIOTEC: {selectedProject.projetoId} | {selectedProject.coordenador} |{" "}
                {selectedProject.setorFiocruz}
              </small>
            </div>
          )}
        </FormSection>

        <FormSection number="03" title="Dados do viajante">
          <Input
            full
            label="Nome completo"
            name="nomeCompleto"
            value={form.nomeCompleto}
            setField={setField}
            required
          />
          <Input
            label="Data de nascimento"
            name="dataNascimento"
            type="date"
            max={today}
            value={form.dataNascimento}
            setField={setField}
            required
          />
          <Input
            label="Cargo / Função"
            name="cargoFuncao"
            value={form.cargoFuncao}
            setField={setField}
            required
          />
          <Input
            label="CPF"
            name="cpf"
            value={form.cpf}
            setField={setField}
            maxLength="11"
            pattern="[0-9]{11}"
            inputMode="numeric"
            placeholder="Somente números"
            required
          />
          <Input
            label="Banco"
            name="banco"
            value={form.banco}
            setField={setField}
            list="bankOptions"
            required
          />
          <Input
            label="Agência"
            name="agencia"
            value={form.agencia}
            setField={setField}
            required
          />
          <Input
            label="Conta corrente"
            name="contaCorrente"
            value={form.contaCorrente}
            setField={setField}
            required
          />
        </FormSection>

        <FormSection number="04" title="Dados da viagem">
          <Select
            label="Necessidade"
            name="necessidade"
            value={form.necessidade}
            setField={setField}
            options={["Passagens", "Diárias", "Passagens e Diárias"]}
            required
          />
          <Input
            label="Local de origem"
            name="localOrigem"
            value={form.localOrigem}
            setField={setField}
            required
          />
          <Input
            label="Data de ida"
            name="dataIda"
            type="date"
            min={today}
            value={form.dataIda}
            setField={setField}
            required
          />
          <Select
            label="Horário de ida"
            name="horarioIda"
            value={form.horarioIda}
            setField={setField}
            options={["MANHÃ", "TARDE", "NOITE", "INDIFERENTE"]}
            required
          />
          <Input
            full
            label="Indicação do voo de ida"
            name="vooIda"
            value={form.vooIda}
            setField={setField}
            placeholder="Opcional"
          />
          <Input
            label="Local de destino"
            name="localDestino"
            value={form.localDestino}
            setField={setField}
            required
          />
          <Input
            label="Data de volta"
            name="dataVolta"
            type="date"
            min={today}
            value={form.dataVolta}
            setField={setField}
            required
          />
          <Select
            label="Horário de volta"
            name="horarioVolta"
            value={form.horarioVolta}
            setField={setField}
            options={["MANHÃ", "TARDE", "NOITE", "INDIFERENTE"]}
            required
          />
          <Select
            label="Valor máximo para diária?"
            name="necessarioValorMaximoDiaria"
            value={form.necessarioValorMaximoDiaria}
            setField={setField}
            options={["SIM", "NÃO"]}
          />
          <div className="form-group">
            <label htmlFor="valorMaximoDiaria">Valor máximo da diária</label>
            <div className="money-field">
              <input
                id="valorMaximoDiaria"
                disabled={form.necessarioValorMaximoDiaria !== "SIM"}
                value={form.valorMaximoDiaria}
                onChange={(event) =>
                  setField("valorMaximoDiaria", event.target.value)
                }
                inputMode="numeric"
                placeholder="R$ 0,00"
              />
            </div>
          </div>
        </FormSection>

        <datalist id="projectOptions">
          {linkedProjects.map((project) => (
            <option key={project.idFiotec} value={project.idFiotec}>
              {project.coordenador} - {project.setorFiocruz}
            </option>
          ))}
        </datalist>
        <datalist id="bankOptions">
          {banks.map((bank) => (
            <option
              key={`${bank.code}-${bank.ispb}`}
              value={`${bank.code} - ${bank.name}`}
            />
          ))}
        </datalist>

        <Message message={message} />

        <div className="actions form-actions">
          <div>
            <strong>
              {editing ? "Editando solicitação" : "Pronto para envio"}
            </strong>
            <small>O registro será salvo na base e terá alterações registradas pela API.</small>
          </div>
          <label className="pdf-option">
            <input
              type="checkbox"
              checked={generatePdfOnSubmit}
              onChange={(event) => setGeneratePdfOnSubmit(event.target.checked)}
            />
            <span>Gerar PDF</span>
          </label>
          <button type="submit" disabled={submitting}>
            {submitting
              ? "Enviando..."
              : editing
                ? "Salvar alterações"
                : "Enviar solicitação"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            Voltar
          </button>
        </div>
      </form>
    </section>
  );
}

