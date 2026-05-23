import { useCallback, useEffect, useMemo, useState } from "react";

import { Message } from "../../components/common/Message";
import { STORAGE_KEYS } from "../../config/storageKeys";
import { apiRequest, logoutAdmin, savedSession, validateSession } from "../../services/api";
import { exportRequestsWorkbook } from "../../utils/excel";
import { normalizedFilterText } from "../../utils/formatters";
import { AdminSidebar } from "./AdminSidebar";
import { AuditPanel } from "./AuditPanel";
import { AlertsPanel } from "./AlertsPanel";
import { Dashboard } from "./Dashboard";
import { FinancePanel } from "./FinancePanel";
import { FlightsPanel } from "./FlightsPanel";
import { NotificationsPanel } from "./NotificationsPanel";
import { RequestsPanel } from "./RequestsPanel";
import "./admin-modern.css";

const tabTitles = {
  dashboard: "Command center",
  solicitacoes: "Solicitacoes",
  alertas: "Alertas",
  alteracoes: "Alteracoes",
  notificacoes: "Notificacoes",
  financeiro: "Financeiro",
  passagens: "Passagens",
  diarias: "Diarias",
};

function isOpenRequest(item) {
  return ["recebida", "em analise", "pendente"].includes(
    normalizedFilterText(item.status || "Recebida"),
  );
}

function isToday(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.toDateString() === new Date().toDateString();
}

export function AdminPage({ onBack }) {
  const [activeTab, setActiveTab] = useState(
    window.localStorage.getItem(STORAGE_KEYS.activeAdminTab) || "dashboard",
  );
  const [requests, setRequests] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const metrics = useMemo(() => {
    const open = requests.filter(isOpenRequest).length;
    const today = requests.filter((item) => isToday(item.createdAtIso || item.createdAt)).length;
    const passage = requests.filter((item) =>
      normalizedFilterText(item.necessidade).includes("passagens"),
    ).length;
    const auditsToday = auditLogs.filter((item) => isToday(item.dataAlteracao)).length;
    return { open, today, passage, auditsToday };
  }, [auditLogs, requests]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      const [requestsPayload, auditPayload] = await Promise.all([
        apiRequest("/solicitacoes?sort=createdAt&order=desc"),
        apiRequest("/alteracoes?sort=dataAlteracao&order=desc"),
      ]);
      setRequests(requestsPayload.data || []);
      setAuditLogs(auditPayload.data || []);
      setLastUpdatedAt(new Date());
      setMessage(null);
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Erro ao carregar painel.",
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.activeAdminTab, activeTab);
  }, [activeTab]);

  useEffect(() => {
    validateSession().then((user) => {
      if (!user) {
        onBack();
        return;
      }
      void loadData();
    });
  }, [loadData, onBack]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadData({ silent: true });
    }, 60000);
    return () => window.clearInterval(interval);
  }, [loadData]);

  function setTab(tab) {
    setActiveTab(tab);
  }

  function exportWorkbook() {
    exportRequestsWorkbook(requests);
  }

  async function deleteRequest(id) {
    if (!confirm("Tem certeza que deseja apagar este registro?")) return;
    await apiRequest(`/solicitacoes/${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadData();
  }

  async function logout() {
    await logoutAdmin();
    onBack();
  }

  return (
    <section className="admin-dashboard admin-v2">
      <div className="dashboard-shell modern-shell">
        <AdminSidebar
          activeTab={activeTab}
          onTab={setTab}
          onExport={exportWorkbook}
          onLogout={logout}
        />
        <div className="dashboard-content modern-content">
          <header className="dashboard-header admin-command-bar modern-command">
            <div className="dashboard-title-block modern-title">
              <span className="section-kicker">Painel administrativo</span>
              <h2>{tabTitles[activeTab] || "Operacao"}</h2>
              <p className="subtitle">
                Controle executivo para viagens, diarias, financeiro e auditoria.
              </p>
            </div>

            <div className="modern-toolbar" aria-label="Acoes do painel">
              <div className="modern-search" aria-label="Resumo da sessao">
                <span>Usuario</span>
                <strong>{savedSession().login || "admin"}</strong>
              </div>
              <button type="button" onClick={() => loadData()}>
                Atualizar
              </button>
              <button type="button" onClick={exportWorkbook}>
                Exportar
              </button>
              <button type="button" className="btn-ghost" onClick={logout}>
                Sair
              </button>
            </div>
          </header>

          <section className="modern-overview" aria-label="Indicadores rapidos">
            <article className="modern-kpi is-dark">
              <span>Total de solicitacoes</span>
              <strong>{requests.length}</strong>
              <small>Base carregada pela API</small>
            </article>
            <article className="modern-kpi">
              <span>Fila aberta</span>
              <strong>{metrics.open}</strong>
              <small>Recebida, analise ou pendente</small>
            </article>
            <article className="modern-kpi">
              <span>Entradas hoje</span>
              <strong>{metrics.today}</strong>
              <small>Novos pedidos no dia</small>
            </article>
            <article className="modern-kpi">
              <span>Passagens</span>
              <strong>{metrics.passage}</strong>
              <small>Solicitacoes com voo</small>
            </article>
            <article className="modern-kpi">
              <span>Auditoria hoje</span>
              <strong>{metrics.auditsToday}</strong>
              <small>Alteracoes registradas</small>
            </article>
          </section>

          <div className="modern-status-row">
            <span>API Supabase conectada</span>
            <span>
              Atualizado:{" "}
              {lastUpdatedAt
                ? lastUpdatedAt.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "..."}
            </span>
          </div>

          <Message message={message} />
          {loading && <div className="empty-records">Carregando dados...</div>}
          <div className="modern-panel-surface">
            {activeTab === "dashboard" && <Dashboard requests={requests} />}
            {activeTab === "solicitacoes" && (
              <RequestsPanel rows={requests} onDelete={deleteRequest} />
            )}
            {activeTab === "alertas" && <AlertsPanel logs={auditLogs} />}
            {activeTab === "alteracoes" && <AuditPanel logs={auditLogs} />}
            {activeTab === "notificacoes" && <NotificationsPanel logs={auditLogs} />}
            {activeTab === "financeiro" && <FinancePanel requests={requests} />}
            {activeTab === "passagens" && <FlightsPanel requests={requests} />}
            {activeTab === "diarias" && <FinancePanel requests={requests} />}
          </div>
        </div>
      </div>
    </section>
  );
}
