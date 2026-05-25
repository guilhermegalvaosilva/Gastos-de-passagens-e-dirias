import { useCallback, useEffect, useMemo, useState } from "react";

import { Message } from "../../components/common/Message";
import { REQUESTS_PAGE_SIZE } from "../../config/appConfig";
import { REQUEST_STATUS_OPTIONS } from "../../config/requestStatus";
import { auditColumns, labels } from "../../data/formData";
import { apiRequest } from "../../services/api";
import {
  createdAtDisplay,
  displayValue,
  formatDate,
  isEditionAuditLog,
  isToday,
  normalizedFilterText,
  visibleMetaProjeto,
} from "../../utils/formatters";
import { generatePDF } from "../../utils/pdf";

const REQUESTS_ENDPOINT = "/public/solicitacoes?sort=createdAt&order=desc";
const ACTIVITY_ENDPOINT = "/public/alteracoes?sort=dataAlteracao&order=desc";

const eventFields = [
  "descricaoSolicitacao",
  "nomeEvento",
  "dataEvento",
  "localEvento",
  "justificativa",
];

const travelerFields = [
  "nomeCompleto",
  "dataNascimento",
  "cargoFuncao",
  "cpf",
  "banco",
  "agencia",
  "contaCorrente",
];

const tripFields = [
  "necessidade",
  "localOrigem",
  "dataIda",
  "horarioIda",
  "vooIda",
  "localDestino",
  "dataVolta",
  "horarioVolta",
  "valorMaximoDiaria",
  "necessarioValorMaximoDiaria",
];

const projectFields = ["idFiotec", "metaProjeto", "coordenador", "setorFiocruz"];

const carRentalFields = [
  "solicitarAluguelCarro",
  "categoriaVeiculo",
  "tipoCambio",
  "numeroPortas",
  "arCondicionado",
  "localRetiradaDevolucao",
  "cnhPdf",
];

function titleFromRequest(item) {
  return item.nomeCompleto || item.nomeEvento || "Solicitação sem nome";
}

function readableRouteFromRequest(item) {
  return item.localOrigem || item.localDestino
    ? `${item.localOrigem || "-"} \u2192 ${item.localDestino || "-"}`
    : "Rota não informada";
}

function isCreation(log) {
  const type = normalizedFilterText(log.tipoAlteracao);
  const reason = normalizedFilterText(log.motivoAlteracao);
  return type.includes("criacao") || reason.includes("novo formulario");
}

function notificationLabel(log) {
  return isCreation(log) ? "Novo formulário" : "Edição";
}

function changePreview(log) {
  const field = log.campoAlterado || "Formulário";
  const original = String(log.valorOriginal || "").trim();
  const next = String(log.valorNovo || "").trim();
  if (!original || original === "-") return `${field}: ${next || "-"}`;
  return `${field}: ${original} → ${next || "-"}`;
}

function DetailField({ field, item }) {
  return (
    <div className="public-detail-field">
      <span>{labels[field] || field}</span>
      <strong>{displayValue(field, item)}</strong>
    </div>
  );
}

function DetailCard({ title, icon, fields, item, className = "" }) {
  return (
    <section className={`public-detail-card ${className}`}>
      <div className="public-detail-card-title">
        <span aria-hidden="true">{icon}</span>
        <h5>{title}</h5>
      </div>
      <div className="public-detail-fields">
        {fields.map((field) => (
          <DetailField key={field} field={field} item={item} />
        ))}
      </div>
    </section>
  );
}

