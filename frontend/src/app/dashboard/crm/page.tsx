"use client";
import { useEffect, useState } from "react";
import { etapasCRMService, oportunidadesService, actividadesCRMService } from "@/services/crm";
import { clienteService } from "@/services/clientes";

interface Etapa {
  id: string;
  nombre: string;
  orden: number;
  color: string;
}

interface Oportunidad {
  id: string;
  titulo: string;
  descripcion: string;
  cliente: string;
  cliente_nombre: string;
  etapa: string;
  etapa_nombre: string;
  valor_estimado: number;
  prioridad: string;
  estado: string;
  asignado_nombre: string;
  fecha_creacion: string;
  fecha_cierre: string;
}

interface Actividad {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  fecha: string;
  completada: boolean;
  oportunidad: string;
}

interface Cliente {
  id: string;
  nombre: string;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function CRMPage() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [oportunidades, setOportunidades] = useState<Oportunidad[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [tab, setTab] = useState<"pipeline" | "lista">("pipeline");
  const [filtroEstado, setFiltroEstado] = useState("TODOS");
  const [showModal, setShowModal] = useState(false);
  const [showDetalle, setShowDetalle] = useState<Oportunidad | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [loadingActividades, setLoadingActividades] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [razonPerdida, setRazonPerdida] = useState("");
  const [showPerderModal, setShowPerderModal] = useState(false);
  const [form, setForm] = useState({
    titulo: "", cliente: "", etapa: "", valor_estimado: "",
    prioridad: "MEDIA", descripcion: ""
  });

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [etapasRes, opRes, clientesRes] = await Promise.all([
        etapasCRMService.getAll(),
        oportunidadesService.getAll(),
        clienteService.getAll(),
      ]);
      setEtapas(Array.isArray(etapasRes.data) ? etapasRes.data : etapasRes.data.results || []);
      setOportunidades(Array.isArray(opRes.data) ? opRes.data : opRes.data.results || []);
      setClientes(Array.isArray(clientesRes.data) ? clientesRes.data : clientesRes.data.results || []);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  const cargarActividades = async (oportunidadId: string) => {
    setLoadingActividades(true);
    try {
      const { data } = await actividadesCRMService.getAll(oportunidadId);
      setActividades(Array.isArray(data) ? data : data.results || []);
    } catch { /* interceptor */ }
    setLoadingActividades(false);
  };

  const abrirDetalle = async (op: Oportunidad) => {
    setShowDetalle(op);
    cargarActividades(op.id);
  };

  const guardarOportunidad = async () => {
    if (!form.titulo.trim()) { setFormError("El titulo es requerido."); return; }
    if (!form.cliente) { setFormError("Seleccione un cliente."); return; }
    if (!form.etapa) { setFormError("Seleccione una etapa."); return; }
    const val = parseFloat(form.valor_estimado);
    if (isNaN(val) || val < 0) { setFormError("Valor estimado invalido."); return; }
    setFormError("");
    setSaving(true);
    try {
      await oportunidadesService.create({
        titulo: form.titulo.trim(),
        cliente: form.cliente,
        etapa: form.etapa,
        valor_estimado: val,
        prioridad: form.prioridad,
        descripcion: form.descripcion.trim(),
      });
      setShowModal(false);
      resetForm();
      cargarDatos();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        const msg = Object.values(e.response.data).flat().join('. ');
        setFormError(String(msg).substring(0, 200));
      } else {
        setFormError("Error de conexion. Intente nuevamente.");
      }
    } finally {
      setSaving(false);
    }
  };

  const ganarOportunidad = async (id: string) => {
    if (!confirm("Marcar esta oportunidad como GANADA?")) return;
    try {
      await oportunidadesService.ganar(id);
      setShowDetalle(null);
      cargarDatos();
    } catch { /* interceptor */ }
  };

  const perderOportunidad = async (id: string) => {
    if (!razonPerdida.trim()) { setFormError("Indique la razon de perdida."); return; }
    try {
      await oportunidadesService.perder(id, razonPerdida.trim());
      setShowPerderModal(false);
      setShowDetalle(null);
      setRazonPerdida("");
      setFormError("");
      cargarDatos();
    } catch { /* interceptor */ }
  };

