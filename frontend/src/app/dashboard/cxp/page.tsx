"use client";
import { useEffect, useState } from "react";
import { cxpService, pagosService } from "@/services/cxc-cxp";

interface CuentaPagar {
  id: string;
  numero: string;
  proveedor_nombre: string;
  monto_original: number;
  monto_pagado: number;
  saldo_pendiente: number;
  fecha_vencimiento: string;
  dias_vencida: number;
  estado: string;
}

interface AgingBucket {
  label: string;
  total: number;
  cuentas: CuentaPagar[];
  color: string;
}

interface AgingData {
  corriente: { total: number; cuentas: CuentaPagar[] };
  "1_30": { total: number; cuentas: CuentaPagar[] };
  "31_60": { total: number; cuentas: CuentaPagar[] };
  "61_90": { total: number; cuentas: CuentaPagar[] };
  "90_plus": { total: number; cuentas: CuentaPagar[] };
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

export default function CuentasPorPagarPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaPagar[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"cuentas" | "aging">("cuentas");
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState<CuentaPagar | null>(null);
  const [agingData, setAgingData] = useState<AgingBucket[]>([]);
  const [agingLoading, setAgingLoading] = useState(false);
  const [pagoForm, setPagoForm] = useState({ monto: 0, metodo_pago: "EFECTIVO", referencia: "" });
  const [enviandoPago, setEnviandoPago] = useState(false);

  useEffect(() => {
    setMounted(true);
    try { const t = localStorage.getItem("tema"); if (t) setTema(JSON.parse(t)); } catch {}
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data } = await cxpService.getAll();
      setCuentas(Array.isArray(data) ? data : data.results || []);
    } catch {}
    setLoading(false);
  };

  const cargarAging = async () => {
    setAgingLoading(true);
    try {
      const { data } = await cxpService.aging();
      const bucketColors = ["#22c55e", "#3b82f6", "#f59e0b", "#f97316", "#ef4444"];
      const bucketLabels = ["Corriente", "1-30 dias", "31-60 dias", "61-90 dias", "90+ dias"];
      const bucketKeys: (keyof AgingData)[] = ["corriente", "1_30", "31_60", "61_90", "90_plus"];
      const buckets: AgingBucket[] = bucketKeys.map((key, i) => ({
        label: bucketLabels[i],
        total: data[key]?.total || 0,
        cuentas: data[key]?.cuentas || [],
        color: bucketColors[i],
      }));
      setAgingData(buckets);
    } catch {}
    setAgingLoading(false);
  };

  const handleTabChange = (newTab: "cuentas" | "aging") => {
    setTab(newTab);
    if (newTab === "aging" && agingData.length === 0) cargarAging();
  };

  const verDetalle = async (cuenta: CuentaPagar) => {
    try {
      const { data } = await cxpService.getById(cuenta.id);
      setDetalle(data);
      setPagoForm({ monto: data.saldo_pendiente || 0, metodo_pago: "EFECTIVO", referencia: "" });
    } catch {}
  };

  const registrarPago = async () => {
    if (!detalle || pagoForm.monto <= 0) return;
    setEnviandoPago(true);
    try {
      await pagosService.create({
        tipo: "PAGO",
        cuenta_por_pagar: detalle.id,
        monto: pagoForm.monto,
        metodo_pago: pagoForm.metodo_pago,
        referencia: pagoForm.referencia,
      });
      alert("Pago registrado exitosamente.");
      setDetalle(null);
      cargarDatos();
      if (tab === "aging") cargarAging();
    } catch {
      alert("Error al registrar el pago.");
    } finally {
      setEnviandoPago(false);
    }
  };

