import logo from "../../assets/Captura de tela 2026-04-14 121940.png";

export function Topbar() {
  return (
    <header className="topbar">
      <div className="brand-lockup">
        <span className="brand-mark brand-logo">
          <img src={logo} alt="Fiocruz Brasília" />
        </span>
        <div>
          <span className="eyebrow">NUGB</span>
          <h1>Passagens e diárias</h1>
        </div>
      </div>
      <div className="topbar-meta">
        <span>Status</span>
        <strong>Sistema online</strong>
      </div>
    </header>
  );
}
