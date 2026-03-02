"use client";
import { useEffect, useState } from "react";
import { ventaService } from "@/services/ventas";
import { fiscalService } from "@/services/fiscal";

interface DetalleVenta {
  id: string;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  impuesto: number;
  total: number;
}

interface Venta {
  id: string;
  numero: string;
  tipo_comprobante: string;
  ncf: string;
  cliente_nombre: string;
  cajero_nombre: string;
  fecha: string;
  subtotal: number;
  descuento: number;
  total_impuestos: number;
  total: number;
  costo_total: number;
  ganancia: number;
  tipo_pago: string;
  monto_pagado: number;
  cambio: number;
  estado: string;
  estado_fiscal: string;
  notas: string;
  detalles: DetalleVenta[];
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function VentasPage() {
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const [emitiendo, setEmitiendo] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data } = await ventaService.getAll();
      setVentas(Array.isArray(data) ? data : data.results || []);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  const verDetalle = async (id: string) => {
    try {
      const { data } = await ventaService.getById(id);
      setDetalle(data);
    } catch { /* interceptor */ }
  };

  const emitirECF = async (ventaId: string) => {
    if (!confirm("Emitir factura electronica (e-CF) para esta venta?")) return;
    setEmitiendo(ventaId);
    try {
      await fiscalService.emitirECF(ventaId);
      alert("e-CF emitido exitosamente.");
      cargarDatos();
    } catch {
      alert("Error al emitir e-CF. Verifique la configuracion fiscal.");
    } finally {
      setEmitiendo(null);
    }
  };

