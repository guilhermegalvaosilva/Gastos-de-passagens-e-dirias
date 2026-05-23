const navGroups = [
  [
    "Principal",
    [
      ["dashboard", "Dashboard", "DB"],
      ["solicitacoes", "Solicitacoes", "SO"],
    ],
  ],
  [
    "Operacao",
    [
      ["passagens", "Passagens", "PA"],
      ["diarias", "Diarias", "DI"],
      ["alertas", "Alertas", "AL"],
      ["alteracoes", "Alteracoes", "AT"],
    ],
  ],
  [
    "Gestao",
    [["financeiro", "Financeiro", "FI"]],
  ],
];

export function AdminSidebar({ activeTab, onTab, onExport, onLogout }) {
  return (
    <aside className="dashboard-sidebar modern-sidebar" aria-label="Menu administrativo">
      <div className="sidebar-logo modern-sidebar-brand">
        <span className="brand-mark">N</span>
        <span>
          NUGB
          <small>Travel Ops</small>
        </span>
      </div>

      <nav className="sidebar-nav modern-sidebar-nav">
        {navGroups.map(([groupLabel, items]) => (
          <div className="sidebar-group modern-sidebar-group" key={groupLabel}>
            <p className="sidebar-group-title">{groupLabel}</p>
            {items.map(([tab, label, icon]) => (
              <button
                type="button"
                key={tab}
                className={activeTab === tab ? "active" : ""}
                onClick={() => onTab(tab)}
              >
                <span className="sidebar-nav-icon">{icon}</span>
                <span className="sidebar-nav-label">{label}</span>
              </button>
            ))}
          </div>
        ))}

        <div className="modern-sidebar-card">
          <span>Banco conectado</span>
          <strong>Supabase</strong>
          <small>API, frontend e storage no mesmo fluxo.</small>
          <button type="button" onClick={onExport}>Exportar Excel</button>
        </div>

        <div className="sidebar-group modern-sidebar-group modern-account-group">
          <p className="sidebar-group-title">Conta</p>
          <button type="button" className="sidebar-action-button sidebar-logout" onClick={onLogout}>
            <span className="sidebar-nav-icon">SA</span>
            <span>Sair</span>
          </button>
        </div>
      </nav>
    </aside>
  );
}
