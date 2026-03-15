"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { useI18n } from "@/i18n";

const TEMAS = [
  { nombre: "Oceano",  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8" },
  { nombre: "Bosque",  bg: "#030f08", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5", subtexto: "#475569", accent: "#10b981", secondary: "#065f46" },
  { nombre: "Fuego",   bg: "#0f0503", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5", subtexto: "#475569", accent: "#f97316", secondary: "#dc2626" },
  { nombre: "Galaxia", bg: "#05030f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5", subtexto: "#475569", accent: "#8b5cf6", secondary: "#6d28d9" },
  { nombre: "Oro",     bg: "#0f0a03", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5", subtexto: "#475569", accent: "#f59e0b", secondary: "#b45309" },
  { nombre: "Rosa",    bg: "#0f0308", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5", subtexto: "#475569", accent: "#ec4899", secondary: "#be185d" },
  { nombre: "Claro",   bg: "#f1f5f9", card: "rgba(255,255,255,0.9)", borde: "rgba(0,0,0,0.08)",       texto: "#0f172a", subtexto: "#64748b", accent: "#0284c7", secondary: "#1d4ed8" },
];

type Tema = typeof TEMAS[0];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const i18n = useI18n();
  const [tema, setTema] = useState<Tema>(TEMAS[0]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showTemas, setShowTemas] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [currentPath, setCurrentPath] = useState("");

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem("usuario");
    if (!u) { window.location.href = "/"; return; }
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    setCurrentPath(window.location.pathname);
  }, []);

  const cambiarTema = (t: Tema) => {
    setTema(t);
    localStorage.setItem("tema", JSON.stringify(t));
    setShowTemas(false);
  };

  const cerrarSesion = async () => {
    try { await api.post("/auth/logout/"); } catch { /* ignore */ }
    localStorage.removeItem("usuario");
    localStorage.removeItem("tema");
    window.location.href = "/";
  };

  const navigate = (href: string) => {
    setSidebarOpen(false);
    window.location.href = href;
  };

  const esClaro = tema.nombre === "Claro";

  const MENU_ITEMS = [
    { key: "home",   label: i18n.nav.dashboard,              icon: "D",   href: "/dashboard" },
    { key: "pos",    label: i18n.dashboard.menuPos,           icon: "POS", href: "/dashboard/pos" },
    { key: "inv",    label: i18n.dashboard.menuInventory,     icon: "INV", href: "/dashboard/productos" },
    { key: "cli",    label: i18n.dashboard.menuClients,       icon: "CLI", href: "/dashboard/clientes" },
    { key: "prv",    label: i18n.dashboard.menuSuppliers,     icon: "PRV", href: "/dashboard/proveedores" },
    { key: "cot",    label: i18n.dashboard.menuQuotes,        icon: "COT", href: "/dashboard/cotizaciones" },
    { key: "oc",     label: i18n.dashboard.menuPurchaseOrders,icon: "OC",  href: "/dashboard/ordenes-compra" },
    { key: "cmp",    label: i18n.dashboard.menuPurchases,     icon: "CMP", href: "/dashboard/compras" },
    { key: "fac",    label: i18n.dashboard.menuBilling,       icon: "FAC", href: "/dashboard/ventas" },
    { key: "cxc",    label: i18n.dashboard.menuReceivables,   icon: "CxC", href: "/dashboard/cxc" },
    { key: "cxp",    label: i18n.dashboard.menuPayables,      icon: "CxP", href: "/dashboard/cxp" },
    { key: "caj",    label: i18n.dashboard.menuCashRegister,  icon: "CAJ", href: "/dashboard/cuadres" },
    { key: "rpt",    label: i18n.dashboard.menuReports,       icon: "RPT", href: "/dashboard/reportes" },
    { key: "ctb",    label: i18n.dashboard.menuAccounting,    icon: "CTB", href: "/dashboard/contabilidad" },
    { key: "bnc",    label: i18n.dashboard.menuBanking,       icon: "BNC", href: "/dashboard/bancos" },
    { key: "hr",     label: i18n.dashboard.menuHr,            icon: "HR",  href: "/dashboard/hr" },
    { key: "crm",    label: i18n.dashboard.menuCrm,           icon: "CRM", href: "/dashboard/crm" },
    { key: "bi",     label: i18n.dashboard.menuBi,            icon: "BI",  href: "/dashboard/bi" },
    { key: "fx",     label: i18n.dashboard.menuExchangeRates, icon: "FX",  href: "/dashboard/monedas" },
    { key: "act",    label: i18n.dashboard.menuFixedAssets,    icon: "ACT", href: "/dashboard/activos" },
    { key: "apr",    label: i18n.dashboard.menuApprovals,     icon: "APR", href: "/dashboard/aprobaciones" },
    { key: "prs",    label: i18n.dashboard.menuBudgets,       icon: "PRS", href: "/dashboard/presupuestos" },
    { key: "rec",    label: i18n.dashboard.menuReconciliation,icon: "REC", href: "/dashboard/conciliacion" },
    { key: "ai",     label: i18n.dashboard.menuAi,            icon: "AI",  href: "/dashboard/ai" },
    { key: "svc",    label: i18n.dashboard.menuServices,      icon: "SVC", href: "/dashboard/servicios" },
    { key: "cfg",    label: i18n.dashboard.menuSettings,      icon: "CFG", href: "/dashboard/settings" },
  ];

  if (!mounted) return null;

  // POS page gets its own full layout (no sidebar)
  if (currentPath === "/dashboard/pos") {
    return <>{children}</>;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:${tema.bg}; font-family:'DM Sans',sans-serif; }

        .layout-root { min-height:100vh; display:flex; background:${tema.bg}; color:${tema.texto}; }

        /* Sidebar */
        .sidebar {
          width:240px; height:100vh; position:fixed; top:0; left:0;
          background:${esClaro ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.02)"};
          border-right:1px solid ${tema.borde};
          display:flex; flex-direction:column;
          overflow-y:auto; z-index:200;
          backdrop-filter:blur(12px);
          transition:transform 0.3s ease;
        }
        .sidebar-header {
          padding:20px 16px; display:flex; align-items:center; gap:10px;
          border-bottom:1px solid ${tema.borde};
        }
        .sidebar-logo {
          width:32px; height:32px; border-radius:8px;
          background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent});
          display:flex; align-items:center; justify-content:center;
          font-size:14px; font-weight:800; color:white; font-family:'Syne',sans-serif;
          box-shadow:0 2px 8px ${tema.accent}40;
        }
        .sidebar-brand { font-family:'Syne',sans-serif; font-size:15px; font-weight:700; }
        .sidebar-brand span { color:${tema.accent}; }
        .sidebar-nav { flex:1; padding:8px; overflow-y:auto; }
        .nav-item {
          display:flex; align-items:center; gap:10px;
          padding:8px 12px; border-radius:8px; cursor:pointer;
          font-size:13px; color:${tema.subtexto}; transition:all 0.15s;
          border:none; background:none; width:100%; text-align:left;
          font-family:'DM Sans',sans-serif; min-height:36px;
        }
        .nav-item:hover { background:${tema.card}; color:${tema.texto}; }
        .nav-item.active {
          background:${tema.accent}12; color:${tema.accent}; font-weight:600;
        }
        .nav-icon {
          width:28px; height:28px; border-radius:6px; display:flex; align-items:center; justify-content:center;
          font-size:9px; font-weight:800; flex-shrink:0; letter-spacing:0.03em;
          background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"};
          font-family:'Syne',sans-serif;
        }
        .nav-item.active .nav-icon {
          background:${tema.accent}20; color:${tema.accent};
        }
        .sidebar-footer {
          padding:12px 16px; border-top:1px solid ${tema.borde};
          display:flex; flex-direction:column; gap:6px;
        }
        .btn-tema-sidebar {
          display:flex; align-items:center; gap:8px; padding:8px 12px;
          border-radius:8px; border:none; background:none; cursor:pointer;
          font-size:12px; color:${tema.subtexto}; font-family:'DM Sans',sans-serif;
          width:100%; text-align:left; transition:all 0.15s; position:relative;
        }
        .btn-tema-sidebar:hover { background:${tema.card}; color:${tema.texto}; }
        .tema-dot { width:10px; height:10px; border-radius:50%; background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); }
        .temas-popup {
          position:absolute; bottom:100%; left:0; margin-bottom:4px;
          background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde};
          border-radius:12px; padding:8px; min-width:160px;
          box-shadow:0 12px 32px rgba(0,0,0,0.3); z-index:300;
        }
        .tema-option {
          display:flex; align-items:center; gap:8px; padding:6px 10px;
          border-radius:6px; cursor:pointer; font-size:12px; color:${tema.subtexto};
          border:none; background:none; width:100%; text-align:left; font-family:'DM Sans',sans-serif;
          transition:all 0.1s;
        }
        .tema-option:hover { background:${tema.card}; color:${tema.texto}; }
        .tema-option.active { color:${tema.texto}; font-weight:600; }
        .tema-swatch { width:12px; height:12px; border-radius:50%; }
        .btn-logout-sidebar {
          display:flex; align-items:center; gap:8px; padding:8px 12px;
          border-radius:8px; border:none; background:rgba(239,68,68,0.06); cursor:pointer;
          font-size:12px; color:#ef4444; font-family:'DM Sans',sans-serif;
          width:100%; text-align:left; transition:all 0.15s;
        }
        .btn-logout-sidebar:hover { background:rgba(239,68,68,0.12); }

        /* Main content */
        .layout-main { flex:1; margin-left:240px; min-height:100vh; }

        /* Mobile hamburger */
        .hamburger {
          display:none; position:fixed; top:16px; left:16px; z-index:300;
          width:40px; height:40px; border-radius:10px;
          background:${tema.card}; border:1px solid ${tema.borde};
          cursor:pointer; align-items:center; justify-content:center;
          backdrop-filter:blur(8px);
        }
        .hamburger-lines { display:flex; flex-direction:column; gap:4px; align-items:center; }
        .hamburger-lines span {
          display:block; width:18px; height:2px; background:${tema.texto}; border-radius:1px;
        }

        /* Mobile overlay */
        .sidebar-overlay {
          display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5);
          z-index:190; backdrop-filter:blur(2px);
        }

        /* Responsive */
        @media (max-width: 768px) {
          .sidebar { transform:translateX(-100%); width:260px; }
          .sidebar.open { transform:translateX(0); }
          .layout-main { margin-left:0; padding-top:56px; }
          .hamburger { display:flex; }
          .sidebar-overlay.show { display:block; }
        }
        @media (min-width: 769px) and (max-width: 1024px) {
          .sidebar { width:200px; }
          .layout-main { margin-left:200px; }
          .nav-item { font-size:12px; padding:6px 10px; }
          .nav-icon { width:24px; height:24px; font-size:8px; }
        }
      `}</style>

      <div className="layout-root">
        {/* Mobile hamburger */}
        <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <div className="hamburger-lines">
            <span /><span /><span />
          </div>
        </button>

        {/* Mobile overlay */}
        <div className={`sidebar-overlay ${sidebarOpen ? "show" : ""}`} onClick={() => setSidebarOpen(false)} />

        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <div className="sidebar-header">
            <div className="sidebar-logo">L</div>
            <div className="sidebar-brand">Lhams-<span>DJ</span></div>
          </div>

          <nav className="sidebar-nav">
            {MENU_ITEMS.map(item => (
              <button
                key={item.key}
                className={`nav-item ${currentPath === item.href ? "active" : ""}`}
                onClick={() => navigate(item.href)}
              >
                <div className="nav-icon">{item.icon}</div>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="sidebar-footer">
            <div style={{ position: "relative" }}>
              <button className="btn-tema-sidebar" onClick={() => setShowTemas(!showTemas)}>
                <div className="tema-dot" />
                {tema.nombre}
              </button>
              {showTemas && (
                <div className="temas-popup">
                  {TEMAS.map(t => (
                    <button key={t.nombre} className={`tema-option ${t.nombre === tema.nombre ? "active" : ""}`} onClick={() => cambiarTema(t)}>
                      <div className="tema-swatch" style={{ background: `linear-gradient(135deg, ${t.secondary}, ${t.accent})` }} />
                      {t.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-logout-sidebar" onClick={cerrarSesion}>
              {i18n.nav.logout}
            </button>
          </div>
        </aside>

        {/* Main */}
        <main className="layout-main">
          {children}
        </main>
      </div>
    </>
  );
}
