"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import api from "@/lib/axios";
import { posService, inventoryService } from "@/services/fiscal";
import { ventaService } from "@/services/ventas";

/* ───────── Interfaces ───────── */
interface Venta {
  id: string;
  fecha: string;
  total: number;
  costo_total: number;
  ganancia: number;
  tipo_pago: string;
  cliente_nombre: string;
  estado: string;
  detalles?: DetalleVenta[];
}

interface DetalleVenta {
  producto_nombre: string;
  cantidad: number;
  total: number;
}

interface DashboardData {
  ventas_hoy: number;
  ventas_mes: number;
  total_hoy: number;
  total_mes: number;
  total_productos: number;
  productos_stock_bajo: number;
  [key: string]: unknown;
}

interface ProductoStockBajo {
  id: string;
  nombre: string;
  codigo: string;
  stock: number;
  stock_minimo: number;
  precio: number;
}

/* ───────── Theme ───────── */
const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

const DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"];
const MESES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

const CHART_COLORS = [
  "#0ea5e9", "#1d4ed8", "#8b5cf6", "#f59e0b", "#10b981",
  "#ef4444", "#ec4899", "#6366f1"
];

/* ───────── Helpers ───────── */
const formatCurrency = (n: number) =>
  new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

const formatCompact = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
};

const defaultDesde = (): string => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split("T")[0];
};

const defaultHasta = (): string => new Date().toISOString().split("T")[0];