  const moverEtapa = async (opId: string, etapaId: string) => {
    try {
      await oportunidadesService.moverEtapa(opId, etapaId);
      cargarDatos();
    } catch { /* interceptor */ }
  };

  const resetForm = () => {
    setForm({ titulo: "", cliente: "", etapa: "", valor_estimado: "", prioridad: "MEDIA", descripcion: "" });
    setFormError("");
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
  const formatFecha = (f: string) => f ? new Date(f).toLocaleString('es-DO', { dateStyle: 'short', timeStyle: 'short' }) : "—";

  const abiertas = oportunidades.filter(o => o.estado === "ABIERTA");
  const valorPipeline = abiertas.reduce((a, o) => a + Number(o.valor_estimado || 0), 0);
  const ganadas = oportunidades.filter(o => o.estado === "GANADA").length;
  const cerradas = oportunidades.filter(o => o.estado === "GANADA" || o.estado === "PERDIDA").length;
  const tasaCierre = cerradas > 0 ? Math.round((ganadas / cerradas) * 100) : 0;

  const oportunidadesFiltradas = filtroEstado === "TODOS"
    ? oportunidades
    : oportunidades.filter(o => o.estado === filtroEstado);

  const prioridadBadge = (p: string) => {
    if (p === "ALTA" || p === "URGENTE") return "badge-red";
    if (p === "MEDIA") return "badge-yellow";
    return "badge-green";
  };

  const estadoBadge = (e: string) => {
    if (e === "GANADA") return "badge-green";
    if (e === "PERDIDA") return "badge-red";
    return "badge-blue";
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
        .page-subtitle { font-size:13px; color:${tema.subtexto}; margin-top:2px; font-family:'DM Sans',sans-serif; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px ${tema.accent}40; }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:140px; box-shadow:${esClaro ? "0 2px 8px rgba(0,0,0,0.06)" : "none"}; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .tabs { display:flex; gap:4px; margin-bottom:24px; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:4px; width:fit-content; }
        .tab-btn { background:none; border:none; border-radius:8px; padding:8px 20px; font-size:13px; font-weight:500; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; }
        .tab-btn.active { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); color:white; font-weight:600; }
        .tab-btn:hover:not(.active) { color:${tema.texto}; }
        .pipeline-container { display:flex; gap:16px; overflow-x:auto; padding-bottom:16px; align-items:flex-start; }
        .pipeline-container::-webkit-scrollbar { height:8px; }
        .pipeline-container::-webkit-scrollbar-track { background:${tema.card}; border-radius:4px; }
        .pipeline-container::-webkit-scrollbar-thumb { background:${tema.borde}; border-radius:4px; }
        .pipeline-column { min-width:280px; max-width:320px; flex-shrink:0; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; display:flex; flex-direction:column; max-height:calc(100vh - 280px); }
        .column-header { padding:16px; border-radius:12px 12px 0 0; display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .column-title { font-family:'Syne',sans-serif; font-size:14px; font-weight:700; color:white; }
        .column-count { background:rgba(255,255,255,0.2); border-radius:100px; padding:2px 8px; font-size:11px; font-weight:600; color:white; }
        .column-value { font-size:11px; color:rgba(255,255,255,0.7); margin-top:4px; }
        .column-cards { padding:12px; display:flex; flex-direction:column; gap:10px; overflow-y:auto; flex:1; }
        .column-cards::-webkit-scrollbar { width:4px; }
        .column-cards::-webkit-scrollbar-thumb { background:${tema.borde}; border-radius:2px; }
        .op-card { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:10px; padding:14px; cursor:pointer; transition:all 0.2s; }
        .op-card:hover { border-color:${tema.accent}40; transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,0.2); }
        .op-card-title { font-size:14px; font-weight:500; margin-bottom:6px; line-height:1.3; }
        .op-card-client { font-size:12px; color:${tema.subtexto}; margin-bottom:8px; }
        .op-card-footer { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .op-card-value { font-size:13px; font-weight:600; color:${tema.accent}; }
        .op-card-assigned { font-size:11px; color:${tema.subtexto}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .badge-gray { background:rgba(148,163,184,0.12); color:#94a3b8; }
        .toolbar { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; }
        .filter-select { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 16px; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; cursor:pointer; }
        .filter-select:focus { border-color:${tema.accent}50; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; box-shadow:${esClaro ? "0 4px 16px rgba(0,0,0,0.07)" : "none"}; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; }
        td { padding:14px 16px; font-size:14px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; cursor:pointer; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:24px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
        .btn-cancel:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        .btn-success { background:linear-gradient(135deg, #059669, #10b981); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; box-shadow:0 4px 16px rgba(16,185,129,0.3); }
        .btn-success:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(16,185,129,0.4); }
        .btn-danger { background:linear-gradient(135deg, #dc2626, #ef4444); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; box-shadow:0 4px 16px rgba(239,68,68,0.3); }
        .btn-danger:hover { transform:translateY(-1px); box-shadow:0 8px 24px rgba(239,68,68,0.4); }
        .detail-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }
        .detail-item {}
        .detail-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .detail-val { font-size:14px; font-weight:500; margin-top:2px; }
        .actividad-list { margin-top:16px; }
        .actividad-item { display:flex; align-items:flex-start; gap:10px; padding:10px 0; border-bottom:1px solid ${tema.borde}; }
        .actividad-item:last-child { border-bottom:none; }
        .actividad-dot { width:8px; height:8px; border-radius:50%; margin-top:5px; flex-shrink:0; }
        .actividad-content { flex:1; }
        .actividad-titulo { font-size:13px; font-weight:500; }
        .actividad-fecha { font-size:11px; color:${tema.subtexto}; margin-top:2px; }
        .actividad-tipo { font-size:10px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.05em; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .form-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; grid-column:1/-1; }
        .etapa-select { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; margin-bottom:16px; }
        .etapa-chip { border:1px solid ${tema.borde}; border-radius:8px; padding:4px 12px; font-size:12px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; background:none; }
        .etapa-chip:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .etapa-chip.active { border-color:${tema.accent}; color:${tema.accent}; background:${tema.accent}10; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <div>
              <h1 className="page-title"><span>CRM</span></h1>
              <div className="page-subtitle">Pipeline de Ventas</div>
            </div>
          </div>
          <button className="btn-primary" onClick={() => { resetForm(); setShowModal(true); }}>+ Nueva Oportunidad</button>
        </div>

        <div className="stats-row">
          {[
            { val: abiertas.length, label: "Oportunidades abiertas" },
            { val: formatCurrency(valorPipeline), label: "Valor total pipeline (DOP)" },
            { val: `${tasaCierre}%`, label: "Tasa de cierre" },
          ].map((s, i) => (
            <div className="mini-stat" key={i}>
              <div className="mini-stat-val">{s.val}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="tabs">
          <button className={`tab-btn ${tab === "pipeline" ? "active" : ""}`} onClick={() => setTab("pipeline")}>Pipeline</button>
          <button className={`tab-btn ${tab === "lista" ? "active" : ""}`} onClick={() => setTab("lista")}>Lista</button>
        </div>

        {loading ? (
          <div className="loading">Cargando pipeline...</div>
        ) : tab === "pipeline" ? (
          <div className="pipeline-container">
            {etapas.length === 0 ? (
              <div className="empty-state"><p>No hay etapas configuradas. Configure las etapas del pipeline primero.</p></div>
            ) : (
              etapas.sort((a, b) => a.orden - b.orden).map(etapa => {
                const opsEtapa = oportunidades.filter(o => o.etapa === etapa.id && o.estado === "ABIERTA");
                const valorEtapa = opsEtapa.reduce((a, o) => a + Number(o.valor_estimado || 0), 0);
                return (
                  <div className="pipeline-column" key={etapa.id}>
                    <div className="column-header" style={{ background: etapa.color || tema.accent }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="column-title">{etapa.nombre}</span>
                          <span className="column-count">{opsEtapa.length}</span>
                        </div>
                        <div className="column-value">{formatCurrency(valorEtapa)}</div>
                      </div>
                    </div>
                    <div className="column-cards">
                      {opsEtapa.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "20px 10px", color: tema.subtexto, fontSize: 12 }}>Sin oportunidades</div>
                      ) : (
                        opsEtapa.map(op => (
                          <div className="op-card" key={op.id} onClick={() => abrirDetalle(op)}>
                            <div className="op-card-title">{op.titulo}</div>
                            <div className="op-card-client">{op.cliente_nombre || "Sin cliente"}</div>
                            <div className="op-card-footer">
                              <div className="op-card-value">{formatCurrency(Number(op.valor_estimado))}</div>
                              <span className={`badge ${prioridadBadge(op.prioridad)}`}>{op.prioridad}</span>
                            </div>
                            {op.asignado_nombre && (
                              <div className="op-card-assigned" style={{ marginTop: 6 }}>{op.asignado_nombre}</div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <>
            <div className="toolbar">
              <select className="filter-select" value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}>
                <option value="TODOS">Todos los estados</option>
                <option value="ABIERTA">Abierta</option>
                <option value="GANADA">Ganada</option>
                <option value="PERDIDA">Perdida</option>
              </select>
            </div>
            {oportunidadesFiltradas.length === 0 ? (
              <div className="empty-state"><p>No hay oportunidades registradas.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Titulo</th><th>Cliente</th><th>Etapa</th><th>Valor Estimado</th>
                      <th>Prioridad</th><th>Estado</th><th>Fecha</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oportunidadesFiltradas.map(op => (
                      <tr key={op.id} onClick={() => abrirDetalle(op)}>
                        <td style={{ fontWeight: 500 }}>{op.titulo}</td>
                        <td>{op.cliente_nombre || "Sin cliente"}</td>
                        <td><span className="badge badge-blue">{op.etapa_nombre || "—"}</span></td>
                        <td style={{ color: tema.accent, fontWeight: 600 }}>{formatCurrency(Number(op.valor_estimado))}</td>
                        <td><span className={`badge ${prioridadBadge(op.prioridad)}`}>{op.prioridad}</span></td>
                        <td><span className={`badge ${estadoBadge(op.estado)}`}>{op.estado}</span></td>
                        <td style={{ fontSize: 12 }}>{formatFecha(op.fecha_creacion)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal: Nueva Oportunidad */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Nueva Oportunidad</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group full">
                <label className="form-label">Titulo *</label>
                <input className="form-input" placeholder="Nombre de la oportunidad" value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label">Cliente *</label>
                <select className="form-input" value={form.cliente} onChange={e => setForm({ ...form, cliente: e.target.value })}>
                  <option value="">Seleccionar cliente</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Etapa *</label>
                <select className="form-input" value={form.etapa} onChange={e => setForm({ ...form, etapa: e.target.value })}>
                  <option value="">Seleccionar etapa</option>
                  {etapas.sort((a, b) => a.orden - b.orden).map(et => (
                    <option key={et.id} value={et.id}>{et.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor Estimado (DOP)</label>
                <input className="form-input" type="number" step="0.01" min="0" placeholder="0.00" value={form.valor_estimado} onChange={e => setForm({ ...form, valor_estimado: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Prioridad</label>
                <select className="form-input" value={form.prioridad} onChange={e => setForm({ ...form, prioridad: e.target.value })}>
                  <option value="BAJA">Baja</option>
                  <option value="MEDIA">Media</option>
                  <option value="ALTA">Alta</option>
                  <option value="URGENTE">Urgente</option>
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">Descripcion</label>
                <textarea className="form-input" rows={3} placeholder="Detalles de la oportunidad..." value={form.descripcion} onChange={e => setForm({ ...form, descripcion: e.target.value })} style={{ resize: "vertical" }} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarOportunidad} disabled={saving}>
                {saving ? "Guardando..." : "Crear oportunidad"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Detalle Oportunidad */}
      {showDetalle && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowDetalle(null)}>
          <div className="modal" style={{ maxWidth: 650 }}>
            <h2 className="modal-title">{showDetalle.titulo}</h2>
            <div className="detail-grid">
              <div className="detail-item"><div className="detail-label">Cliente</div><div className="detail-val">{showDetalle.cliente_nombre || "Sin cliente"}</div></div>
              <div className="detail-item"><div className="detail-label">Etapa</div><div className="detail-val"><span className="badge badge-blue">{showDetalle.etapa_nombre || "—"}</span></div></div>
              <div className="detail-item"><div className="detail-label">Valor Estimado</div><div className="detail-val" style={{ color: tema.accent, fontWeight: 700, fontSize: 18 }}>{formatCurrency(Number(showDetalle.valor_estimado))}</div></div>
              <div className="detail-item"><div className="detail-label">Prioridad</div><div className="detail-val"><span className={`badge ${prioridadBadge(showDetalle.prioridad)}`}>{showDetalle.prioridad}</span></div></div>
              <div className="detail-item"><div className="detail-label">Estado</div><div className="detail-val"><span className={`badge ${estadoBadge(showDetalle.estado)}`}>{showDetalle.estado}</span></div></div>
              <div className="detail-item"><div className="detail-label">Asignado</div><div className="detail-val">{showDetalle.asignado_nombre || "Sin asignar"}</div></div>
              <div className="detail-item"><div className="detail-label">Fecha Creacion</div><div className="detail-val">{formatFecha(showDetalle.fecha_creacion)}</div></div>
              {showDetalle.fecha_cierre && <div className="detail-item"><div className="detail-label">Fecha Cierre</div><div className="detail-val">{formatFecha(showDetalle.fecha_cierre)}</div></div>}
            </div>
            {showDetalle.descripcion && (
              <p style={{ fontSize: 13, color: tema.subtexto, marginBottom: 16 }}>{showDetalle.descripcion}</p>
            )}

            {/* Mover a otra etapa */}
            {showDetalle.estado === "ABIERTA" && etapas.length > 1 && (
              <div>
                <div style={{ fontSize: 11, color: tema.subtexto, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8 }}>Mover a etapa</div>
                <div className="etapa-select">
                  {etapas.sort((a, b) => a.orden - b.orden).map(et => (
                    <button
                      key={et.id}
                      className={`etapa-chip ${showDetalle.etapa === et.id ? "active" : ""}`}
                      onClick={() => {
                        if (showDetalle.etapa !== et.id) {
                          moverEtapa(showDetalle.id, et.id);
                          setShowDetalle({ ...showDetalle, etapa: et.id, etapa_nombre: et.nombre });
                        }
                      }}
                    >
                      {et.nombre}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actividades */}
            <div style={{ fontSize: 11, color: tema.subtexto, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.08em", marginBottom: 8, marginTop: 8 }}>Actividades</div>
            {loadingActividades ? (
              <div style={{ textAlign: "center", padding: 16, color: tema.subtexto, fontSize: 13 }}>Cargando actividades...</div>
            ) : actividades.length === 0 ? (
              <div style={{ textAlign: "center", padding: 16, color: tema.subtexto, fontSize: 13 }}>Sin actividades registradas</div>
            ) : (
              <div className="actividad-list">
                {actividades.map(act => (
                  <div className="actividad-item" key={act.id}>
                    <div className="actividad-dot" style={{ background: act.completada ? "#10b981" : tema.accent }} />
                    <div className="actividad-content">
                      <div className="actividad-tipo">{act.tipo}</div>
                      <div className="actividad-titulo">{act.titulo}</div>
                      {act.descripcion && <div style={{ fontSize: 12, color: tema.subtexto, marginTop: 2 }}>{act.descripcion}</div>}
                      <div className="actividad-fecha">{formatFecha(act.fecha)}</div>
                    </div>
                    <span className={`badge ${act.completada ? "badge-green" : "badge-yellow"}`}>
                      {act.completada ? "Hecha" : "Pendiente"}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Acciones */}
            <div className="modal-actions" style={{ marginTop: 24 }}>
              <button className="btn-cancel" onClick={() => setShowDetalle(null)}>Cerrar</button>
              {showDetalle.estado === "ABIERTA" && (
                <>
                  <button className="btn-danger" onClick={() => { setShowPerderModal(true); setRazonPerdida(""); setFormError(""); }}>Perder</button>
                  <button className="btn-success" onClick={() => ganarOportunidad(showDetalle.id)}>Ganar</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Razon de perdida */}
      {showPerderModal && showDetalle && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={e => e.target === e.currentTarget && setShowPerderModal(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h2 className="modal-title">Marcar como Perdida</h2>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group full">
              <label className="form-label">Razon de perdida *</label>
              <textarea className="form-input" rows={3} placeholder="Indique por que se perdio esta oportunidad..." value={razonPerdida} onChange={e => setRazonPerdida(e.target.value)} style={{ resize: "vertical" }} />
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowPerderModal(false)}>Cancelar</button>
              <button className="btn-danger" onClick={() => perderOportunidad(showDetalle.id)}>Confirmar perdida</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}