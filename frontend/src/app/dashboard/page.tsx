"use client";
import { useEffect, useState, useMemo } from "react";
import { posService } from "@/services/fiscal";
import { formatCurrency } from "@/lib/constants";
import { useI18n } from "@/i18n";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

const TEMA_DEFAULT = {
  nombre: "Oceano",
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

interface DashboardStats {
  total_ventas: number;
  total_ganancia: number;
  cantidad_ventas: number;
  ticket_promedio: number;
  comparacion_periodo_anterior?: {
    ventas: number;
    transacciones: number;
    porcentaje_cambio: number;
  } | null;
}

export default function Dashboard() {
  const i18n = useI18n();
  const [usuario, setUsuario] = useState<{ nombre: string; rol: string } | null>(null);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [stats, setStats] = useState<DashboardStats>({
    total_ventas: 0, total_ganancia: 0, cantidad_ventas: 0, ticket_promedio: 0
  });
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const u = localStorage.getItem("usuario");
    if (!u) { window.location.href = "/"; return; }
    try { setUsuario(JSON.parse(u)); } catch { window.location.href = "/"; return; }
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }

    posService.getDashboard().then(({ data }) => {
      setStats(data);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const esClaro = tema.nombre === "Claro";

  // Sample chart data
  const ventasDiarias = useMemo(() =>
    Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (29 - i));
      return {
        fecha: d.toLocaleDateString("es-DO", { day: "2-digit", month: "short" }),
        ventas: Math.round(Math.random() * 45000 + 8000),
      };
    }), []);

  const categorias = useMemo(() => [
    { name: "Bebidas", value: 35 },
    { name: "Alimentos", value: 28 },
    { name: "Limpieza", value: 18 },
    { name: "Otros", value: 19 },
  ], []);

  const PIE_COLORS = [tema.accent, tema.secondary, "#10b981", "#f59e0b"];

  const comp = stats.comparacion_periodo_anterior;
  const pctChange = comp?.porcentaje_cambio || 0;

  const kpis = [
    { icon: "$", value: formatCurrency(stats.total_ventas), label: i18n.dashboard.salesToday, change: pctChange },
    { icon: "#", value: String(stats.cantidad_ventas), label: i18n.dashboard.transacciones, change: comp?.transacciones ? ((stats.cantidad_ventas - comp.transacciones) / comp.transacciones * 100) : 0 },
    { icon: "+", value: stats.total_ganancia !== null ? formatCurrency(stats.total_ganancia) : "---", label: i18n.dashboard.gananciaEstimada, change: 0 },
    { icon: "~", value: formatCurrency(stats.ticket_promedio), label: i18n.dashboard.ticketPromedio, change: 0 },
  ];

  const alertas = [
    { tipo: "stock", label: i18n.dashboard.productosStockBajo, count: 5, color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.15)" },
    { tipo: "cxc", label: i18n.dashboard.cxcVencidas, count: 3, color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.15)" },
    { tipo: "ncf", label: i18n.dashboard.ncfPorAgotarse, count: 2, color: "#3b82f6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.15)" },
  ];

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        .dash-page { padding:32px; font-family:'DM Sans',sans-serif; color:${tema.texto}; }
        .welcome-text { font-family:'Syne',sans-serif; font-size:28px; font-weight:800; margin-bottom:6px; }
        .welcome-text span { color:${tema.accent}; }
        .welcome-sub { font-size:14px; color:${tema.subtexto}; margin-bottom:32px; }
        .rol-badge {
          display:inline-flex; align-items:center; gap:6px;
          background:${tema.accent}15; border:1px solid ${tema.accent}30;
          border-radius:100px; padding:4px 12px; font-size:11px; color:${tema.accent};
          font-weight:600; text-transform:uppercase; letter-spacing:0.08em; margin-left:12px;
        }
        .stats-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:16px; margin-bottom:32px; }
        .stat-card {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px;
          transition:all 0.2s; box-shadow:${esClaro ? "0 2px 12px rgba(0,0,0,0.06)" : "none"};
        }
        .stat-card:hover { border-color:${tema.accent}40; transform:translateY(-2px); box-shadow:${esClaro ? "0 8px 24px rgba(0,0,0,0.1)" : `0 8px 24px ${tema.accent}10`}; }
        .stat-icon {
          width:44px; height:44px; border-radius:12px; display:flex; align-items:center; justify-content:center;
          font-size:20px; margin-bottom:16px; background:linear-gradient(135deg, ${tema.secondary}25, ${tema.accent}15);
        }
        .stat-value { font-family:'Syne',sans-serif; font-size:28px; font-weight:800; margin-bottom:4px; }
        .stat-label { font-size:13px; color:${tema.subtexto}; }
        .stat-change { font-size:12px; margin-top:8px; font-weight:600; }
        .stat-change.up { color:#10b981; }
        .stat-change.down { color:#ef4444; }
        .stat-change.neutral { color:${tema.subtexto}; }
        .charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:32px; }
        .chart-card {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px;
          box-shadow:${esClaro ? "0 2px 12px rgba(0,0,0,0.06)" : "none"};
        }
        .chart-title { font-family:'Syne',sans-serif; font-size:14px; font-weight:700; margin-bottom:20px; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .alerts-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:32px; }
        .alert-card { border-radius:12px; padding:16px 20px; display:flex; align-items:center; gap:14px; }
        .alert-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:16px; font-weight:800; }
        .alert-count { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .alert-label { font-size:12px; margin-top:2px; }
        .section-title { font-family:'Syne',sans-serif; font-size:13px; font-weight:700; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.1em; margin-bottom:16px; }
        .menu-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:12px; }
        .menu-item {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:20px;
          cursor:pointer; transition:all 0.2s; text-align:center;
          box-shadow:${esClaro ? "0 2px 8px rgba(0,0,0,0.05)" : "none"};
        }
        .menu-item:hover {
          border-color:${tema.accent}40;
          background:${esClaro ? "#ffffff" : `linear-gradient(135deg, ${tema.secondary}10, ${tema.accent}08)`};
          transform:translateY(-3px); box-shadow:${esClaro ? "0 8px 24px rgba(0,0,0,0.1)" : `0 8px 24px ${tema.accent}15`};
        }
        .menu-emoji { font-size:28px; margin-bottom:8px; font-family:'Syne',sans-serif; font-weight:800; color:${tema.accent}; }
        .menu-name { font-family:'Syne',sans-serif; font-size:13px; font-weight:700; margin-bottom:3px; }
        .menu-desc { font-size:11px; color:${tema.subtexto}; }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }
        .skeleton { background:${tema.borde}; border-radius:8px; animation:pulse 1.5s ease-in-out infinite; }
        .sk-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px; }
        .sk-block { height:20px; margin-bottom:12px; }
        .sk-big { height:36px; margin-bottom:8px; width:60%; }
        .sk-small { height:14px; width:40%; }
        .sk-chart { height:250px; }
        .pie-legend { display:flex; flex-wrap:wrap; gap:12px; margin-top:16px; justify-content:center; }
        .pie-legend-item { display:flex; align-items:center; gap:6px; font-size:12px; color:${tema.subtexto}; }
        .pie-legend-dot { width:10px; height:10px; border-radius:50%; }
        @media (max-width: 768px) {
          .dash-page { padding:16px; }
          .charts-grid { grid-template-columns:1fr; }
          .alerts-grid { grid-template-columns:1fr; }
          .menu-grid { grid-template-columns:repeat(2, 1fr); }
          .stat-value { font-size:22px; }
        }
        @media (max-width: 1024px) {
          .charts-grid { grid-template-columns:1fr; }
          .alerts-grid { grid-template-columns:1fr 1fr 1fr; }
        }
      `}</style>

      <div className="dash-page">
        <h1 className="welcome-text">
          {i18n.nav.hello}, <span>{usuario?.nombre}</span>
          <span className="rol-badge">{usuario?.rol?.replace("_", " ")}</span>
        </h1>
        <p className="welcome-sub">{i18n.dashboard.resumenNegocio}</p>

        {/* KPI Cards */}
        {loading ? (
          <div className="stats-grid">
            {[1, 2, 3, 4].map(i => (
              <div className="sk-card" key={i}>
                <div className="skeleton sk-block" style={{ width: 44, height: 44, borderRadius: 12 }} />
                <div className="skeleton sk-big" />
                <div className="skeleton sk-small" />
              </div>
            ))}
          </div>
        ) : (
          <div className="stats-grid">
            {kpis.map((s, i) => (
              <div className="stat-card" key={i}>
                <div className="stat-icon">{s.icon}</div>
                <div className="stat-value">{s.value}</div>
                <div className="stat-label">{s.label}</div>
                <div className={`stat-change ${s.change > 0 ? "up" : s.change < 0 ? "down" : "neutral"}`}>
                  {s.change > 0 ? `+${s.change.toFixed(1)}%` : s.change < 0 ? `${s.change.toFixed(1)}%` : i18n.dashboard.sinCambios}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Charts */}
        {loading ? (
          <div className="charts-grid">
            <div className="sk-card"><div className="skeleton sk-chart" /></div>
            <div className="sk-card"><div className="skeleton sk-chart" /></div>
          </div>
        ) : (
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-title">{i18n.dashboard.salesLast30}</div>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={ventasDiarias}>
                  <defs>
                    <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={tema.accent} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={tema.accent} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={tema.borde} />
                  <XAxis dataKey="fecha" stroke={tema.subtexto} fontSize={10} tickLine={false} />
                  <YAxis stroke={tema.subtexto} fontSize={10} tickLine={false} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: esClaro ? "#fff" : "#0d1829", border: `1px solid ${tema.borde}`, borderRadius: 10, fontSize: 12, color: tema.texto }}
                    formatter={(value) => [formatCurrency(Number(value)), i18n.dashboard.salesLabel]}
                  />
                  <Area type="monotone" dataKey="ventas" stroke={tema.accent} strokeWidth={2} fill="url(#areaGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="chart-card">
              <div className="chart-title">{i18n.dashboard.salesByCategory}</div>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={categorias} cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value">
                    {categorias.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: esClaro ? "#fff" : "#0d1829", border: `1px solid ${tema.borde}`, borderRadius: 10, fontSize: 12, color: tema.texto }}
                    formatter={(value) => [`${value}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pie-legend">
                {categorias.map((c, i) => (
                  <div key={c.name} className="pie-legend-item">
                    <div className="pie-legend-dot" style={{ background: PIE_COLORS[i] }} />
                    {c.name} ({c.value}%)
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Alerts */}
        <div className="section-title">{i18n.dashboard.alertas}</div>
        <div className="alerts-grid">
          {alertas.map(a => (
            <div key={a.tipo} className="alert-card" style={{ background: a.bg, border: `1px solid ${a.border}` }}>
              <div className="alert-icon" style={{ background: `${a.color}20`, color: a.color }}>!</div>
              <div>
                <div className="alert-count" style={{ color: a.color }}>{a.count}</div>
                <div className="alert-label" style={{ color: a.color }}>{a.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Module Menu */}
        <div className="section-title">{i18n.dashboard.modulosSistema}</div>
        <div className="menu-grid">
          {[
            { emoji: "POS", name: i18n.dashboard.menuPos, desc: i18n.dashboard.menuPosDesc, link: "/dashboard/pos" },
            { emoji: "INV", name: i18n.dashboard.menuInventory, desc: i18n.dashboard.menuInventoryDesc, link: "/dashboard/productos" },
            { emoji: "CLI", name: i18n.dashboard.menuClients, desc: i18n.dashboard.menuClientsDesc, link: "/dashboard/clientes" },
            { emoji: "PRV", name: i18n.dashboard.menuSuppliers, desc: i18n.dashboard.menuSuppliersDesc, link: "/dashboard/proveedores" },
            { emoji: "COT", name: i18n.dashboard.menuQuotes, desc: i18n.dashboard.menuQuotesDesc, link: "/dashboard/cotizaciones" },
            { emoji: "OC", name: i18n.dashboard.menuPurchaseOrders, desc: i18n.dashboard.menuPurchaseOrdersDesc, link: "/dashboard/ordenes-compra" },
            { emoji: "CMP", name: i18n.dashboard.menuPurchases, desc: i18n.dashboard.menuPurchasesDesc, link: "/dashboard/compras" },
            { emoji: "FAC", name: i18n.dashboard.menuBilling, desc: i18n.dashboard.menuBillingDesc, link: "/dashboard/ventas" },
            { emoji: "CxC", name: i18n.dashboard.menuReceivables, desc: i18n.dashboard.menuReceivablesDesc, link: "/dashboard/cxc" },
            { emoji: "CxP", name: i18n.dashboard.menuPayables, desc: i18n.dashboard.menuPayablesDesc, link: "/dashboard/cxp" },
            { emoji: "CAJ", name: i18n.dashboard.menuCashRegister, desc: i18n.dashboard.menuCashRegisterDesc, link: "/dashboard/cuadres" },
            { emoji: "RPT", name: i18n.dashboard.menuReports, desc: i18n.dashboard.menuReportsDesc, link: "/dashboard/reportes" },
            { emoji: "CTB", name: i18n.dashboard.menuAccounting, desc: i18n.dashboard.menuAccountingDesc, link: "/dashboard/contabilidad" },
            { emoji: "BNC", name: i18n.dashboard.menuBanking, desc: i18n.dashboard.menuBankingDesc, link: "/dashboard/bancos" },
            { emoji: "HR", name: i18n.dashboard.menuHr, desc: i18n.dashboard.menuHrDesc, link: "/dashboard/hr" },
            { emoji: "CRM", name: i18n.dashboard.menuCrm, desc: i18n.dashboard.menuCrmDesc, link: "/dashboard/crm" },
            { emoji: "BI", name: i18n.dashboard.menuBi, desc: i18n.dashboard.menuBiDesc, link: "/dashboard/bi" },
            { emoji: "FX", name: i18n.dashboard.menuExchangeRates, desc: i18n.dashboard.menuExchangeRatesDesc, link: "/dashboard/monedas" },
            { emoji: "AI", name: i18n.dashboard.menuAi, desc: i18n.dashboard.menuAiDesc, link: "/dashboard/ai" },
            { emoji: "CFG", name: i18n.dashboard.menuSettings, desc: i18n.dashboard.menuSettingsDesc, link: "/dashboard/settings" },
          ].map((m, i) => (
            <div className="menu-item" key={i} onClick={() => window.location.href = m.link}>
              <div className="menu-emoji">{m.emoji}</div>
              <div className="menu-name">{m.name}</div>
              <div className="menu-desc">{m.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