/* ───────── Component ───────── */
export default function BIPage() {
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [desde, setDesde] = useState(defaultDesde);
  const [hasta, setHasta] = useState(defaultHasta);

  // Data
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [dashData, setDashData] = useState<DashboardData | null>(null);
  const [stockBajo, setStockBajo] = useState<ProductoStockBajo[]>([]);
  const [ultimaAct, setUltimaAct] = useState<Date>(new Date());

  // Auto-refresh
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const esClaro = tema.texto === "#0f172a";

  /* ───────── Data Loading ───────── */
  const cargarDatos = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setError("");
    try {
      const [ventasRes, dashRes, stockRes] = await Promise.allSettled([
        api.get("/ventas/", { params: { desde, hasta } }),
        ventaService.dashboard(),
        inventoryService.getStockBajo(),
      ]);

      if (ventasRes.status === "fulfilled") {
        const d = ventasRes.value.data;
        setVentas(Array.isArray(d) ? d : d.results || []);
      }
      if (dashRes.status === "fulfilled") {
        setDashData(dashRes.value.data);
      }
      if (stockRes.status === "fulfilled") {
        const d = stockRes.value.data;
        setStockBajo(Array.isArray(d) ? d : d.results || []);
      }

      setUltimaAct(new Date());
    } catch {
      setError("Error al cargar datos del BI. Intente nuevamente.");
    } finally {
      setLoading(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
  }, []);

  useEffect(() => {
    if (mounted) cargarDatos();
  }, [mounted, cargarDatos]);

  // Auto-refresh every 60s
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      cargarDatos(true);
    }, 60000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cargarDatos]);

  /* ───────── Computed Data ───────── */
  const ventasCompletadas = ventas.filter(v => v.estado === "COMPLETADA");

  // KPIs
  const totalVentas = ventasCompletadas.reduce((s, v) => s + Number(v.total || 0), 0);
  const totalCosto = ventasCompletadas.reduce((s, v) => s + Number(v.costo_total || 0), 0);
  const margenBruto = totalVentas > 0 ? ((totalVentas - totalCosto) / totalVentas) * 100 : 0;

  // Growth vs previous period
  const diasPeriodo = Math.max(1, Math.ceil((new Date(hasta).getTime() - new Date(desde).getTime()) / (1000 * 60 * 60 * 24)));
  const mitadPeriodo = new Date(desde);
  mitadPeriodo.setDate(mitadPeriodo.getDate() - diasPeriodo);
  const ventasPeriodoAnterior = ventas.filter(v => {
    const f = new Date(v.fecha);
    return f >= mitadPeriodo && f < new Date(desde) && v.estado === "COMPLETADA";
  }).reduce((s, v) => s + Number(v.total || 0), 0);
  const crecimiento = ventasPeriodoAnterior > 0
    ? ((totalVentas - ventasPeriodoAnterior) / ventasPeriodoAnterior) * 100
    : totalVentas > 0 ? 100 : 0;

  // Sales by month (last 12 months)
  const ventasPorMes = (() => {
    const meses: { label: string; total: number }[] = [];
    const ahora = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const total = ventasCompletadas
        .filter(v => v.fecha && v.fecha.startsWith(key))
        .reduce((s, v) => s + Number(v.total || 0), 0);
      meses.push({ label: MESES_CORTO[d.getMonth()], total });
    }
    return meses;
  })();

  // Top 5 products
  const topProductos = (() => {
    const map: Record<string, { nombre: string; total: number; qty: number }> = {};
    ventasCompletadas.forEach(v => {
      if (v.detalles) {
        v.detalles.forEach(d => {
          const key = d.producto_nombre || "Desconocido";
          if (!map[key]) map[key] = { nombre: key, total: 0, qty: 0 };
          map[key].total += Number(d.total || 0);
          map[key].qty += Number(d.cantidad || 0);
        });
      }
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  })();

  // Sales by payment type
  const ventasPorTipoPago = (() => {
    const map: Record<string, number> = {};
    ventasCompletadas.forEach(v => {
      const tipo = v.tipo_pago || "Otro";
      map[tipo] = (map[tipo] || 0) + Number(v.total || 0);
    });
    return Object.entries(map)
      .map(([tipo, total]) => ({ tipo, total }))
      .sort((a, b) => b.total - a.total);
  })();

  // Sales by day of week
  const ventasPorDia = (() => {
    const dias = [0, 0, 0, 0, 0, 0, 0];
    ventasCompletadas.forEach(v => {
      if (v.fecha) {
        const day = new Date(v.fecha).getDay();
        dias[day] += Number(v.total || 0);
      }
    });
    return dias.map((total, i) => ({ dia: DIAS_SEMANA[i], total }));
  })();

  // Top 10 clientes
  const topClientes = (() => {
    const map: Record<string, { nombre: string; total: number; count: number }> = {};
    ventasCompletadas.forEach(v => {
      const key = v.cliente_nombre || "Consumidor final";
      if (!map[key]) map[key] = { nombre: key, total: 0, count: 0 };
      map[key].total += Number(v.total || 0);
      map[key].count += 1;
    });
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
  })();

  /* ───────── SVG Charts ───────── */
  const LineChart = ({ data, width = 600, height = 220 }: { data: { label: string; total: number }[]; width?: number; height?: number }) => {
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxVal = Math.max(...data.map(d => d.total), 1);

    const points = data.map((d, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
      const y = padding.top + chartH - (d.total / maxVal) * chartH;
      return { x, y, ...d };
    });

    const polyline = points.map(p => `${p.x},${p.y}`).join(" ");
    const areaPath = `M${points[0]?.x},${padding.top + chartH} ${points.map(p => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1]?.x},${padding.top + chartH} Z`;

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tema.accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={tema.accent} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = padding.top + chartH - pct * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={tema.borde} strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fill={tema.subtexto} fontSize="10" fontFamily="DM Sans">
                {formatCompact(maxVal * pct)}
              </text>
            </g>
          );
        })}
        {/* Area */}
        {points.length > 1 && <path d={areaPath} fill="url(#lineGrad)" />}
        {/* Line */}
        {points.length > 1 && <polyline points={polyline} fill="none" stroke={tema.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {/* Dots */}
        {points.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={tema.accent} stroke={tema.bg} strokeWidth="2" />
            <text x={p.x} y={height - 8} textAnchor="middle" fill={tema.subtexto} fontSize="9" fontFamily="DM Sans">
              {p.label}
            </text>
          </g>
        ))}
      </svg>
    );
  };

  const BarChart = ({ data, width = 600, height = 220, horizontal = false }: { data: { label: string; value: number; color?: string }[]; width?: number; height?: number; horizontal?: boolean }) => {
    const padding = horizontal
      ? { top: 10, right: 20, bottom: 10, left: 120 }
      : { top: 20, right: 20, bottom: 50, left: 60 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;
    const maxVal = Math.max(...data.map(d => d.value), 1);

    if (horizontal) {
      const barH = Math.min(30, (chartH - (data.length - 1) * 6) / data.length);
      return (
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
          {data.map((d, i) => {
            const y = padding.top + i * (barH + 6);
            const w = (d.value / maxVal) * chartW;
            const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
            return (
              <g key={i}>
                <text x={padding.left - 8} y={y + barH / 2 + 4} textAnchor="end" fill={tema.subtexto} fontSize="10" fontFamily="DM Sans">
                  {d.label.length > 18 ? d.label.substring(0, 18) + "..." : d.label}
                </text>
                <rect x={padding.left} y={y} width={w} height={barH} rx="4" fill={color} opacity="0.85" />
                <text x={padding.left + w + 6} y={y + barH / 2 + 4} fill={tema.texto} fontSize="10" fontFamily="DM Sans" fontWeight="600">
                  {formatCompact(d.value)}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    const barW = Math.min(50, (chartW - (data.length - 1) * 8) / data.length);
    const gap = (chartW - barW * data.length) / Math.max(data.length - 1, 1);

    return (
      <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto" }}>
        {/* Grid */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
          const y = padding.top + chartH - pct * chartH;
          return (
            <g key={i}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={tema.borde} strokeWidth="1" />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" fill={tema.subtexto} fontSize="10" fontFamily="DM Sans">
                {formatCompact(maxVal * pct)}
              </text>
            </g>
          );
        })}
        {/* Bars */}
        {data.map((d, i) => {
          const x = padding.left + i * (barW + gap);
          const h = (d.value / maxVal) * chartH;
          const y = padding.top + chartH - h;
          const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={h} rx="4" fill={color} opacity="0.85" />
              <text x={x + barW / 2} y={height - 8} textAnchor="middle" fill={tema.subtexto} fontSize="9" fontFamily="DM Sans">
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const DonutChart = ({ data, size = 200 }: { data: { label: string; value: number; color?: string }[]; size?: number }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) return <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", maxWidth: size, height: "auto" }} />;

    const radius = 70;
    const stroke = 28;
    const circumference = 2 * Math.PI * radius;
    const cx = size / 2;
    const cy = size / 2;
    let currentOffset = 0;

    return (
      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap", justifyContent: "center" }}>
        <svg viewBox={`0 0 ${size} ${size}`} style={{ width: "100%", maxWidth: size, height: "auto" }}>
          {data.map((d, i) => {
            const pct = d.value / total;
            const dashLen = pct * circumference;
            const dashGap = circumference - dashLen;
            const offset = -currentOffset;
            currentOffset += dashLen;
            const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
            return (
              <circle
                key={i}
                cx={cx} cy={cy} r={radius}
                fill="none"
                stroke={color}
                strokeWidth={stroke}
                strokeDasharray={`${dashLen} ${dashGap}`}
                strokeDashoffset={offset}
                transform={`rotate(-90 ${cx} ${cy})`}
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            );
          })}
          <text x={cx} y={cy - 6} textAnchor="middle" fill={tema.texto} fontSize="16" fontFamily="Syne" fontWeight="800">
            {formatCompact(total)}
          </text>
          <text x={cx} y={cy + 12} textAnchor="middle" fill={tema.subtexto} fontSize="10" fontFamily="DM Sans">
            Total
          </text>
        </svg>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.map((d, i) => {
            const color = d.color || CHART_COLORS[i % CHART_COLORS.length];
            const pct = total > 0 ? ((d.value / total) * 100).toFixed(1) : "0";
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} />
                <span style={{ color: tema.subtexto }}>{d.label}</span>
                <span style={{ fontWeight: 600, marginLeft: "auto" }}>{pct}%</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  /* ───────── Render guard ───────── */
  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:${tema.bg}; font-family:'DM Sans',sans-serif; }
        .page { min-height:100vh; background:${tema.bg}; color:${tema.texto}; padding:32px; }
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:16px; }
        .header-left { display:flex; align-items:center; gap:16px; }
        .back-btn { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:8px 16px; color:${tema.subtexto}; font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .back-btn:hover { color:${tema.accent}; border-color:${tema.accent}40; }
        .page-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .page-title span { color:${tema.accent}; }
        .controls { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; align-items:flex-end; }
        .control-group { display:flex; flex-direction:column; gap:4px; }
        .control-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .control-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; }
        .control-input:focus { border-color:${tema.accent}50; }
        .control-input::-webkit-calendar-picker-indicator { filter:${esClaro ? "none" : "invert(0.7)"}; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .stats-row { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; margin-bottom:28px; }
        .kpi-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:14px; padding:20px 24px; transition:all 0.2s; }
        .kpi-card:hover { border-color:${tema.accent}30; transform:translateY(-1px); }
        .kpi-label { font-size:12px; color:${tema.subtexto}; margin-bottom:6px; text-transform:uppercase; font-weight:600; letter-spacing:0.06em; }
        .kpi-val { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; line-height:1.2; }
        .kpi-sub { font-size:11px; color:${tema.subtexto}; margin-top:4px; }
        .kpi-positive { color:#10b981; }
        .kpi-negative { color:#ef4444; }
        .charts-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px; }
        @media (max-width:900px) { .charts-grid { grid-template-columns:1fr; } }
        .chart-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px; overflow:hidden; }
        .chart-title { font-family:'Syne',sans-serif; font-size:15px; font-weight:700; margin-bottom:16px; }
        .chart-title span { color:${tema.accent}; }
        .tables-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:28px; }
        @media (max-width:900px) { .tables-grid { grid-template-columns:1fr; } }
        .table-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow:hidden; }
        .table-card-header { padding:20px 24px 0; }
        .table-card-title { font-family:'Syne',sans-serif; font-size:15px; font-weight:700; margin-bottom:16px; }
        .table-card-title span { color:${tema.accent}; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th { padding:10px 16px; text-align:left; font-size:10px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; white-space:nowrap; }
        td { padding:12px 16px; font-size:13px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:10px; font-weight:600; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .realtime-bar { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; margin-bottom:24px; flex-wrap:wrap; gap:8px; }
        .realtime-dot { width:8px; height:8px; border-radius:50%; background:#10b981; display:inline-block; margin-right:8px; animation:pulse 2s infinite; }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        .realtime-text { font-size:12px; color:${tema.subtexto}; display:flex; align-items:center; }
        .error-msg { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; }
        .loading-state { text-align:center; padding:80px 20px; color:${tema.subtexto}; }
        .loading-spinner { width:40px; height:40px; border:3px solid ${tema.borde}; border-top-color:${tema.accent}; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px; }
        @keyframes spin { to { transform:rotate(360deg); } }
        .empty-chart { display:flex; align-items:center; justify-content:center; min-height:180px; color:${tema.subtexto}; font-size:13px; }
        .rank-num { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; font-size:10px; font-weight:700; background:${esClaro ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.06)"}; color:${tema.subtexto}; font-family:'Syne',sans-serif; }
        .rank-num.top3 { background:${tema.accent}20; color:${tema.accent}; }
        .stock-bar { width:60px; height:6px; background:${tema.borde}; border-radius:3px; overflow:hidden; }
        .stock-fill { height:100%; border-radius:3px; }
      `}</style>

      <div className="page">
        {/* ─── Header ─── */}
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href = "/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Business</span> Intelligence</h1>
          </div>
        </div>

        {/* ─── Real-time indicator ─── */}
        <div className="realtime-bar">
          <div className="realtime-text">
            <span className="realtime-dot" />
            Ultima actualizacion: {ultimaAct.toLocaleString("es-DO", { dateStyle: "medium", timeStyle: "medium" })}
          </div>
          <div style={{ display: "flex", gap: 8, fontSize: 12, color: tema.subtexto }}>
            <span>Auto-refresh: 60s</span>
          </div>
        </div>

        {/* ─── Date Filters ─── */}
        <div className="controls">
          <div className="control-group">
            <div className="control-label">Desde</div>
            <input type="date" className="control-input" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="control-group">
            <div className="control-label">Hasta</div>
            <input type="date" className="control-input" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => cargarDatos()} disabled={loading}>
            {loading ? "Cargando..." : "Aplicar filtro"}
          </button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner" />
            <p>Cargando datos de Business Intelligence...</p>
          </div>
        ) : (
          <>
            {/* ─── KPI Cards ─── */}
            <div className="stats-row">
              <div className="kpi-card">
                <div className="kpi-label">Ventas del periodo</div>
                <div className="kpi-val" style={{ color: tema.accent }}>{formatCurrency(totalVentas)}</div>
                <div className="kpi-sub">{ventasCompletadas.length} transacciones completadas</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Compras del periodo</div>
                <div className="kpi-val">{formatCurrency(totalCosto)}</div>
                <div className="kpi-sub">Costo de mercancia vendida</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Margen bruto</div>
                <div className="kpi-val" style={{ color: margenBruto >= 30 ? "#10b981" : margenBruto >= 15 ? "#f59e0b" : "#ef4444" }}>
                  {margenBruto.toFixed(1)}%
                </div>
                <div className="kpi-sub">Ganancia: {formatCurrency(totalVentas - totalCosto)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Crecimiento vs periodo anterior</div>
                <div className={`kpi-val ${crecimiento >= 0 ? "kpi-positive" : "kpi-negative"}`}>
                  {crecimiento >= 0 ? "+" : ""}{crecimiento.toFixed(1)}%
                </div>
                <div className="kpi-sub">
                  Periodo anterior: {formatCurrency(ventasPeriodoAnterior)}
                </div>
              </div>
            </div>

            {/* ─── Charts 2x2 Grid ─── */}
            <div className="charts-grid">
              {/* Sales Trend Line Chart */}
              <div className="chart-card">
                <div className="chart-title"><span>Tendencia</span> de ventas (12 meses)</div>
                {ventasPorMes.some(m => m.total > 0) ? (
                  <LineChart data={ventasPorMes} />
                ) : (
                  <div className="empty-chart">Sin datos de ventas en los ultimos 12 meses</div>
                )}
              </div>

              {/* Top 5 Products Bar Chart */}
              <div className="chart-card">
                <div className="chart-title"><span>Top 5</span> productos por ventas</div>
                {topProductos.length > 0 ? (
                  <BarChart
                    data={topProductos.map((p, i) => ({ label: p.nombre, value: p.total, color: CHART_COLORS[i] }))}
                    horizontal
                  />
                ) : (
                  <div className="empty-chart">Sin datos de productos en el periodo</div>
                )}
              </div>

              {/* Sales by Payment Type Donut */}
              <div className="chart-card">
                <div className="chart-title"><span>Ventas</span> por tipo de pago</div>
                {ventasPorTipoPago.length > 0 ? (
                  <DonutChart
                    data={ventasPorTipoPago.map((p, i) => ({ label: p.tipo, value: p.total, color: CHART_COLORS[i] }))}
                  />
                ) : (
                  <div className="empty-chart">Sin datos de pagos en el periodo</div>
                )}
              </div>

              {/* Sales by Day of Week */}
              <div className="chart-card">
                <div className="chart-title"><span>Ventas</span> por dia de la semana</div>
                {ventasPorDia.some(d => d.total > 0) ? (
                  <BarChart
                    data={ventasPorDia.map((d, i) => ({ label: d.dia, value: d.total, color: CHART_COLORS[i % CHART_COLORS.length] }))}
                  />
                ) : (
                  <div className="empty-chart">Sin datos de ventas por dia</div>
                )}
              </div>
            </div>

            {/* ─── Tables Section ─── */}
            <div className="tables-grid">
              {/* Top 10 Clientes */}
              <div className="table-card">
                <div className="table-card-header">
                  <div className="table-card-title"><span>Top 10</span> clientes</div>
                </div>
                {topClientes.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Cliente</th>
                        <th>Transacciones</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topClientes.map((c, i) => (
                        <tr key={i}>
                          <td><span className={`rank-num ${i < 3 ? "top3" : ""}`}>{i + 1}</span></td>
                          <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                          <td>{c.count}</td>
                          <td style={{ fontWeight: 600, color: tema.accent }}>{formatCurrency(c.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-chart">Sin datos de clientes en el periodo</div>
                )}
              </div>

              {/* Productos Stock Bajo */}
              <div className="table-card">
                <div className="table-card-header">
                  <div className="table-card-title"><span>Productos</span> stock bajo</div>
                </div>
                {stockBajo.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Codigo</th>
                        <th>Stock</th>
                        <th>Minimo</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stockBajo.slice(0, 10).map((p, i) => {
                        const pctStock = p.stock_minimo > 0 ? (p.stock / p.stock_minimo) * 100 : 0;
                        const stockColor = pctStock <= 25 ? "#ef4444" : pctStock <= 50 ? "#f59e0b" : "#10b981";
                        return (
                          <tr key={p.id || i}>
                            <td style={{ fontWeight: 500 }}>{p.nombre}</td>
                            <td style={{ fontFamily: "monospace", fontSize: 12 }}>{p.codigo || "---"}</td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontWeight: 600 }}>{p.stock}</span>
                                <div className="stock-bar">
                                  <div className="stock-fill" style={{ width: `${Math.min(pctStock, 100)}%`, background: stockColor }} />
                                </div>
                              </div>
                            </td>
                            <td>{p.stock_minimo}</td>
                            <td>
                              {p.stock === 0
                                ? <span className="badge badge-red">Agotado</span>
                                : pctStock <= 50
                                  ? <span className="badge badge-yellow">Critico</span>
                                  : <span className="badge badge-green">Bajo</span>
                              }
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="empty-chart" style={{ padding: "40px 20px" }}>Todos los productos tienen stock adecuado</div>
                )}
              </div>
            </div>

            {/* ─── Dashboard Summary from API ─── */}
            {dashData && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 28 }}>
                {[
                  { label: "Ventas hoy", val: dashData.ventas_hoy ?? "---" },
                  { label: "Ventas este mes", val: dashData.ventas_mes ?? "---" },
                  { label: "Total hoy", val: typeof dashData.total_hoy === "number" ? formatCurrency(dashData.total_hoy) : "---" },
                  { label: "Total mes", val: typeof dashData.total_mes === "number" ? formatCurrency(dashData.total_mes) : "---" },
                  { label: "Total productos", val: dashData.total_productos ?? "---" },
                  { label: "Stock bajo", val: dashData.productos_stock_bajo ?? stockBajo.length },
                ].map((item, i) => (
                  <div key={i} className="kpi-card">
                    <div className="kpi-label">{item.label}</div>
                    <div className="kpi-val" style={{ fontSize: 18 }}>{item.val}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
