"use client";
import { useEffect, useState } from "react";
import { cuadreService } from "@/services/cuadres";

interface CuadreCaja {
  id: string;
  fecha: string;
  cajero: string;
  cajero_nombre: string;
  efectivo_inicial: number;
  ventas_efectivo: number;
  ventas_tarjeta: number;
  ventas_transferencia: number;
  total_ventas: number;
  efectivo_esperado: number;
  efectivo_contado: number;
  diferencia: number;
  estado: string;
  notas: string;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function CuadresPage() {
  const [cuadres, setCuadres] = useState<CuadreCaja[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [showAbrir, setShowAbrir] = useState(false);
  const [showCerrar, setShowCerrar] = useState<CuadreCaja | null>(null);
  const [efectivoInicial, setEfectivoInicial] = useState("");
  const [efectivoContado, setEfectivoContado] = useState("");
  const [notasCierre, setNotasCierre] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data } = await cuadreService.getAll();
      setCuadres(Array.isArray(data) ? data : data.results || []);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  const cajaAbierta = cuadres.find(c => c.estado === "ABIERTO");

  const abrirCaja = async () => {
    const monto = parseFloat(efectivoInicial);
    if (isNaN(monto) || monto < 0) { setError("Monto inicial invalido."); return; }
    setError("");
    setSaving(true);
    try {
      await cuadreService.crear({
        fecha: new Date().toISOString().split('T')[0],
        efectivo_inicial: monto,
      });
      setShowAbrir(false);
      setEfectivoInicial("");
      cargarDatos();
    } catch {
      setError("Error al abrir caja.");
    } finally {
      setSaving(false);
    }
  };

  const cerrarCaja = async () => {
    if (!showCerrar) return;
    const monto = parseFloat(efectivoContado);
    if (isNaN(monto) || monto < 0) { setError("Monto contado invalido."); return; }
    setError("");
    setSaving(true);
    try {
      await cuadreService.actualizar(showCerrar.id, {
        efectivo_contado: monto,
        diferencia: monto - showCerrar.efectivo_esperado,
        estado: "CERRADO",
        notas: notasCierre,
      });
      setShowCerrar(null);
      setEfectivoContado("");
      setNotasCierre("");
      cargarDatos();
    } catch {
      setError("Error al cerrar caja.");
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
  const esClaro = tema.texto === "#0f172a";
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
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .status-card {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px;
          padding:24px; margin-bottom:24px;
        }
        .status-card h3 { font-family:'Syne',sans-serif; font-size:16px; font-weight:700; margin-bottom:16px; }
        .status-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
        .status-item-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; }
        .status-item-val { font-family:'Syne',sans-serif; font-size:18px; font-weight:700; margin-top:2px; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; }
        td { padding:14px 16px; font-size:14px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .action-btn { background:none; border:1px solid ${tema.borde}; border-radius:8px; padding:5px 10px; font-size:12px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; }
        .action-btn:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:420px; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:20px; }
        .form-group { display:flex; flex-direction:column; gap:6px; margin-bottom:16px; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; width:100%; }
        .form-input:focus { border-color:${tema.accent}50; }
        .modal-actions { display:flex; gap:10px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .error-msg { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .section-label { font-size:12px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; margin-bottom:12px; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Cuadres</span> de Caja</h1>
          </div>
          {!cajaAbierta && (
            <button className="btn-primary" onClick={() => { setError(""); setShowAbrir(true); }}>Abrir Caja</button>
          )}
        </div>

        {cajaAbierta && (
          <div className="status-card" style={{borderColor: "#10b98140"}}>
            <h3 style={{color:"#10b981"}}>Caja Abierta</h3>
            <div className="status-grid">
              <div><div className="status-item-label">Cajero</div><div className="status-item-val">{cajaAbierta.cajero_nombre}</div></div>
              <div><div className="status-item-label">Efectivo Inicial</div><div className="status-item-val">{formatCurrency(cajaAbierta.efectivo_inicial)}</div></div>
              <div><div className="status-item-label">Ventas Efectivo</div><div className="status-item-val">{formatCurrency(cajaAbierta.ventas_efectivo)}</div></div>
              <div><div className="status-item-label">Ventas Tarjeta</div><div className="status-item-val">{formatCurrency(cajaAbierta.ventas_tarjeta)}</div></div>
              <div><div className="status-item-label">Total Ventas</div><div className="status-item-val" style={{color:tema.accent}}>{formatCurrency(cajaAbierta.total_ventas)}</div></div>
              <div><div className="status-item-label">Esperado</div><div className="status-item-val">{formatCurrency(cajaAbierta.efectivo_esperado)}</div></div>
            </div>
            <div style={{marginTop:16}}>
              <button className="btn-primary" style={{background:"linear-gradient(135deg, #b45309, #f59e0b)"}} onClick={() => { setError(""); setShowCerrar(cajaAbierta); }}>
                Cerrar Caja
              </button>
            </div>
          </div>
        )}

        <div className="section-label">Historial de Cuadres</div>

        {loading ? (
          <div className="loading">Cargando cuadres...</div>
        ) : cuadres.filter(c => c.estado === "CERRADO").length === 0 ? (
          <div className="empty-state"><p>No hay cuadres cerrados aun.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th><th>Cajero</th><th>Ef. Inicial</th><th>Total Ventas</th>
                  <th>Esperado</th><th>Contado</th><th>Diferencia</th><th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {cuadres.filter(c => c.estado === "CERRADO").map(c => (
                  <tr key={c.id}>
                    <td>{c.fecha}</td>
                    <td>{c.cajero_nombre}</td>
                    <td>{formatCurrency(c.efectivo_inicial)}</td>
                    <td style={{color:tema.accent,fontWeight:600}}>{formatCurrency(c.total_ventas)}</td>
                    <td>{formatCurrency(c.efectivo_esperado)}</td>
                    <td>{formatCurrency(c.efectivo_contado)}</td>
                    <td>
                      <span className={`badge ${Number(c.diferencia)===0?"badge-green":Number(c.diferencia)>0?"badge-yellow":"badge-red"}`}>
                        {formatCurrency(c.diferencia)}
                      </span>
                    </td>
                    <td><span className="badge badge-green">CERRADO</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAbrir && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowAbrir(false)}>
          <div className="modal">
            <h2 className="modal-title">Abrir Caja</h2>
            {error && <div className="error-msg">{error}</div>}
            <div className="form-group">
              <label className="form-label">Efectivo Inicial (RD$)</label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={efectivoInicial} onChange={e => setEfectivoInicial(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowAbrir(false)}>Cancelar</button>
              <button className="btn-primary" onClick={abrirCaja} disabled={saving}>{saving ? "Abriendo..." : "Abrir Caja"}</button>
            </div>
          </div>
        </div>
      )}

      {showCerrar && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowCerrar(null)}>
          <div className="modal">
            <h2 className="modal-title">Cerrar Caja</h2>
            {error && <div className="error-msg">{error}</div>}
            <p style={{fontSize:13,color:tema.subtexto,marginBottom:16}}>Efectivo esperado: <strong style={{color:tema.accent}}>{formatCurrency(showCerrar.efectivo_esperado)}</strong></p>
            <div className="form-group">
              <label className="form-label">Efectivo Contado (RD$)</label>
              <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={efectivoContado} onChange={e => setEfectivoContado(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Notas</label>
              <input className="form-input" placeholder="Observaciones del cierre..." value={notasCierre} onChange={e => setNotasCierre(e.target.value)} maxLength={500} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowCerrar(null)}>Cancelar</button>
              <button className="btn-primary" onClick={cerrarCaja} disabled={saving}>{saving ? "Cerrando..." : "Cerrar Caja"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
