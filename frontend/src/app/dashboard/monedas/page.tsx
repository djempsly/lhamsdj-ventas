"use client";
import { useEffect, useState, useMemo } from "react";
import { monedasService, tasasCambioService } from "@/services/monedas";

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

interface Moneda {
  id: string;
  codigo: string;
  nombre: string;
  simbolo: string;
}

interface TasaCambio {
  id: string;
  moneda_origen: string;
  moneda_destino: string;
  moneda_origen_codigo?: string;
  moneda_destino_codigo?: string;
  tasa: number;
  fecha: string;
}

interface TasaActual {
  USD_DOP?: number;
  EUR_DOP?: number;
  fecha?: string;
  tasas?: Array<{ moneda_origen: string; moneda_destino: string; tasa: number; fecha: string }>;
}

export default function MonedasPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tasas, setTasas] = useState<TasaCambio[]>([]);
  const [tasaActual, setTasaActual] = useState<TasaActual | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [chartPair, setChartPair] = useState("USD-DOP");
  const [form, setForm] = useState({
    moneda_origen: "",
    moneda_destino: "",
    tasa: "",
    fecha: new Date().toISOString().split("T")[0],
  });

  useEffect(() => {
    setMounted(true);
    try {
      const t = localStorage.getItem("tema");
      if (t) setTema(JSON.parse(t));
    } catch { /* default */ }
  }, []);

  useEffect(() => {
    if (mounted) cargarDatos();
  }, [mounted]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [monedasRes, tasasRes, actualRes] = await Promise.allSettled([
        monedasService.getAll(),
        tasasCambioService.getAll(),
        tasasCambioService.actual(),
      ]);
      if (monedasRes.status === "fulfilled") {
        const d = monedasRes.value.data;
        setMonedas(Array.isArray(d) ? d : d.results || []);
      }
      if (tasasRes.status === "fulfilled") {
        const d = tasasRes.value.data;
        setTasas(Array.isArray(d) ? d : d.results || []);
      }
      if (actualRes.status === "fulfilled") {
        setTasaActual(actualRes.value.data);
      }
    } catch { /* interceptor handles auth */ }
    setLoading(false);
  };

  const fmtTasa = (n: number) => new Intl.NumberFormat("es-DO", {
    minimumFractionDigits: 2, maximumFractionDigits: 4,
  }).format(n);

  const getMonedaCodigo = (id: string) => {
    const m = monedas.find((mon) => mon.id === id || mon.codigo === id);
    return m?.codigo || id;
  };

  const pairKey = (t: TasaCambio) => {
    const origen = t.moneda_origen_codigo || getMonedaCodigo(t.moneda_origen);
    const destino = t.moneda_destino_codigo || getMonedaCodigo(t.moneda_destino);
    return `${origen}-${destino}`;
  };

  const availablePairs = useMemo(() => {
    const pairs = new Set<string>();
    tasas.forEach((t) => pairs.add(pairKey(t)));
    if (pairs.size === 0) {
      pairs.add("USD-DOP");
      pairs.add("EUR-DOP");
    }
    return Array.from(pairs);
  }, [tasas, monedas]);

  const chartData = useMemo(() => {
    const filtered = tasas
      .filter((t) => pairKey(t) === chartPair)
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime())
      .slice(-30);
    return filtered;
  }, [tasas, chartPair, monedas]);

  const renderChart = () => {
    if (chartData.length < 2) {
      return (
        <div style={{ textAlign: "center", padding: "40px 20px", color: tema.subtexto, fontSize: "0.85rem" }}>
          Se necesitan al menos 2 registros para mostrar la tendencia de {chartPair}.
        </div>
      );
    }

    const values = chartData.map((d) => d.tasa);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const svgWidth = 720;
    const svgHeight = 220;
    const padTop = 20;
    const padBottom = 30;
    const padLeft = 60;
    const padRight = 20;
    const chartW = svgWidth - padLeft - padRight;
    const chartH = svgHeight - padTop - padBottom;

    const points = chartData.map((d, i) => {
      const x = padLeft + (i / (chartData.length - 1)) * chartW;
      const y = padTop + chartH - ((d.tasa - minVal) / range) * chartH;
      return { x, y, tasa: d.tasa, fecha: d.fecha };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath = linePath + ` L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`;

    const gridLines = 5;
    const gridElements = [];
    for (let i = 0; i <= gridLines; i++) {
      const val = minVal + (range * i) / gridLines;
      const y = padTop + chartH - (i / gridLines) * chartH;
      gridElements.push(
        <g key={`grid-${i}`}>
          <line x1={padLeft} y1={y} x2={svgWidth - padRight} y2={y}
            stroke={tema.borde} strokeWidth="1" />
          <text x={padLeft - 8} y={y + 4} textAnchor="end"
            fill={tema.subtexto} fontSize="10" fontFamily="DM Sans, sans-serif">
            {fmtTasa(val)}
          </text>
        </g>
      );
    }

    const labelStep = Math.max(1, Math.floor(chartData.length / 6));
    const dateLabels = points.filter((_, i) => i % labelStep === 0 || i === points.length - 1);

    return (
      <svg width="100%" viewBox={`0 0 ${svgWidth} ${svgHeight}`} style={{ display: "block" }}>
        {gridElements}
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tema.accent} stopOpacity="0.3" />
            <stop offset="100%" stopColor={tema.accent} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#chartGrad)" />
        <path d={linePath} fill="none" stroke={tema.accent} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3.5"
            fill={tema.bg} stroke={tema.accent} strokeWidth="2" />
        ))}
        {dateLabels.map((p, i) => (
          <text key={`lbl-${i}`} x={p.x} y={svgHeight - 6} textAnchor="middle"
            fill={tema.subtexto} fontSize="9" fontFamily="DM Sans, sans-serif">
            {p.fecha.slice(5)}
          </text>
        ))}
      </svg>
    );
  };

  const handleSubmit = async () => {
    if (!form.moneda_origen) { setFormError("Seleccione la moneda de origen."); return; }
    if (!form.moneda_destino) { setFormError("Seleccione la moneda de destino."); return; }
    if (form.moneda_origen === form.moneda_destino) { setFormError("Las monedas deben ser diferentes."); return; }
    if (!form.tasa || parseFloat(form.tasa) <= 0) { setFormError("La tasa debe ser mayor que 0."); return; }
    if (!form.fecha) { setFormError("La fecha es requerida."); return; }
    setFormError("");
    setSaving(true);
    try {
      await tasasCambioService.create({
        moneda_origen: form.moneda_origen,
        moneda_destino: form.moneda_destino,
        tasa: parseFloat(form.tasa),
        fecha: form.fecha,
      });
      setShowModal(false);
      resetForm();
      cargarDatos();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        setFormError(String(Object.values(e.response.data).flat().join(". ")).substring(0, 200));
      } else {
        setFormError("Error de conexion.");
      }
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({ moneda_origen: "", moneda_destino: "", tasa: "", fecha: new Date().toISOString().split("T")[0] });
    setFormError("");
  };

  const esClaro = tema.texto === "#0f172a";

  const usdRate = tasaActual?.USD_DOP
    ?? tasaActual?.tasas?.find((t) => t.moneda_origen === "USD")?.tasa
    ?? null;
  const eurRate = tasaActual?.EUR_DOP
    ?? tasaActual?.tasas?.find((t) => t.moneda_origen === "EUR")?.tasa
    ?? null;
  const rateDate = tasaActual?.fecha
    ?? tasaActual?.tasas?.[0]?.fecha
    ?? null;

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
        .back-btn { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:8px 16px;
          color:${tema.subtexto}; font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .back-btn:hover { color:${tema.accent}; border-color:${tema.accent}40; }
        .page-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .page-title span { color:${tema.accent}; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none;
          border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer;
          transition:all 0.2s; font-family:'Syne',sans-serif; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }

        .rates-hero { display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:24px; }
        @media(max-width:640px) { .rates-hero { grid-template-columns:1fr; } }
        .rate-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px;
          position:relative; overflow:hidden; transition:all 0.2s; }
        .rate-card:hover { border-color:${tema.accent}30; transform:translateY(-2px); }
        .rate-card-glow { position:absolute; top:-40px; right:-40px; width:120px; height:120px;
          border-radius:50%; filter:blur(50px); opacity:0.15; pointer-events:none; }
        .rate-card-pair { font-size:12px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase;
          letter-spacing:0.1em; margin-bottom:8px; }
        .rate-card-value { font-family:'Syne',sans-serif; font-size:32px; font-weight:800; }
        .rate-card-date { font-size:11px; color:${tema.subtexto}; margin-top:6px; }
        .rate-card-flag { font-size:20px; margin-right:6px; }

        .section-title { font-family:'Syne',sans-serif; font-size:16px; font-weight:700; margin-bottom:14px;
          display:flex; align-items:center; gap:8px; }
        .section-title span { color:${tema.accent}; }

        .chart-section { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px;
          padding:24px; margin-bottom:24px; }
        .chart-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px;
          flex-wrap:wrap; gap:12px; }
        .pair-select { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"};
          border:1px solid ${tema.borde}; border-radius:10px; padding:8px 14px; font-size:13px;
          color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; cursor:pointer; }
        .pair-select:focus { border-color:${tema.accent}50; }

        .tc-table { width:100%; border-collapse:separate; border-spacing:0; background:${tema.card};
          border-radius:16px; overflow:hidden; border:1px solid ${tema.borde}; }
        .tc-table th { padding:12px 16px; text-align:left; font-size:11px; text-transform:uppercase;
          letter-spacing:0.08em; color:${tema.subtexto}; border-bottom:1px solid ${tema.borde};
          font-weight:600; background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.015)"}; }
        .tc-table td { padding:11px 16px; border-bottom:1px solid ${tema.borde}; font-size:13px; }
        .tc-table tr:last-child td { border-bottom:none; }
        .tc-table tr:hover td { background:${esClaro ? "rgba(0,0,0,0.015)" : "rgba(255,255,255,0.02)"}; }
        .tc-badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px;
          font-size:10px; font-weight:600; background:rgba(14,165,233,0.12); color:${tema.accent}; }
        .tc-tasa { font-family:'Syne',sans-serif; font-weight:700; color:${tema.accent}; }

        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex;
          align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde};
          border-radius:20px; padding:36px; width:100%; max-width:480px; max-height:90vh;
          overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:24px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase;
          letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"};
          border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px;
          color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px;
          color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .btn-cancel:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        .form-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18);
          border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px;
          grid-column:1/-1; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => (window.location.href = "/dashboard")}>
              Volver
            </button>
            <h1 className="page-title">Tasas de <span>Cambio</span></h1>
          </div>
          <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>
            + Nueva Tasa
          </button>
        </div>

        {loading ? (
          <div className="loading">Cargando tasas de cambio...</div>
        ) : (
          <>
            {/* --- Current rates hero cards --- */}
            <div className="rates-hero">
              <div className="rate-card">
                <div className="rate-card-glow" style={{ background: tema.accent }} />
                <div className="rate-card-pair">
                  <span className="rate-card-flag">$</span> USD / DOP
                </div>
                <div className="rate-card-value" style={{ color: tema.accent }}>
                  {usdRate != null ? fmtTasa(usdRate) : "--"}
                </div>
                <div className="rate-card-date">
                  {rateDate ? `Actualizado: ${rateDate}` : "Sin datos disponibles"}
                </div>
              </div>
              <div className="rate-card">
                <div className="rate-card-glow" style={{ background: tema.secondary }} />
                <div className="rate-card-pair">
                  <span className="rate-card-flag">&#8364;</span> EUR / DOP
                </div>
                <div className="rate-card-value" style={{ color: tema.secondary }}>
                  {eurRate != null ? fmtTasa(eurRate) : "--"}
                </div>
                <div className="rate-card-date">
                  {rateDate ? `Actualizado: ${rateDate}` : "Sin datos disponibles"}
                </div>
              </div>
            </div>

            {/* --- Chart section --- */}
            <div className="chart-section">
              <div className="chart-header">
                <div className="section-title">
                  Tendencia de <span>{chartPair}</span>
                </div>
                <select className="pair-select" value={chartPair}
                  onChange={(e) => setChartPair(e.target.value)}>
                  {availablePairs.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              {renderChart()}
            </div>

            {/* --- Rate history table --- */}
            <div className="section-title" style={{ marginTop: 8 }}>
              Historial de <span>Tasas</span>
            </div>
            {tasas.length === 0 ? (
              <div className="empty-state">
                No hay tasas de cambio registradas. Agregue la primera.
              </div>
            ) : (
              <table className="tc-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Moneda Origen</th>
                    <th>Moneda Destino</th>
                    <th>Tasa</th>
                  </tr>
                </thead>
                <tbody>
                  {[...tasas]
                    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                    .map((t) => (
                      <tr key={t.id}>
                        <td>{t.fecha}</td>
                        <td>
                          <span className="tc-badge">
                            {t.moneda_origen_codigo || getMonedaCodigo(t.moneda_origen)}
                          </span>
                        </td>
                        <td>
                          <span className="tc-badge">
                            {t.moneda_destino_codigo || getMonedaCodigo(t.moneda_destino)}
                          </span>
                        </td>
                        <td className="tc-tasa">{fmtTasa(t.tasa)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* --- Add new rate modal --- */}
      {showModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Nueva Tasa de Cambio</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group">
                <label className="form-label">Moneda Origen *</label>
                <select className="form-input" value={form.moneda_origen}
                  onChange={(e) => setForm({ ...form, moneda_origen: e.target.value })}>
                  <option value="">-- Seleccionar --</option>
                  {monedas.map((m) => (
                    <option key={m.id} value={m.id}>{m.codigo} - {m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Moneda Destino *</label>
                <select className="form-input" value={form.moneda_destino}
                  onChange={(e) => setForm({ ...form, moneda_destino: e.target.value })}>
                  <option value="">-- Seleccionar --</option>
                  {monedas.map((m) => (
                    <option key={m.id} value={m.id}>{m.codigo} - {m.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tasa *</label>
                <input className="form-input" type="number" step="0.0001" min="0" placeholder="58.50"
                  value={form.tasa} onChange={(e) => setForm({ ...form, tasa: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha *</label>
                <input className="form-input" type="date" value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={handleSubmit} disabled={saving}>
                {saving ? "Guardando..." : "Registrar Tasa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
