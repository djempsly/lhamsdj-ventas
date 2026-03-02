"use client";
import { useEffect, useState } from "react";
import { cotizacionesService } from "@/services/cotizaciones";

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

interface Cotizacion {
  id: string; numero: string; cliente: string; cliente_nombre: string;
  fecha: string; fecha_validez: string; condiciones: string;
  subtotal: number; total_impuestos: number; total: number;
  estado: string; vendedor_nombre: string; notas: string;
}

const ESTADOS = ["Todos", "BORRADOR", "ENVIADA", "ACEPTADA", "FACTURADA", "RECHAZADA"];

const ESTADO_COLORS: Record<string, { bg: string; color: string }> = {
  BORRADOR: { bg: "rgba(234,179,8,.15)", color: "#eab308" },
  ENVIADA: { bg: "rgba(14,165,233,.15)", color: "#0ea5e9" },
  ACEPTADA: { bg: "rgba(34,197,94,.15)", color: "#22c55e" },
  FACTURADA: { bg: "rgba(139,92,246,.15)", color: "#8b5cf6" },
  RECHAZADA: { bg: "rgba(239,68,68,.15)", color: "#ef4444" },
};

export default function CotizacionesPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [cotizaciones, setCotizaciones] = useState<Cotizacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [selectedCot, setSelectedCot] = useState<Cotizacion | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({
    cliente: "", fecha_validez: "", condiciones: "",
  });

  useEffect(() => {
    setMounted(true);
    try { const t = localStorage.getItem("tema"); if (t) setTema(JSON.parse(t)); } catch {}
  }, []);

  useEffect(() => { if (mounted) cargarDatos(); }, [mounted]);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data } = await cotizacionesService.getAll();
      setCotizaciones(Array.isArray(data) ? data : data.results || []);
    } catch {}
    setLoading(false);
  };

  const handleEnviar = async (id: string) => {
    try {
      await cotizacionesService.enviar(id);
      setShowModal(false);
      setSelectedCot(null);
      cargarDatos();
    } catch {}
  };

  const handleAceptar = async (id: string) => {
    try {
      await cotizacionesService.aceptar(id);
      setShowModal(false);
      setSelectedCot(null);
      cargarDatos();
    } catch {}
  };

  const handleFacturar = async (id: string) => {
    try {
      await cotizacionesService.facturar(id);
      setShowModal(false);
      setSelectedCot(null);
      cargarDatos();
    } catch {}
  };

  const handleCreate = async () => {
    try {
      await cotizacionesService.create(form);
      setShowCreateModal(false);
      setForm({ cliente: "", fecha_validez: "", condiciones: "" });
      cargarDatos();
    } catch {}
  };

  const esClaro = tema.texto === "#0f172a";
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  const filtradas = filtroEstado === "Todos"
    ? cotizaciones
    : cotizaciones.filter((c) => c.estado === filtroEstado);

  const stats = {
    total: cotizaciones.length,
    borradores: cotizaciones.filter((c) => c.estado === "BORRADOR").length,
    enviadas: cotizaciones.filter((c) => c.estado === "ENVIADA").length,
    aceptadas: cotizaciones.filter((c) => c.estado === "ACEPTADA").length,
  };

  if (!mounted) return null;

  return (
    <div style={{ minHeight: "100vh", background: tema.bg, color: tema.texto, padding: "24px" }}>
      <style>{`
        .cot-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
        .cot-title{font-size:1.5rem;font-weight:700}
        .cot-btn{padding:10px 20px;border-radius:10px;border:none;font-weight:600;cursor:pointer;
          background:linear-gradient(135deg,${tema.accent},${tema.secondary});color:#fff}
        .cot-btn:hover{opacity:.9;transform:translateY(-1px)}
        .cot-btn-sm{padding:6px 14px;border-radius:8px;border:none;font-weight:500;cursor:pointer;font-size:.8rem}
        .cot-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px}
        .cot-stat{background:${tema.card};border:1px solid ${tema.borde};border-radius:12px;padding:20px}
        .cot-stat-label{font-size:.8rem;color:${tema.subtexto};margin-bottom:4px}
        .cot-stat-value{font-size:1.5rem;font-weight:700}
        .cot-filters{display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap}
        .cot-filter{padding:8px 20px;border-radius:8px;border:1px solid ${tema.borde};cursor:pointer;
          font-size:.85rem;background:transparent;color:${tema.subtexto};transition:all .2s}
        .cot-filter.active{background:linear-gradient(135deg,${tema.accent},${tema.secondary});
          color:#fff;border-color:transparent}
        .cot-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
        .cot-card{background:${tema.card};border:1px solid ${tema.borde};border-radius:12px;
          padding:20px;cursor:pointer;transition:all .2s}
        .cot-card:hover{border-color:${tema.accent};transform:translateY(-2px)}
        .badge{padding:4px 10px;border-radius:6px;font-size:.75rem;font-weight:600;display:inline-block}
        .modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;
          justify-content:center;z-index:50;backdrop-filter:blur(4px)}
        .modal-content{background:${esClaro ? "#fff" : "#0f1724"};border-radius:16px;padding:28px;
          width:90%;max-width:600px;max-height:85vh;overflow-y:auto;border:1px solid ${tema.borde}}
        .form-group{margin-bottom:14px}
        .form-label{display:block;font-size:.8rem;margin-bottom:4px;color:${tema.subtexto}}
        .form-input{width:100%;padding:10px;border-radius:8px;border:1px solid ${tema.borde};
          background:${esClaro ? "#f8fafc" : "rgba(255,255,255,.05)"};color:${tema.texto};font-size:.9rem}
        .form-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .detail-row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${tema.borde};font-size:.9rem}
        .detail-label{color:${tema.subtexto}}
      `}</style>

      {/* Header */}
      <div className="cot-header">
        <div>
          <div style={{ fontSize: ".85rem", color: tema.subtexto, cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard")}>
            ← Volver al Dashboard
          </div>
          <div className="cot-title">Cotizaciones</div>
        </div>
        <button className="cot-btn" onClick={() => setShowCreateModal(true)}>+ Nueva Cotizacion</button>
      </div>

      {/* Stats */}
      <div className="cot-stats">
        <div className="cot-stat">
          <div className="cot-stat-label">Total</div>
          <div className="cot-stat-value">{stats.total}</div>
        </div>
        <div className="cot-stat">
          <div className="cot-stat-label">Borradores</div>
          <div className="cot-stat-value" style={{ color: "#eab308" }}>{stats.borradores}</div>
        </div>
        <div className="cot-stat">
          <div className="cot-stat-label">Enviadas</div>
          <div className="cot-stat-value" style={{ color: "#0ea5e9" }}>{stats.enviadas}</div>
        </div>
        <div className="cot-stat">
          <div className="cot-stat-label">Aceptadas</div>
          <div className="cot-stat-value" style={{ color: "#22c55e" }}>{stats.aceptadas}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="cot-filters">
        {ESTADOS.map((e) => (
          <button key={e} className={`cot-filter ${filtroEstado === e ? "active" : ""}`}
            onClick={() => setFiltroEstado(e)}>
            {e === "Todos" ? "Todos" : e.charAt(0) + e.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Cargando...</div>
      ) : (
        <div className="cot-grid">
          {filtradas.map((c) => (
            <div className="cot-card" key={c.id} onClick={() => { setSelectedCot(c); setShowModal(true); }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1.1rem" }}>{c.numero}</div>
                  <div style={{ color: tema.subtexto, fontSize: ".85rem", marginTop: 2 }}>{c.cliente_nombre}</div>
                </div>
                <span className="badge" style={{
                  background: ESTADO_COLORS[c.estado]?.bg || "rgba(255,255,255,.1)",
                  color: ESTADO_COLORS[c.estado]?.color || tema.subtexto,
                }}>
                  {c.estado}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ color: tema.subtexto, fontSize: ".8rem" }}>Fecha</div>
                  <div style={{ fontSize: ".9rem" }}>{c.fecha}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ color: tema.subtexto, fontSize: ".8rem" }}>Total</div>
                  <div style={{ fontSize: "1.2rem", fontWeight: 700, color: tema.accent }}>{fmt(c.total)}</div>
                </div>
              </div>
              {c.vendedor_nombre && (
                <div style={{ marginTop: 10, fontSize: ".8rem", color: tema.subtexto }}>
                  Vendedor: {c.vendedor_nombre}
                </div>
              )}
            </div>
          ))}
          {filtradas.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: tema.subtexto, gridColumn: "1 / -1" }}>
              No hay cotizaciones {filtroEstado !== "Todos" ? `con estado ${filtroEstado.toLowerCase()}` : "registradas"}
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {showModal && selectedCot && (
        <div className="modal-overlay" onClick={() => { setShowModal(false); setSelectedCot(null); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2rem" }}>{selectedCot.numero}</h3>
                <div style={{ color: tema.subtexto, fontSize: ".85rem", marginTop: 4 }}>Detalle de Cotizacion</div>
              </div>
              <span className="badge" style={{
                background: ESTADO_COLORS[selectedCot.estado]?.bg || "rgba(255,255,255,.1)",
                color: ESTADO_COLORS[selectedCot.estado]?.color || tema.subtexto,
              }}>
                {selectedCot.estado}
              </span>
            </div>

            <div className="detail-row">
              <span className="detail-label">Cliente</span>
              <span>{selectedCot.cliente_nombre}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Fecha</span>
              <span>{selectedCot.fecha}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Fecha Validez</span>
              <span>{selectedCot.fecha_validez || "---"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Vendedor</span>
              <span>{selectedCot.vendedor_nombre || "---"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Condiciones</span>
              <span>{selectedCot.condiciones || "---"}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Subtotal</span>
              <span>{fmt(selectedCot.subtotal)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Impuestos</span>
              <span>{fmt(selectedCot.total_impuestos)}</span>
            </div>
            <div className="detail-row" style={{ borderBottom: "none" }}>
              <span style={{ fontWeight: 700 }}>Total</span>
              <span style={{ fontWeight: 700, fontSize: "1.1rem", color: tema.accent }}>{fmt(selectedCot.total)}</span>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <button className="cot-btn-sm" onClick={() => { setShowModal(false); setSelectedCot(null); }}
                style={{ background: tema.borde, color: tema.texto }}>Cerrar</button>

              {selectedCot.estado === "BORRADOR" && (
                <button className="cot-btn-sm" onClick={() => handleEnviar(selectedCot.id)}
                  style={{ background: "rgba(14,165,233,.2)", color: "#0ea5e9" }}>
                  Enviar
                </button>
              )}
              {selectedCot.estado === "ENVIADA" && (
                <button className="cot-btn-sm" onClick={() => handleAceptar(selectedCot.id)}
                  style={{ background: "rgba(34,197,94,.2)", color: "#22c55e" }}>
                  Aceptar
                </button>
              )}
              {selectedCot.estado === "ACEPTADA" && (
                <button className="cot-btn-sm" onClick={() => handleFacturar(selectedCot.id)}
                  style={{ background: "rgba(139,92,246,.2)", color: "#8b5cf6" }}>
                  Facturar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginBottom: 16 }}>Nueva Cotizacion</h3>

            <div className="form-group">
              <label className="form-label">Cliente</label>
              <input className="form-input" placeholder="ID del cliente" value={form.cliente}
                onChange={(e) => setForm({ ...form, cliente: e.target.value })} />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Fecha Validez</label>
                <input type="date" className="form-input" value={form.fecha_validez}
                  onChange={(e) => setForm({ ...form, fecha_validez: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Condiciones</label>
                <input className="form-input" placeholder="Condiciones de pago" value={form.condiciones}
                  onChange={(e) => setForm({ ...form, condiciones: e.target.value })} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
              <button className="cot-btn-sm" onClick={() => setShowCreateModal(false)}
                style={{ background: tema.borde, color: tema.texto }}>Cancelar</button>
              <button className="cot-btn" onClick={handleCreate}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