function OverviewCard({ label, value, note, tone = "" }) {
  return (
    <article className={`public-overview-card ${tone}`}>
      <span>{label}</span>
      <strong>{value || "-"}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}

function NotificationMetric({ label, value, note }) {
  return (
    <article className="notification-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function PublicChangesView({ loading, logs }) {
  const editionLogs = logs.filter(isEditionAuditLog);
  const todayLogs = editionLogs.filter((log) => isToday(log.dataAlteracao));

  return (
    <div className="admin-table-panel audit-panel public-activity-panel">
      <div className="panel-heading">
        <div>
          <span className="section-kicker">Alterações registradas</span>
          <h3>Histórico de alterações</h3>
          <p className="table-note">
            Veja o campo alterado, o valor antigo e o valor informado na alteração.
          </p>
        </div>
        <div className="audit-count">
          <strong>{editionLogs.length}</strong>
          <span>{todayLogs.length} hoje</span>
        </div>
      </div>

      {loading && <div className="empty-records">Carregando alterações...</div>}
      {!loading && editionLogs.length ? (
        <div className="audit-table-wrapper">
          <table className="audit-table">
            <thead>
              <tr>
                {auditColumns.map(([, label]) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {editionLogs.map((log) => (
                <tr key={log.id}>
                  {auditColumns.map(([key]) => (
                    <td key={key}>{log[key] || "-"}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {!loading && !editionLogs.length && (
        <div className="empty-records">Nenhuma alteração registrada.</div>
      )}
    </div>
  );
}

function PublicAlertsView({ loading, logs }) {
  const recent = logs.slice(0, 10);
  const creationCount = logs.filter(isCreation).length;
  const editionCount = logs.length - creationCount;
  const latest = logs[0]?.dataAlteracaoClient || "-";

  return (
    <div className="dashboard-card notification-panel public-activity-panel">
      <div className="notification-hero">
        <div>
          <span className="section-kicker">Notificações</span>
          <h3>Alertas recentes</h3>
          <p className="table-note">
            Eventos recentes de criação e edição dos formulários, sem permissão de alteração.
          </p>
        </div>
        <div className="notification-latest">
          <span>Última atualização</span>
          <strong>{latest}</strong>
        </div>
      </div>

      <div className="notification-metric-grid">
        <NotificationMetric
          label="Eventos registrados"
          value={logs.length}
          note="Histórico total disponível."
        />
        <NotificationMetric
          label="Novos formulários"
          value={creationCount}
          note="Solicitações criadas."
        />
        <NotificationMetric
          label="Edições"
          value={editionCount}
          note="Atualizações em registros existentes."
        />
      </div>

      {loading && <div className="empty-records">Carregando alertas...</div>}
      {!loading && (
        <div className="notifications-timeline">
          {recent.length ? (
            recent.map((log) => (
              <article className="notification-event" key={log.id}>
                <div className="notification-marker" aria-hidden="true" />
                <div className="notification-event-content">
                  <div className="notification-event-top">
                    <span className="notification-type">{notificationLabel(log)}</span>
                    <small>{log.dataAlteracaoClient}</small>
                  </div>
                  <strong>{log.titulo || "Registro sem título"}</strong>
                  <p>{changePreview(log)}</p>
                  <span className="notification-author">
                    por {log.alteradoPor || "sistema"}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <div className="empty-records">Ainda não há alertas.</div>
          )}
        </div>
      )}
    </div>
  );
}

function PublicRequestCard({ item }) {
  const [expanded, setExpanded] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [logMessage, setLogMessage] = useState("");

  const loadLogs = useCallback(async (force = false) => {
    if (!force && logsLoaded) return;
    if (loadingLogs) return;
    try {
      setLoadingLogs(true);
      setLogMessage("");
      const payload = await apiRequest(
        `/public/solicitacoes/${encodeURIComponent(
          item.id,
        )}/alteracoes?sort=dataAlteracao&order=desc`,
      );
      setAuditLogs((payload.data || []).filter(isEditionAuditLog));
      setLogsLoaded(true);
    } catch (error) {
      setLogMessage(error.message || "Não foi possível carregar o histórico.");
    } finally {
      setLoadingLogs(false);
    }
  }, [item.id, loadingLogs, logsLoaded]);

  function toggleDetails() {
    const nextExpanded = !expanded;
    setExpanded(nextExpanded);
    if (nextExpanded) void loadLogs(true);
  }

  return (
    <article className={`record-card public-record-card ${expanded ? "expanded" : ""}`}>
      <div className="record-card-header">
        <div className="record-main">
          <div className="record-title-row">
            <span className="record-id">{item.id}</span>
            <span className="record-status-badge">{item.status || "Recebida"}</span>
          </div>
          <h4>{titleFromRequest(item)}</h4>
          <small>
            Criada em {createdAtDisplay(item)}
            {item.updatedAtClient ? ` | Atualizada em ${item.updatedAtClient}` : ""}
          </small>
        </div>
        <div className="record-actions public-record-actions">
          <button
            type="button"
            className="btn-secondary"
            aria-label={`Baixar PDF da solicitação ${item.id}`}
            onClick={() => generatePDF(item)}
          >
            Descarregar PDF
          </button>
          <button
            type="button"
            className="record-toggle record-toggle-text"
            aria-label={expanded ? "Recolher detalhes" : "Ver detalhes"}
            aria-expanded={expanded}
            onClick={toggleDetails}
          >
            {expanded ? "Ocultar detalhes" : "Mais ações"}
          </button>
        </div>
      </div>

      <div className="record-summary-strip">
        <div>
          <span>Necessidade</span>
          <strong>{item.necessidade || "-"}</strong>
        </div>
        <div>
          <span>Rota</span>
          <strong>{readableRouteFromRequest(item)}</strong>
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
        <div className="public-detail-overview">
          <OverviewCard label="Solicitação" value={item.id} note={createdAtDisplay(item)} />
          <OverviewCard
            label="Status"
            value={item.status || "Recebida"}
            note={item.updatedAtClient ? `Atualizada em ${item.updatedAtClient}` : "Sem atualização"}
            tone="success"
          />
          <OverviewCard label="Solicitante" value={item.nomeCompleto} note={item.cpf} />
          <OverviewCard label="Projeto" value={item.idFiotec} note={visibleMetaProjeto(item.metaProjeto)} />
          <OverviewCard
            label="Rota"
            value={readableRouteFromRequest(item)}
            note={`${formatDate(item.dataIda) || "-"} até ${formatDate(item.dataVolta) || "-"}`}
          />
        </div>

        <div className="public-detail-grid">
          <DetailCard title="Dados do evento" icon="01" fields={eventFields} item={item} />
          <DetailCard title="Dados do viajante" icon="02" fields={travelerFields} item={item} />
          <DetailCard title="Dados da viagem" icon="03" fields={tripFields} item={item} />
          <DetailCard title="Projeto vinculado" icon="04" fields={projectFields} item={item} />
          <DetailCard title="Aluguel de carro" icon="05" fields={carRentalFields} item={item} />

        <section className="public-detail-card public-audit-panel">
          <div className="panel-heading public-audit-heading">
            <div>
              <span className="section-kicker">Alterações</span>
              <h3>Alterações feitas</h3>
              <p className="table-note">
                Valor antigo e valor alterado vinculados ao ID desta solicitação.
              </p>
            </div>
            <div className="audit-count">
              <strong>{auditLogs.length}</strong>
              <span>logs</span>
            </div>
          </div>

          {loadingLogs && <div className="empty-records">Carregando alterações...</div>}
          {logMessage && <div className="empty-records">{logMessage}</div>}
          {!loadingLogs && !logMessage && auditLogs.length ? (
            <div className="audit-table-wrapper">
              <table className="audit-table">
                <thead>
                  <tr>
                    {auditColumns.map(([, label]) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      {auditColumns.map(([key]) => (
                        <td key={key}>{log[key] || "-"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {!loadingLogs && !logMessage && !auditLogs.length && (
            <div className="public-empty-audit">
              <div aria-hidden="true">✓</div>
              <strong>Nenhuma alteração registrada</strong>
              <span>para esta solicitação.</span>
            </div>
          )}
        </section>
        </div>
      </div>
    </article>
  );
}

export function PublicRequestsPage({ onBack }) {
  const [activeView, setActiveView] = useState("solicitacoes");
  const [requests, setRequests] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [needFilter, setNeedFilter] = useState("all");
  const [sectorFilter, setSectorFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const payload = await apiRequest(REQUESTS_ENDPOINT);
      setRequests(payload.data || []);
      setMessage(null);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Erro ao carregar solicitações.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadActivityLogs = useCallback(
    async (force = false) => {
      if (!force && activityLoaded) return;
      try {
        setActivityLoading(true);
        const payload = await apiRequest(ACTIVITY_ENDPOINT);
        setActivityLogs(payload.data || []);
        setActivityLoaded(true);
        setMessage(null);
      } catch (error) {
        setMessage({
          type: "error",
          text: error.message || "Erro ao carregar alterações e alertas.",
        });
      } finally {
        setActivityLoading(false);
      }
    },
    [activityLoaded],
  );

  useEffect(() => {
    let active = true;
    apiRequest(REQUESTS_ENDPOINT)
      .then((payload) => {
        if (!active) return;
        setRequests(payload.data || []);
        setMessage(null);
      })
      .catch((error) => {
        if (!active) return;
        setMessage({
          type: "error",
          text: error.message || "Erro ao carregar solicitações.",
        });
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const sectorOptions = useMemo(
    () =>
      [...new Set(requests.map((item) => item.setorFiocruz || "Não informado"))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    let rows = search
      ? requests.filter((item) =>
          JSON.stringify(item).toLowerCase().includes(search.toLowerCase()),
        )
      : requests;
    if (statusFilter !== "all") {
      rows = rows.filter((item) => (item.status || "Recebida") === statusFilter);
    }
    if (dateFilter === "today") {
      rows = rows.filter((item) => isToday(item.createdAtIso || item.createdAt));
    }
    if (needFilter !== "all") {
      rows = rows.filter(
        (item) => normalizedFilterText(item.necessidade) === normalizedFilterText(needFilter),
      );
    }
    if (sectorFilter !== "all") {
      rows = rows.filter((item) => (item.setorFiocruz || "Não informado") === sectorFilter);
    }
    return rows;
  }, [dateFilter, needFilter, requests, search, sectorFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / REQUESTS_PAGE_SIZE));
  const pageRows = filteredRequests.slice(
    (page - 1) * REQUESTS_PAGE_SIZE,
    page * REQUESTS_PAGE_SIZE,
  );

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setDateFilter("all");
    setNeedFilter("all");
    setSectorFilter("all");
    setPage(1);
  }

  function updateFilter(setter, value) {
    setter(value);
    setPage(1);
  }

  function openView(view) {
    setActiveView(view);
    if (view !== "solicitacoes") void loadActivityLogs(true);
  }

  function refreshCurrentView() {
    if (activeView === "solicitacoes") {
      void loadRequests();
      return;
    }
    void loadActivityLogs(true);
  }

  return (
    <section className="card public-requests-page">
      <div className="public-requests-header">
        <div>
          <span className="section-kicker">Solicitações</span>
          <h2>Solicitações cadastradas</h2>
          <p className="subtitle">
            Visualize as respostas enviadas pelo formulário, os valores antigos
            e as alterações feitas sem modificar os registros.
          </p>
        </div>
        <div className="public-header-actions">
          <button className="btn btn-secondary" type="button" onClick={refreshCurrentView}>
            Atualizar
          </button>
          <button className="btn btn-ghost" type="button" onClick={onBack}>
            Voltar ao início
          </button>
        </div>
      </div>

      <Message message={message} />

      <div className="public-section-tabs" aria-label="Áreas de consulta">
        <button
          type="button"
          className={activeView === "solicitacoes" ? "active" : ""}
          onClick={() => openView("solicitacoes")}
        >
          Solicitações
        </button>
        <button
          type="button"
          className={activeView === "alteracoes" ? "active" : ""}
          onClick={() => openView("alteracoes")}
        >
          Alterações
        </button>
        <button
          type="button"
          className={activeView === "alertas" ? "active" : ""}
          onClick={() => openView("alertas")}
        >
          Alertas
        </button>
      </div>

      {activeView === "solicitacoes" && (
      <div className="admin-table-panel requests-workspace public-requests-workspace">
        <div className="panel-heading requests-heading">
          <div>
            <span className="section-kicker">Registros</span>
            <h3>Solicitações do formulário</h3>
            <p className="table-note">
              A mesma solicitação enviada ao admin aparece aqui em modo somente leitura.
            </p>
          </div>
          <div className="queue-meta">
            {filteredRequests.length
              ? `${(page - 1) * REQUESTS_PAGE_SIZE + 1}-${Math.min(
                  page * REQUESTS_PAGE_SIZE,
                  filteredRequests.length,
                )} de ${filteredRequests.length}`
              : "0 registros"}
          </div>
        </div>

        <div className="requests-control-bar">
          <label className="search-label requests-search" htmlFor="public-requests-search">
            <span>Pesquisar</span>
            <input
              id="public-requests-search"
              value={search}
              onChange={(event) => updateFilter(setSearch, event.target.value)}
              placeholder="Nome, evento, setor, origem ou destino"
            />
          </label>
          <label htmlFor="public-status-filter">
            <span>Status</span>
            <select
              id="public-status-filter"
              value={statusFilter}
              onChange={(event) => updateFilter(setStatusFilter, event.target.value)}
            >
              <option value="all">Todos</option>
              {REQUEST_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="public-date-filter">
            <span>Período</span>
            <select
              id="public-date-filter"
              value={dateFilter}
              onChange={(event) => updateFilter(setDateFilter, event.target.value)}
            >
              <option value="all">Todas</option>
              <option value="today">Hoje</option>
            </select>
          </label>
          <label htmlFor="public-need-filter">
            <span>Necessidade</span>
            <select
              id="public-need-filter"
              value={needFilter}
              onChange={(event) => updateFilter(setNeedFilter, event.target.value)}
            >
              <option value="all">Todas</option>
              <option value="Passagens">Passagens</option>
              <option value="Diárias">Diárias</option>
              <option value="Passagens e Diárias">Passagens e Diárias</option>
            </select>
          </label>
          <label htmlFor="public-sector-filter">
            <span>Setor</span>
            <select
              id="public-sector-filter"
              value={sectorFilter}
              onChange={(event) => updateFilter(setSectorFilter, event.target.value)}
            >
              <option value="all">Todos</option>
              {sectorOptions.map((sector) => (
                <option key={sector} value={sector}>
                  {sector}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost" onClick={clearFilters}>
            Limpar
          </button>
        </div>

        {loading && <div className="empty-records">Carregando solicitações...</div>}
        {!loading && (
          <div className="records-list">
            {pageRows.length ? (
              pageRows.map((item) => <PublicRequestCard key={item.id} item={item} />)
            ) : (
              <div className="empty-records">Nenhuma solicitação encontrada.</div>
            )}
          </div>
        )}

        <div className="pagination-row">
          <span>
            Página {page} de {totalPages}
          </span>
          <div className="pagination-actions">
            <button
              className="btn-ghost"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <button
              className="btn-ghost"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      </div>
      )}

      {activeView === "alteracoes" && (
        <PublicChangesView loading={activityLoading} logs={activityLogs} />
      )}

      {activeView === "alertas" && (
        <PublicAlertsView loading={activityLoading} logs={activityLogs} />
      )}
    </section>
  );
}
