import { normalizeText, normalizedFilterText } from "../../utils/formatters";

function routeKey(item) {
  const origin = normalizeText(item.localOrigem);
  const destination = normalizeText(item.localDestino);
  return origin && destination ? `${origin} - ${destination}` : "";
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function countRoutes(rows) {
  return Object.entries(
    rows.reduce((acc, item) => {
      const key = routeKey(item);
      if (!key) return acc;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  )
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

function countStatus(rows) {
  return Object.entries(
    rows.reduce((acc, item) => {
      const key = normalizeText(item.status) || "Recebida";
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function FlightMetric({ label, value, note }) {
  return (
    <article className="flight-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function FlightStatusChart({ rows, total }) {
  const max = Math.max(...rows.map(([, value]) => value), 1);
  const mainStatus = rows[0];

  return (
    <article className="chart-card flight-status-card">
      <div className="chart-heading">
        <h4>Status das passagens</h4>
        <small>
          {mainStatus
            ? `${mainStatus[0]} concentra ${mainStatus[1]} pedido(s)`
            : "Sem passagens para analisar"}
        </small>
      </div>

      <div className="flight-status-chart">
        {rows.length ? (
          rows.map(([status, value]) => (
            <div className="flight-status-row" key={status}>
              <div>
                <span>{status}</span>
                <strong>{value}</strong>
              </div>
              <div aria-hidden="true">
                <span style={{ width: `${Math.max(8, percent(value, max))}%` }} />
              </div>
              <small>{percent(value, total)}% das passagens</small>
            </div>
          ))
        ) : (
          <div className="empty-records">Nenhuma passagem encontrada.</div>
        )}
      </div>
    </article>
  );
}

export function FlightsPanel({ requests }) {
  const passageRows = requests.filter((item) =>
    normalizedFilterText(item.necessidade).includes("passagens"),
  );
  const withFlight = passageRows.filter((item) => normalizeText(item.vooIda));
  const missingFlight = passageRows.filter((item) => !normalizeText(item.vooIda));
  const routes = countRoutes(passageRows);
  const statusRows = countStatus(passageRows);
  const completion = percent(withFlight.length, passageRows.length);

  return (
    <section className="dashboard-section admin-panel active">
      <div className="dashboard-card flights-dashboard-card">
        <div className="flights-hero">
          <div>
            <span className="section-kicker">Logística</span>
            <h3>Mapa de voos e rotas</h3>
            <p className="table-note">
              Acompanhe indicações de voo, status das passagens e rotas mais recorrentes.
            </p>
          </div>
          <div className="flight-completion" aria-label={`${completion}% dos voos informados`}>
            <strong>{completion}%</strong>
            <span>voos informados</span>
            <div aria-hidden="true">
              <span style={{ width: `${completion}%` }} />
            </div>
          </div>
        </div>

        <div className="flight-metric-grid">
          <FlightMetric
            label="Pedidos de passagem"
            value={passageRows.length}
            note="Solicitações que incluem passagens."
          />
          <FlightMetric
            label="Com indicação de voo"
            value={withFlight.length}
            note="Campo voo de ida preenchido."
          />
          <FlightMetric
            label="Pendentes de voo"
            value={missingFlight.length}
            note="Precisam de complemento operacional."
          />
        </div>

        <div className="flights-content-grid">
          <article className="chart-card flight-routes-card">
            <div className="chart-heading">
              <h4>Rotas mais frequentes</h4>
            </div>
            <div className="flight-route-list">
              {routes.length ? (
                routes.map(([route, value]) => (
                  <div className="flight-route-row" key={route}>
                    <div>
                      <span>{route}</span>
                      <strong>{value}</strong>
                    </div>
                    <div aria-hidden="true">
                      <span style={{ width: `${percent(value, passageRows.length)}%` }} />
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-records">Nenhuma rota com origem e destino.</div>
              )}
            </div>
          </article>

          <FlightStatusChart rows={statusRows} total={passageRows.length} />
        </div>
      </div>
    </section>
  );
}
