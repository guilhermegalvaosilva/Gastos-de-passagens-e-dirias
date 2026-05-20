import {
  createdAtDisplay,
  formatCurrency,
  formatDate,
  normalizeText,
  normalizedFilterText,
  parseMoneyValue,
} from "../../utils/formatters";

const WORKFLOW_STATUSES = ["Recebida", "Em análise", "Pendente", "Aprovada", "Concluída"];
const OPEN_STATUS_KEYS = new Set(["recebida", "em analise", "pendente"]);
const CLOSED_STATUS_KEYS = new Set(["concluida", "cancelada"]);

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function compactCurrency(value) {
  if (value >= 1000000) return `${formatCurrency(value / 1000000)} mi`;
  if (value >= 1000) return `${formatCurrency(value / 1000)} mil`;
  return formatCurrency(value);
}

function parseInputDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysUntil(value) {
  const date = parseInputDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function statusKey(item) {
  return normalizedFilterText(item.status || "Recebida");
}

function hasPassage(item) {
  return normalizedFilterText(item.necessidade).includes("passagens");
}

function hasDaily(item) {
  return normalizedFilterText(item.necessidade).includes("diaria");
}

function countBy(rows, getter) {
  return rows.reduce((acc, item) => {
    const key = normalizeText(getter(item)) || "Não informado";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function topEntries(rows, getter, limit = 5) {
  return Object.entries(countBy(rows, getter))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit);
}

function Metric({ title, value, note }) {
  return (
    <article className="dashboard-metric">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function OperationalSummaryChart({ rows }) {
  return (
    <article className="chart-card operational-summary-card">
      <div className="chart-heading">
        <h4>Resumo em gráfico</h4>
        <small>Comparativo dos principais indicadores operacionais</small>
      </div>
      <div className="operational-summary-chart">
        {rows.map((row) => (
          <div className="operational-summary-row" key={row.label}>
            <div>
              <span>{row.label}</span>
              <strong>{row.ratio}%</strong>
            </div>
            <div aria-hidden="true">
              <span style={{ width: `${Math.max(8, row.ratio)}%` }} />
            </div>
            <small>{row.note}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function BarList({ title, rows, total, empty }) {
  return (
    <article className="chart-card dashboard-chart-card">
      <div className="chart-heading">
        <h4>{title}</h4>
      </div>
      <div className="dashboard-bar-list">
        {rows.length ? (
          rows.map(([label, value]) => (
            <div className="dashboard-bar-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
              <div className="dashboard-bar-track" aria-hidden="true">
                <span style={{ width: `${percent(value, total)}%` }} />
              </div>
            </div>
          ))
        ) : (
          <div className="empty-records">{empty}</div>
        )}
      </div>
    </article>
  );
}

function TimelineList({ rows }) {
  return (
    <article className="chart-card dashboard-chart-card">
      <div className="chart-heading">
        <h4>Próximas viagens</h4>
      </div>
      <div className="dashboard-timeline">
        {rows.length ? (
          rows.map(({ item, days }) => (
            <div className="timeline-item" key={item.id}>
              <span>{days <= 0 ? "Hoje" : `${days}d`}</span>
              <div>
                <strong>{item.nomeCompleto || item.nomeEvento || item.id}</strong>
                <small>
                  {formatDate(item.dataIda)} | {item.localOrigem || "-"} - {item.localDestino || "-"}
                </small>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-records">Nenhuma viagem futura cadastrada.</div>
        )}
      </div>
    </article>
  );
}

export function Dashboard({ requests }) {
  const total = requests.length;
  const openRows = requests.filter((item) => OPEN_STATUS_KEYS.has(statusKey(item)));
  const closedRows = requests.filter((item) => CLOSED_STATUS_KEYS.has(statusKey(item)));
  const passageRows = requests.filter(hasPassage);
  const dailyRows = requests.filter(hasDaily);
  const dailyRowsWithValue = dailyRows.filter((item) => parseMoneyValue(item.valorMaximoDiaria) > 0);
  const totalDaily = dailyRows.reduce((sum, item) => sum + parseMoneyValue(item.valorMaximoDiaria), 0);
  const averageDaily = dailyRowsWithValue.length ? totalDaily / dailyRowsWithValue.length : 0;
  const missingFlight = passageRows.filter((item) => !normalizeText(item.vooIda));
  const overdue = requests.filter((item) => {
    const days = daysUntil(item.dataIda);
    return days !== null && days < 0 && !CLOSED_STATUS_KEYS.has(statusKey(item));
  });
  const upcoming = requests
    .map((item) => ({ item, days: daysUntil(item.dataIda) }))
    .filter(({ days }) => days !== null && days >= 0)
    .sort((a, b) => a.days - b.days)
    .slice(0, 5);

  const statusCounts = Object.fromEntries(WORKFLOW_STATUSES.map((status) => [status, 0]));
  requests.forEach((item) => {
    const label =
      WORKFLOW_STATUSES.find((status) => normalizedFilterText(status) === statusKey(item)) ||
      "Recebida";
    statusCounts[label] += 1;
  });

  const summaryRows = [
    {
      label: "Andamento",
      ratio: percent(openRows.length, total),
      note: `${openRows.length}/${total} em andamento | ${closedRows.length} encerrada(s)`,
    },
    {
      label: "Voos informados",
      ratio: percent(passageRows.length - missingFlight.length, passageRows.length),
      note: `${passageRows.length - missingFlight.length}/${passageRows.length} com voo | ${missingFlight.length} sem voo`,
    },
    {
      label: "Diárias com valor",
      ratio: percent(dailyRowsWithValue.length, dailyRows.length),
      note: `${dailyRowsWithValue.length}/${dailyRows.length} com valor | ${compactCurrency(totalDaily)} estimados`,
    },
  ];

  const sectorRows = topEntries(requests, (item) => item.setorFiocruz, 5);
  const projectRows = topEntries(requests, (item) => item.metaProjeto || item.idFiotec, 5);
  const last = requests[0] ? createdAtDisplay(requests[0]) : "-";

  return (
    <section className="dashboard-section admin-panel active">
      <div className="dashboard-card dashboard-overview-panel">
        <div className="dashboard-hero">
          <div>
            <span className="section-kicker">Resumo operacional</span>
            <h3>Dashboard de solicitações</h3>
            <p>Visão rápida da fila, prazos, passagens e estimativa de diárias.</p>
          </div>
          <div className="dashboard-hero-number">
            <span>Total</span>
            <strong>{total}</strong>
            <small>Última entrada: {last}</small>
          </div>
        </div>

        <div className="dashboard-metric-grid">
          <Metric title="Fila aberta" value={openRows.length} note={`${percent(openRows.length, total)}% em andamento`} />
          <Metric title="Passagens sem voo" value={missingFlight.length} note={`${passageRows.length} pedido(s) com passagem`} />
          <Metric title="Diárias estimadas" value={compactCurrency(totalDaily)} note={`Média ${formatCurrency(averageDaily)}`} />
          <Metric title="Atenções" value={overdue.length + missingFlight.length} note="Viagens vencidas + voos pendentes" />
        </div>

        <div className="dashboard-grid-primary">
          <OperationalSummaryChart rows={summaryRows} />
          <TimelineList rows={upcoming} />
        </div>

        <div className="dashboard-visual-grid">
          <BarList
            title="Status da fila"
            rows={Object.entries(statusCounts)}
            total={total}
            empty="Nenhuma solicitação cadastrada."
          />
          <BarList
            title="Setores com mais demandas"
            rows={sectorRows}
            total={total}
            empty="Nenhum setor identificado."
          />
          <BarList
            title="Projetos mais acionados"
            rows={projectRows}
            total={total}
            empty="Nenhum projeto identificado."
          />
        </div>
      </div>
    </section>
  );
}