  const filtradas = cuentas.filter(c =>
    (c.numero || "").toLowerCase().includes(busqueda.toLowerCase()) ||
    (c.proveedor_nombre || "").toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPendiente = cuentas.reduce((a, c) => a + Number(c.saldo_pendiente || 0), 0);
  const totalVencidas = cuentas.filter(c => c.dias_vencida > 0).length;
  const promedioDias = cuentas.length > 0
    ? Math.round(cuentas.reduce((a, c) => a + Number(c.dias_vencida || 0), 0) / cuentas.length)
    : 0;

  const formatCurrency = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
  const formatFecha = (f: string) => f ? new Date(f).toLocaleDateString("es-DO", { dateStyle: "short" }) : "—";

  const estadoBadge = (e: string) => {
    if (e === "PAGADA") return "badge-green";
    if (e === "VENCIDA") return "badge-red";
    if (e === "PARCIAL") return "badge-yellow";
    if (e === "PENDIENTE") return "badge-blue";
    return "badge-gray";
  };

  const esClaro = tema.texto === "#0f172a";
  const agingGrandTotal = agingData.reduce((a, b) => a + b.total, 0);

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
        .tabs { display:flex; gap:8px; margin-bottom:24px; }
        .tab-btn { padding:8px 20px; border-radius:8px; border:1px solid ${tema.borde}; cursor:pointer; font-size:14px; background:transparent; color:${tema.subtexto}; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .tab-btn.active { background:linear-gradient(135deg,${tema.accent},${tema.secondary}); color:#fff; border-color:transparent; }
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
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:20px; }
        .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
        .detail-item { }
        .detail-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .detail-val { font-size:14px; font-weight:500; margin-top:2px; }
        .form-group { margin-bottom:14px; }
        .form-label { display:block; font-size:12px; margin-bottom:4px; color:${tema.subtexto}; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; }
        .form-input { width:100%; padding:10px 14px; border-radius:10px; border:1px solid ${tema.borde}; background:${esClaro ? "#f8fafc" : "rgba(255,255,255,0.05)"}; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .form-select { width:100%; padding:10px 14px; border-radius:10px; border:1px solid ${tema.borde}; background:${esClaro ? "#f8fafc" : "rgba(255,255,255,0.05)"}; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; }
        .btn-primary { background:linear-gradient(135deg,${tema.accent},${tema.secondary}); border:none; border-radius:10px; padding:10px 24px; color:#fff; font-size:14px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
        .btn-primary:hover { opacity:0.9; transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .aging-section { margin-bottom:24px; }
        .aging-bar-container { display:flex; height:40px; border-radius:10px; overflow:hidden; margin-bottom:24px; border:1px solid ${tema.borde}; }
        .aging-bar-segment { display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; transition:all 0.3s; min-width:2px; }
        .aging-bucket { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:20px; margin-bottom:16px; }
        .aging-bucket-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
        .aging-bucket-title { font-weight:700; font-size:15px; display:flex; align-items:center; gap:8px; }
        .aging-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
        .aging-bucket-total { font-family:'Syne',sans-serif; font-weight:800; font-size:18px; }
        .aging-count { font-size:12px; color:${tema.subtexto}; margin-bottom:8px; }
        .separator { height:1px; background:${tema.borde}; margin:20px 0; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Cuentas</span> por Pagar</h1>
          </div>
        </div>

        <div className="stats-row">
          {[
            { val: formatCurrency(totalPendiente), label: "Total pendiente" },
            { val: totalVencidas, label: "Vencidas" },
            { val: `${promedioDias} dias`, label: "Promedio dias pago" },
          ].map((s, i) => (
            <div className="mini-stat" key={i}>
              <div className="mini-stat-val" style={i === 0 ? { color: tema.accent } : {}}>{s.val}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="tabs">
          <button className={`tab-btn ${tab === "cuentas" ? "active" : ""}`} onClick={() => handleTabChange("cuentas")}>Cuentas</button>
          <button className={`tab-btn ${tab === "aging" ? "active" : ""}`} onClick={() => handleTabChange("aging")}>Aging Report</button>
        </div>

        {tab === "cuentas" && (
          <>
            <div className="toolbar">
              <input className="search-input" placeholder="Buscar por numero o proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value.substring(0, 100))} maxLength={100} />
            </div>

            {loading ? (
              <div className="loading">Cargando cuentas por pagar...</div>
            ) : filtradas.length === 0 ? (
              <div className="empty-state"><p>No hay cuentas por pagar registradas.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Numero</th><th>Proveedor</th><th>Monto Original</th><th>Pagado</th>
                      <th>Saldo Pendiente</th><th>Vencimiento</th><th>Dias Vencida</th><th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtradas.map(c => (
                      <tr key={c.id} onClick={() => verDetalle(c)}>
                        <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.numero}</td>
                        <td>{c.proveedor_nombre || "—"}</td>
                        <td>{formatCurrency(c.monto_original)}</td>
                        <td>{formatCurrency(c.monto_pagado)}</td>
                        <td style={{ color: tema.accent, fontWeight: 600 }}>{formatCurrency(c.saldo_pendiente)}</td>
                        <td style={{ fontSize: 12 }}>{formatFecha(c.fecha_vencimiento)}</td>
                        <td style={{ color: c.dias_vencida > 0 ? "#ef4444" : tema.subtexto, fontWeight: c.dias_vencida > 0 ? 600 : 400 }}>
                          {c.dias_vencida > 0 ? c.dias_vencida : "—"}
                        </td>
                        <td><span className={`badge ${estadoBadge(c.estado)}`}>{c.estado}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === "aging" && (
          <div className="aging-section">
            {agingLoading ? (
              <div className="loading">Cargando aging report...</div>
            ) : agingData.length === 0 ? (
              <div className="empty-state"><p>No hay datos de aging disponibles.</p></div>
            ) : (
              <>
                <div className="aging-bar-container">
                  {agingData.map((bucket, i) => {
                    const pct = agingGrandTotal > 0 ? (bucket.total / agingGrandTotal) * 100 : 0;
                    return pct > 0 ? (
                      <div
                        key={i}
                        className="aging-bar-segment"
                        style={{ width: `${pct}%`, background: bucket.color }}
                        title={`${bucket.label}: ${formatCurrency(bucket.total)} (${pct.toFixed(1)}%)`}
                      >
                        {pct > 8 ? `${pct.toFixed(0)}%` : ""}
                      </div>
                    ) : null;
                  })}
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
                  {agingData.map((bucket, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                      <span className="aging-dot" style={{ background: bucket.color }}></span>
                      <span style={{ color: tema.subtexto }}>{bucket.label}</span>
                    </div>
                  ))}
                </div>

                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 12, color: tema.subtexto, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em" }}>Total General</div>
                    <div style={{ fontFamily: "Syne, sans-serif", fontSize: 24, fontWeight: 800, color: tema.accent }}>{formatCurrency(agingGrandTotal)}</div>
                  </div>
                </div>

                {agingData.map((bucket, i) => (
                  <div className="aging-bucket" key={i}>
                    <div className="aging-bucket-header">
                      <div className="aging-bucket-title">
                        <span className="aging-dot" style={{ background: bucket.color }}></span>
                        {bucket.label}
                      </div>
                      <div className="aging-bucket-total" style={{ color: bucket.color }}>{formatCurrency(bucket.total)}</div>
                    </div>
                    <div className="aging-count">{bucket.cuentas.length} cuenta{bucket.cuentas.length !== 1 ? "s" : ""}</div>
                    {bucket.cuentas.length > 0 && (
                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>Numero</th><th>Proveedor</th><th>Saldo Pendiente</th><th>Vencimiento</th><th>Dias</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bucket.cuentas.map(c => (
                              <tr key={c.id} onClick={() => verDetalle(c)}>
                                <td style={{ fontFamily: "monospace", fontSize: 12 }}>{c.numero}</td>
                                <td>{c.proveedor_nombre || "—"}</td>
                                <td style={{ fontWeight: 600 }}>{formatCurrency(c.saldo_pendiente)}</td>
                                <td style={{ fontSize: 12 }}>{formatFecha(c.fecha_vencimiento)}</td>
                                <td style={{ color: c.dias_vencida > 0 ? "#ef4444" : tema.subtexto }}>{c.dias_vencida || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {detalle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setDetalle(null)}>
          <div className="modal">
            <h2 className="modal-title">Cuenta {detalle.numero}</h2>
            <div className="detail-grid">
              <div className="detail-item"><div className="detail-label">Proveedor</div><div className="detail-val">{detalle.proveedor_nombre || "—"}</div></div>
              <div className="detail-item"><div className="detail-label">Estado</div><div className="detail-val"><span className={`badge ${estadoBadge(detalle.estado)}`}>{detalle.estado}</span></div></div>
              <div className="detail-item"><div className="detail-label">Monto Original</div><div className="detail-val">{formatCurrency(detalle.monto_original)}</div></div>
              <div className="detail-item"><div className="detail-label">Monto Pagado</div><div className="detail-val">{formatCurrency(detalle.monto_pagado)}</div></div>
              <div className="detail-item"><div className="detail-label">Saldo Pendiente</div><div className="detail-val" style={{ color: tema.accent, fontWeight: 700, fontSize: 18 }}>{formatCurrency(detalle.saldo_pendiente)}</div></div>
              <div className="detail-item"><div className="detail-label">Fecha Vencimiento</div><div className="detail-val">{formatFecha(detalle.fecha_vencimiento)}</div></div>
              <div className="detail-item"><div className="detail-label">Dias Vencida</div><div className="detail-val" style={{ color: detalle.dias_vencida > 0 ? "#ef4444" : tema.subtexto }}>{detalle.dias_vencida > 0 ? detalle.dias_vencida : "Al dia"}</div></div>
            </div>

            {detalle.estado !== "PAGADA" && (
              <>
                <div className="separator"></div>
                <div style={{ fontSize: 11, color: tema.subtexto, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 16 }}>Registrar Pago</div>
                <div className="form-group">
                  <label className="form-label">Monto</label>
                  <input type="number" className="form-input" value={pagoForm.monto} min={0} max={detalle.saldo_pendiente} step="0.01"
                    onChange={e => setPagoForm({ ...pagoForm, monto: Number(e.target.value) })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Metodo de Pago</label>
                  <select className="form-select" value={pagoForm.metodo_pago} onChange={e => setPagoForm({ ...pagoForm, metodo_pago: e.target.value })}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="CHEQUE">Cheque</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia</label>
                  <input type="text" className="form-input" placeholder="Numero de referencia o cheque..." value={pagoForm.referencia}
                    onChange={e => setPagoForm({ ...pagoForm, referencia: e.target.value.substring(0, 100) })} maxLength={100} />
                </div>
              </>
            )}

            <div style={{ marginTop: 20, display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <button className="btn-cancel" onClick={() => setDetalle(null)}>Cerrar</button>
              {detalle.estado !== "PAGADA" && (
                <button className="btn-primary" onClick={registrarPago} disabled={enviandoPago || pagoForm.monto <= 0}>
                  {enviandoPago ? "Registrando..." : "Registrar Pago"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
