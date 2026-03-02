"use client";
import { useEffect, useState } from "react";
import { posService } from "@/services/fiscal";
import api from "@/lib/axios";

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

export default function Dashboard() {
  const [usuario, setUsuario] = useState<{nombre: string; rol: string} | null>(null);
  const [tema, setTema] = useState<Tema>(TEMAS[0]);
  const [showTemas, setShowTemas] = useState(false);
  const [stats, setStats] = useState({
    total_ventas: 0,
    total_ganancia: 0,
    cantidad_ventas: 0,
    ticket_promedio: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem("usuario");
    if (!u) { window.location.href = "/"; return; }
    try {
      setUsuario(JSON.parse(u));
    } catch {
      localStorage.removeItem("usuario");
      window.location.href = "/";
      return;
    }
    const temaGuardado = localStorage.getItem("tema");
    if (temaGuardado) {
      try { setTema(JSON.parse(temaGuardado)); } catch { /* use default */ }
    }

    const fetchStats = async () => {
      try {
        const { data } = await posService.getDashboard();
        setStats(data);
      } catch {
        // API error handled by interceptor
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const cambiarTema = (t: Tema) => {
    setTema(t);
    localStorage.setItem("tema", JSON.stringify(t));
    setShowTemas(false);
  };

  const cerrarSesion = async () => {
    try {
      await api.post("/auth/logout/");
    } catch {
      // Ignore - cookies will be cleared server-side or expire
    }
    localStorage.removeItem("usuario");
    localStorage.removeItem("tema");
    window.location.href = "/";
  };

  const esClaro = tema.nombre === "Claro";

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(amount);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background: ${tema.bg}; font-family: 'DM Sans', sans-serif; transition: background 0.3s; }

        .dash-root { min-height:100vh; background:${tema.bg}; color:${tema.texto}; transition: all 0.3s; }

        .navbar {
          display:flex; align-items:center; justify-content:space-between;
          padding: 0 32px; height: 64px;
          background: ${esClaro ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.02)"};
          border-bottom: 1px solid ${tema.borde};
          backdrop-filter: blur(12px);
          position: sticky; top:0; z-index:100;
          box-shadow: ${esClaro ? "0 1px 12px rgba(0,0,0,0.08)" : "none"};
        }
        .nav-left { display:flex; align-items:center; gap:12px; }
        .nav-logo {
          width:36px; height:36px;
          background: linear-gradient(135deg, ${tema.secondary}, ${tema.accent});
          border-radius:10px; display:flex; align-items:center; justify-content:center;
          font-size:18px; font-weight:800; font-family:'Syne',sans-serif; color:white;
          box-shadow: 0 4px 16px ${tema.accent}40;
        }
        .nav-title { font-family:'Syne',sans-serif; font-size:16px; font-weight:700; color:${tema.texto}; }
        .nav-title span { color:${tema.accent}; }
        .nav-right { display:flex; align-items:center; gap:12px; }

        .btn-tema {
          display:flex; align-items:center; gap:8px;
          background: ${tema.card};
          border: 1px solid ${tema.borde};
          border-radius:10px; padding:7px 14px;
          color:${tema.subtexto}; font-size:13px;
          cursor:pointer; transition:all 0.2s;
          font-family:'DM Sans',sans-serif; position:relative;
        }
        .btn-tema:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .tema-dot { width:10px; height:10px; border-radius:50%; background: linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); }

        .temas-dropdown {
          position:absolute; top:calc(100% + 8px); right:0;
          background:${esClaro ? "#ffffff" : "#0d1829"};
          border:1px solid ${tema.borde};
          border-radius:14px; padding:10px;
          display:flex; flex-direction:column; gap:4px;
          min-width:160px;
          box-shadow:0 20px 40px rgba(0,0,0,0.2);
          animation: dropIn 0.2s ease; z-index:200;
        }
        @keyframes dropIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }

        .tema-option {
          display:flex; align-items:center; gap:10px;
          padding:8px 12px; border-radius:8px;
          cursor:pointer; transition:all 0.15s;
          font-size:13px; color:${tema.subtexto};
          border:none; background:none; width:100%;
          text-align:left; font-family:'DM Sans',sans-serif;
        }
        .tema-option:hover { background:${tema.card}; color:${tema.texto}; }
        .tema-option.active { color:${tema.texto}; background:${tema.card}; }
        .tema-color { width:14px; height:14px; border-radius:50%; flex-shrink:0; }

        .btn-logout {
          background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.15);
          border-radius:10px; padding:7px 14px;
          color:#ef4444; font-size:13px; cursor:pointer;
          transition:all 0.2s; font-family:'DM Sans',sans-serif;
        }
        .btn-logout:hover { background:rgba(239,68,68,0.15); }

        .main { padding:32px; }

        .welcome-text {
          font-family:'Syne',sans-serif; font-size:28px;
          font-weight:800; color:${tema.texto}; margin-bottom:6px;
        }
        .welcome-text span { color:${tema.accent}; }
        .welcome-sub { font-size:14px; color:${tema.subtexto}; margin-bottom:32px; }

        .stats-grid {
          display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr));
          gap:16px; margin-bottom:32px;
        }
        .stat-card {
          background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:16px; padding:24px; transition:all 0.2s; cursor:pointer;
          box-shadow: ${esClaro ? "0 2px 12px rgba(0,0,0,0.06)" : "none"};
        }
        .stat-card:hover {
          border-color:${tema.accent}40; transform:translateY(-2px);
          box-shadow: ${esClaro ? "0 8px 24px rgba(0,0,0,0.1)" : `0 8px 24px ${tema.accent}10`};
        }
        .stat-icon {
          width:44px; height:44px; border-radius:12px;
          display:flex; align-items:center; justify-content:center;
          font-size:20px; margin-bottom:16px;
          background: linear-gradient(135deg, ${tema.secondary}25, ${tema.accent}15);
        }
        .stat-value { font-family:'Syne',sans-serif; font-size:28px; font-weight:800; color:${tema.texto}; margin-bottom:4px; }
        .stat-label { font-size:13px; color:${tema.subtexto}; }
        .stat-change { font-size:12px; color:#10b981; margin-top:8px; }

        .section-title {
          font-family:'Syne',sans-serif; font-size:13px; font-weight:700;
          color:${tema.subtexto}; text-transform:uppercase;
          letter-spacing:0.1em; margin-bottom:16px;
        }
        .menu-grid {
          display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
          gap:12px;
        }
        .menu-item {
          background:${tema.card}; border:1px solid ${tema.borde};
          border-radius:16px; padding:20px; cursor:pointer;
          transition:all 0.2s; text-align:center;
          box-shadow: ${esClaro ? "0 2px 8px rgba(0,0,0,0.05)" : "none"};
        }
        .menu-item:hover {
          border-color:${tema.accent}40;
          background: ${esClaro ? "#ffffff" : `linear-gradient(135deg, ${tema.secondary}10, ${tema.accent}08)`};
          transform:translateY(-3px);
          box-shadow: ${esClaro ? "0 8px 24px rgba(0,0,0,0.1)" : `0 8px 24px ${tema.accent}15`};
        }
        .menu-emoji { font-size:32px; margin-bottom:10px; }
        .menu-name { font-family:'Syne',sans-serif; font-size:14px; font-weight:700; color:${tema.texto}; margin-bottom:4px; }
        .menu-desc { font-size:12px; color:${tema.subtexto}; }

        .rol-badge {
          display:inline-flex; align-items:center; gap:6px;
          background:${tema.accent}15; border:1px solid ${tema.accent}30;
          border-radius:100px; padding:4px 12px;
          font-size:11px; color:${tema.accent};
          font-weight:600; text-transform:uppercase;
          letter-spacing:0.08em; margin-left:12px;
        }
      `}</style>

      <div className="dash-root">
        <nav className="navbar">
          <div className="nav-left">
            <div className="nav-logo">L</div>
            <span className="nav-title">Lhams-<span>DJ</span></span>
          </div>
          <div className="nav-right">
            <div style={{position:"relative"}}>
              <button className="btn-tema" onClick={() => setShowTemas(!showTemas)}>
                <div className="tema-dot" />
                {tema.nombre} <span style={{fontSize:10}}>v</span>
              </button>
              {showTemas && (
                <div className="temas-dropdown">
                  {TEMAS.map(t => (
                    <button key={t.nombre} className={`tema-option ${t.nombre === tema.nombre ? "active" : ""}`} onClick={() => cambiarTema(t)}>
                      <div className="tema-color" style={{background:`linear-gradient(135deg, ${t.secondary}, ${t.accent})`}} />
                      {t.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button className="btn-logout" onClick={cerrarSesion}>Salir</button>
          </div>
        </nav>

        <main className="main">
          <h1 className="welcome-text">
            Hola, <span>{usuario?.nombre}</span>
            <span className="rol-badge">{usuario?.rol?.replace("_", " ")}</span>
          </h1>
          <p className="welcome-sub">Aqui esta el resumen de tu negocio hoy</p>

          <div className="stats-grid">
            {[
              { icon:"$", value: loading ? "..." : formatCurrency(stats.total_ventas), label:"Ventas de hoy" },
              { icon:"#", value: loading ? "..." : stats.cantidad_ventas,    label:"Transacciones" },
              { icon:"+", value: loading ? "..." : (stats.total_ganancia !== null ? formatCurrency(stats.total_ganancia) : "---"), label:"Ganancia Estimada" },
              { icon:"~", value: loading ? "..." : formatCurrency(stats.ticket_promedio),    label:"Ticket Promedio" },
            ].map((s,i) => (
              <div className="stat-card" key={i}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
                <div className="stat-change">Actualizado hoy</div>
              </div>
            ))}
          </div>

          <div className="section-title">Modulos del sistema</div>
          <div className="menu-grid">
            {[
              { emoji:"POS", name:"Punto de Venta",  desc:"Registrar ventas", link: "/dashboard/pos" },
              { emoji:"INV", name:"Inventario",       desc:"Productos y stock", link: "/dashboard/productos" },
              { emoji:"CLI", name:"Clientes",         desc:"Gestion de clientes", link: "/dashboard/clientes" },
              { emoji:"PRV", name:"Proveedores",      desc:"Gestion de compras", link: "/dashboard/proveedores" },
              { emoji:"FAC", name:"Facturacion",      desc:"Historial y e-CF DGII", link: "/dashboard/ventas" },
              { emoji:"CAJ", name:"Cuadres de Caja",  desc:"Apertura y cierre", link: "/dashboard/cuadres" },
              { emoji:"RPT", name:"Reportes",         desc:"Reportes fiscales 606/607", link: "/dashboard/reportes" },
              { emoji:"CTB", name:"Contabilidad",     desc:"Plan de cuentas", link: "/dashboard/contabilidad" },
              { emoji:"AI",  name:"AI Agent",         desc:"Analisis inteligente", link: "/dashboard/ai" },
              { emoji:"CFG", name:"Configuracion",    desc:"Negocio, usuarios, sucursales", link: "/dashboard/settings" },
            ].map((m,i) => (
              <div className="menu-item" key={i} onClick={() => window.location.href = m.link}>
                <div className="menu-emoji">{m.emoji}</div>
                <div className="menu-name">{m.name}</div>
                <div className="menu-desc">{m.desc}</div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </>
  );
}