  const filtradas = ventas.filter(v =>
    v.numero.toLowerCase().includes(busqueda.toLowerCase()) ||
    (v.cliente_nombre || "").toLowerCase().includes(busqueda.toLowerCase()) ||
    (v.ncf || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const formatCurrency = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
  const formatFecha = (f: string) => new Date(f).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' });

  const estadoBadge = (e: string) => {
    if (e === "COMPLETADA") return "badge-green";
    if (e === "ANULADA") return "badge-red";
    return "badge-yellow";
  };

  const fiscalBadge = (e: string) => {
    if (e === "ACEPTADO") return "badge-green";
    if (e === "ENVIADO") return "badge-blue";
    if (e === "RECHAZADO") return "badge-red";
    if (e === "PENDIENTE") return "badge-yellow";
    return "badge-gray";
  };

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
        .toolbar { display:flex; gap:12px; margin-bottom:24px; }
        .search-input { flex:1; min-width:200px; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 16px; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .search-input::placeholder { color:${tema.subtexto}; }
        .search-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:140px; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; }
        td { padding:14px 16px; font-size:14px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; cursor:pointer; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .badge-gray { background:rgba(148,163,184,0.12); color:#94a3b8; }
        .action-btn { background:none; border:1px solid ${tema.borde}; border-radius:8px; padding:5px 10px; font-size:12px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; margin-right:4px; }
        .action-btn:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .action-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:700px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:20px; }
        .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
        .detail-item { }
        .detail-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .detail-val { font-size:14px; font-weight:500; margin-top:2px; }
        .sub-table { width:100%; border-collapse:collapse; margin-top:12px; }
        .sub-table th { padding:8px 12px; font-size:10px; }
        .sub-table td { padding:8px 12px; font-size:13px; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Historial</span> de Ventas</h1>
          </div>
        </div>

        <div className="stats-row">
          {[
            { val: ventas.length, label: "Total ventas" },
            { val: formatCurrency(ventas.filter(v=>v.estado==="COMPLETADA").reduce((a,v) => a + Number(v.total), 0)), label: "Total facturado" },
            { val: ventas.filter(v=>v.estado_fiscal==="PENDIENTE"||v.estado_fiscal==="NO_FISCAL").length, label: "Pendientes fiscal" },
            { val: ventas.filter(v=>v.estado==="ANULADA").length, label: "Anuladas" },
          ].map((s, i) => (
            <div className="mini-stat" key={i}>
              <div className="mini-stat-val">{s.val}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <input className="search-input" placeholder="Buscar por numero, NCF o cliente..." value={busqueda} onChange={e => setBusqueda(e.target.value.substring(0, 100))} maxLength={100} />
        </div>

        {loading ? (
          <div className="loading">Cargando ventas...</div>
        ) : filtradas.length === 0 ? (
          <div className="empty-state"><p>No hay ventas registradas.</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Numero</th><th>NCF</th><th>Cliente</th><th>Cajero</th>
                  <th>Fecha</th><th>Total</th><th>Pago</th><th>Estado</th><th>Fiscal</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(v => (
                  <tr key={v.id} onClick={() => verDetalle(v.id)}>
                    <td style={{fontFamily:"monospace",fontSize:12}}>{v.numero}</td>
                    <td style={{fontFamily:"monospace",fontSize:12}}>{v.ncf || "—"}</td>
                    <td>{v.cliente_nombre || "Consumidor final"}</td>
                    <td>{v.cajero_nombre || "—"}</td>
                    <td style={{fontSize:12}}>{formatFecha(v.fecha)}</td>
                    <td style={{color:tema.accent,fontWeight:600}}>{formatCurrency(v.total)}</td>
                    <td><span className="badge badge-blue">{v.tipo_pago}</span></td>
                    <td><span className={`badge ${estadoBadge(v.estado)}`}>{v.estado}</span></td>
                    <td><span className={`badge ${fiscalBadge(v.estado_fiscal)}`}>{v.estado_fiscal}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      {v.estado === "COMPLETADA" && (v.estado_fiscal === "NO_FISCAL" || v.estado_fiscal === "PENDIENTE") && (
                        <button className="action-btn" onClick={() => emitirECF(v.id)} disabled={emitiendo === v.id}>
                          {emitiendo === v.id ? "Emitiendo..." : "Emitir e-CF"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {detalle && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setDetalle(null)}>
          <div className="modal">
            <h2 className="modal-title">Venta {detalle.numero}</h2>
            <div className="detail-grid">
              <div className="detail-item"><div className="detail-label">Cliente</div><div className="detail-val">{detalle.cliente_nombre || "Consumidor final"}</div></div>
              <div className="detail-item"><div className="detail-label">Cajero</div><div className="detail-val">{detalle.cajero_nombre || "—"}</div></div>
              <div className="detail-item"><div className="detail-label">Fecha</div><div className="detail-val">{formatFecha(detalle.fecha)}</div></div>
              <div className="detail-item"><div className="detail-label">Tipo Pago</div><div className="detail-val">{detalle.tipo_pago}</div></div>
              <div className="detail-item"><div className="detail-label">NCF</div><div className="detail-val">{detalle.ncf || "—"}</div></div>
              <div className="detail-item"><div className="detail-label">Estado</div><div className="detail-val"><span className={`badge ${estadoBadge(detalle.estado)}`}>{detalle.estado}</span></div></div>
              <div className="detail-item"><div className="detail-label">Subtotal</div><div className="detail-val">{formatCurrency(detalle.subtotal)}</div></div>
              <div className="detail-item"><div className="detail-label">Descuento</div><div className="detail-val">{formatCurrency(detalle.descuento)}</div></div>
              <div className="detail-item"><div className="detail-label">Impuestos</div><div className="detail-val">{formatCurrency(detalle.total_impuestos)}</div></div>
              <div className="detail-item"><div className="detail-label">Total</div><div className="detail-val" style={{color:tema.accent,fontWeight:700,fontSize:18}}>{formatCurrency(detalle.total)}</div></div>
            </div>
            {detalle.detalles && detalle.detalles.length > 0 && (
              <>
                <div style={{fontSize:11,color:tema.subtexto,textTransform:"uppercase",fontWeight:600,letterSpacing:"0.08em",marginBottom:8}}>Productos</div>
                <div className="table-wrap">
                  <table className="sub-table">
                    <thead><tr><th>Producto</th><th>Cant</th><th>Precio</th><th>Desc</th><th>Imp</th><th>Total</th></tr></thead>
                    <tbody>
                      {detalle.detalles.map(d => (
                        <tr key={d.id}>
                          <td>{d.producto_nombre}</td>
                          <td>{d.cantidad}</td>
                          <td>{formatCurrency(d.precio_unitario)}</td>
                          <td>{formatCurrency(d.descuento)}</td>
                          <td>{formatCurrency(d.impuesto)}</td>
                          <td style={{fontWeight:600}}>{formatCurrency(d.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {detalle.notas && <p style={{marginTop:16,fontSize:13,color:tema.subtexto}}>Notas: {detalle.notas}</p>}
            <div style={{marginTop:20,textAlign:"right"}}>
              <button className="btn-cancel" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
