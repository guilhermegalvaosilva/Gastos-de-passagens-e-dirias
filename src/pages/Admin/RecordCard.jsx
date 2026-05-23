import { useState } from "react";

import { labels } from "../../data/formData";
import {
  createdAtDisplay,
  displayValue,
  formatDate,
  visibleMetaProjeto,
} from "../../utils/formatters";
import { generatePDF } from "../../utils/pdf";

const recordGroups = [
  [
    "01. Cadastro do evento",
    [
      "descricaoSolicitacao",
      "nomeEvento",
      "dataEvento",
      "localEvento",
      "justificativa",
    ],
  ],
  ["02. Projeto vinculado", ["idFiotec", "metaProjeto", "coordenador", "setorFiocruz"]],
  [
    "03. Dados do viajante",
    [
      "nomeCompleto",
      "dataNascimento",
      "cargoFuncao",
      "cpf",
      "banco",
      "agencia",
      "contaCorrente",
    ],
  ],
  [
    "04. Dados da viagem",
    [
      "necessidade",
      "localOrigem",
      "dataIda",
      "horarioIda",
      "vooIda",
      "localDestino",
      "dataVolta",
      "horarioVolta",
      "necessarioValorMaximoDiaria",
      "valorMaximoDiaria",
    ],
  ],
  [
    "05. Aluguel de carro",
    [
      "solicitarAluguelCarro",
      "categoriaVeiculo",
      "tipoCambio",
      "numeroPortas",
      "arCondicionado",
      "localRetiradaDevolucao",
      "cnhPdf",
    ],
  ],
];

const formFieldCount = recordGroups.reduce((total, [, fields]) => total + fields.length, 0);

export function RecordCard({ item, onDelete }) {
  const [expanded, setExpanded] = useState(false);
  const title = item.nomeCompleto || item.nomeEvento || "Solicitação sem nome";
  const route =
    item.localOrigem || item.localDestino
      ? `${item.localOrigem || "-"} → ${item.localDestino || "-"}`
      : "Rota não informada";

  return (
    <article className={`record-card ${expanded ? "expanded" : ""}`}>
      <div className="record-card-header">
        <div className="record-main">
          <div className="record-title-row">
            <span className="record-id">{item.id}</span>
            <span className="record-status-badge">{item.status || "Recebida"}</span>
          </div>
          <h4>{title}</h4>
          <small>
            Criada em {createdAtDisplay(item)}
            {item.updatedAtClient ? ` | Atualizada em ${item.updatedAtClient}` : ""}
            {` | ${formFieldCount} campos do formulário`}
          </small>
        </div>
        <div className="record-actions">
          <button type="button" className="btn-secondary" onClick={() => generatePDF(item)}>
            PDF
          </button>
          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("load-form-edit", { detail: item.id }))
            }
          >
            Editar
          </button>
          <button type="button" className="btn-danger" onClick={() => onDelete(item.id)}>
            Apagar
          </button>
          <button
            type="button"
            className="record-toggle"
            aria-label={expanded ? "Recolher detalhes" : "Ver detalhes"}
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          />
        </div>
      </div>

      <div className="record-summary-strip">
        <div>
          <span>Necessidade</span>
          <strong>{item.necessidade || "-"}</strong>
        </div>
        <div>
          <span>Rota</span>
          <strong>{route}</strong>
        </div>
        <div>
          <span>Ida</span>
          <strong>{formatDate(item.dataIda) || "-"}</strong>
        </div>
        <div>
          <span>Projeto</span>
          <strong>{item.idFiotec || visibleMetaProjeto(item.metaProjeto) || "-"}</strong>
        </div>
      </div>

      <div className="record-card-body">
        <div className="record-fields-total">
          <strong>{formFieldCount}</strong>
          <span>campos exibidos nesta solicitação</span>
        </div>
        {recordGroups.map(([groupTitle, fields]) => (
          <div className="record-section" key={groupTitle}>
            <div className="record-section-heading">
              <strong>{groupTitle}</strong>
              <span>{fields.length} campos</span>
            </div>
            <div className="record-fields">
              {fields.map((field) => (
                <div className="record-field" key={field}>
                  <span>{labels[field] || field}</span>
                  <b>{displayValue(field, item)}</b>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
