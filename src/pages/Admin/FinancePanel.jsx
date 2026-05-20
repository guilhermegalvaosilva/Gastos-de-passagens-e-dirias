import {
  createdAtDisplay,
  formatCurrency,
  normalizeText,
  normalizedFilterText,
  parseMoneyValue,
} from "../../utils/formatters";

function hasDaily(item) {
  return normalizedFilterText(item.necessidade).includes("diaria");
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

function sumBy(rows, getter) {
  return Object.entries(
    rows.reduce((acc, item) => {
      const key = normalizeText(getter(item)) || "Não informado";
      acc[key] = (acc[key] || 0) + parseMoneyValue(item.valorMaximoDiaria);
      return acc;
    }, {}),
  )
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 6);
}

function FinanceMetric({ label, value, note, highlight }) {
  return (
    <article className={`finance-metric ${highlight ? "highlight" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function FinanceBarList({ title, rows, total, empty }) {
  return (
    <article className="chart-card finance-chart-card">
      <div className="chart-heading">
        <h4>{title}</h4>
      </div>
      <div className="finance-bar-list">
        {rows.length ? (
          rows.map(([label, value]) => (
            <div className="finance-bar-row" key={label}>
              <div>
                <span>{label}</span>
                <strong>{formatCurrency(value)}</strong>
              </div>
              <div aria-hidden="true">
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

function FinanceDistribution({ valuedRows, total }) {
  const buckets = [
    ["Até R$ 500", valuedRows.filter(({ value }) => value <= 500).length],
    ["R$ 501 a R$ 1.500", valuedRows.filter(({ value }) => value > 500 && value <= 1500).length],
    ["Acima de R$ 1.500", valuedRows.filter(({ value }) => value > 1500).length],
  ];
  const max = Math.max(...buckets.map(([, value]) => value), 1);

  return (
    <article className="chart-card finance-column-card">
      <div className="chart-heading">
        <h4>Faixas de valores</h4>
        <small>{formatCurrency(total)} distribuídos por solicitação</small>
      </div>
      <div className="finance-column-chart">
        {buckets.map(([label, value]) => (
          <div className="finance-column" key={label}>
            <div>
              <span style={{ height: `${Math.max(8, (value / max) * 100)}%` }} />
            </div>
            <strong>{value}</strong>
            <small>{label}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function FinanceGauge({ coverage }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = (coverage / 100) * circumference;

  return (
    <article className="chart-card finance-gauge-card">
      <div className="chart-heading">
        <h4>Qualidade financeira</h4>
      </div>
      <svg className="finance-gauge" viewBox="0 0 112 112" role="img" aria-label={`${coverage}% de cobertura de valores`}>
        <circle className="donut-track" cx="56" cy="56" r={radius} />
        <circle
          className="donut-value"
          cx="56"
          cy="56"
          r={radius}
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
        <text x="56" y="55" textAnchor="middle">{coverage}%</text>
        <text x="56" y="70" textAnchor="middle">cobertura</text>
      </svg>
    </article>
  );
}

export function FinancePanel({ requests }) {
  const dailyRows = requests.filter(hasDaily);
  const valuedRows = dailyRows
    .map((item) => ({ item, value: parseMoneyValue(item.valorMaximoDiaria) }))
    .filter(({ value }) => value > 0);
  const total = valuedRows.reduce((sum, row) => sum + row.value, 0);
  const average = valuedRows.length ? total / valuedRows.length : 0;
  const missingValue = dailyRows.length - valuedRows.length;
  const coverage = percent(valuedRows.length, dailyRows.length);
  const topValues = valuedRows
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const bySector = sumBy(dailyRows, (item) => item.setorFiocruz);
  const byStatus = sumBy(dailyRows, (item) => item.status || "Recebida");

  return (
    <section className="dashboard-section admin-panel active">
      <div className="dashboard-card finance-dashboard-card">
        <div className="finance-hero">
          <div>
            <span className="section-kicker">Finanças</span>
            <h3>Estimativa de diárias</h3>
            <p className="table-note">
              Valores calculados a partir de solicitações com diária e campo de valor preenchido.
            </p>
          </div>
          <div className="finance-total-card">
            <span>Total estimado</span>
            <strong>{formatCurrency(total)}</strong>
            <small>{valuedRows.length} solicitação(ões) com valor</small>
          </div>
        </div>

        <div className="finance-metric-grid">
          <FinanceMetric label="Média por solicitação" value={formatCurrency(average)} note="Média apenas entre registros com valor." highlight />
          <FinanceMetric label="Cobertura de valores" value={`${coverage}%`} note={`${valuedRows.length} de ${dailyRows.length} diária(s) preenchida(s).`} />
          <FinanceMetric label="Sem valor informado" value={missingValue} note="Diárias que precisam de complemento." />
        </div>

        <div className="finance-content-grid enhanced">
          <FinanceGauge coverage={coverage} />
          <FinanceDistribution valuedRows={valuedRows} total={total} />
          <FinanceBarList title="Distribuição por setor" rows={bySector} total={total} empty="Nenhum valor por setor." />
          <FinanceBarList title="Distribuição por status" rows={byStatus} total={total} empty="Nenhum valor por status." />
        </div>

        <article className="chart-card finance-ranking-card">
          <div className="chart-heading">
            <h4>Maiores estimativas</h4>
          </div>
          <div className="finance-ranking-list">
            {topValues.length ? (
              topValues.map(({ item, value }) => (
                <div className="finance-ranking-item" key={item.id}>
                  <div>
                    <strong>{item.nomeCompleto || item.nomeEvento || item.id}</strong>
                    <span>{createdAtDisplay(item)} | {item.status || "Recebida"}</span>
                  </div>
                  <b>{formatCurrency(value)}</b>
                </div>
              ))
            ) : (
              <div className="empty-records">Nenhuma diária com valor informado.</div>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}
