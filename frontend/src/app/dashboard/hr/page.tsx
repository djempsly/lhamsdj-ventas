"use client";
import { useEffect, useState } from "react";
import { departamentosService, empleadosService, nominasService, vacacionesService } from "@/services/hr";

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

interface Departamento {
  id: string; nombre: string; descripcion?: string;
}
interface Empleado {
  id: string; codigo: string; nombre: string; cedula: string; cargo: string;
  departamento: string; departamento_nombre: string; salario_bruto: number;
  fecha_ingreso: string; estado: string;
}
interface NominaDetalle {
  id: string; empleado_nombre: string; salario_bruto: number;
  tss_empleado: number; isr: number; total_deducciones: number; neto: number;
}
interface Nomina {
  id: string; nombre: string; tipo: string; periodo_desde: string;
  periodo_hasta: string; total_bruto: number; total_neto: number;
  estado: string; detalles?: NominaDetalle[];
}
interface Vacacion {
  id: string; empleado: string; empleado_nombre: string;
  fecha_desde: string; fecha_hasta: string; dias: number; estado: string;
}

export default function HRPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"empleados" | "nominas" | "departamentos" | "vacaciones">("empleados");

  // Data
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [nominas, setNominas] = useState<Nomina[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);

  // Modals
  const [showEmpleadoModal, setShowEmpleadoModal] = useState(false);
  const [showNominaModal, setShowNominaModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [selectedNomina, setSelectedNomina] = useState<Nomina | null>(null);

  // Forms
  const [empleadoForm, setEmpleadoForm] = useState({
    nombre: "", cedula: "", cargo: "", salario_bruto: "", fecha_ingreso: "", departamento: "",
  });
  const [nominaForm, setNominaForm] = useState({
    nombre: "", tipo: "QUINCENAL", periodo_desde: "", periodo_hasta: "",
  });
  const [deptForm, setDeptForm] = useState({ nombre: "", descripcion: "" });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    try { const t = localStorage.getItem("tema"); if (t) setTema(JSON.parse(t)); } catch {}
  }, []);

  useEffect(() => { if (mounted) cargarTodo(); }, [mounted]);

  const cargarTodo = async () => {
    setLoading(true);
    try {
      const [empRes, nomRes, deptRes, vacRes] = await Promise.all([
        empleadosService.getAll(),
        nominasService.getAll(),
        departamentosService.getAll(),
        vacacionesService.getAll(),
      ]);
      setEmpleados(Array.isArray(empRes.data) ? empRes.data : empRes.data.results || []);
      setNominas(Array.isArray(nomRes.data) ? nomRes.data : nomRes.data.results || []);
      setDepartamentos(Array.isArray(deptRes.data) ? deptRes.data : deptRes.data.results || []);
      setVacaciones(Array.isArray(vacRes.data) ? vacRes.data : vacRes.data.results || []);
    } catch {}
    setLoading(false);
  };

  const crearEmpleado = async () => {
    if (!empleadoForm.nombre.trim() || !empleadoForm.cedula.trim()) {
      setFormError("Nombre y cedula son requeridos."); return;
    }
    setFormError(""); setSaving(true);
    try {
      await empleadosService.create({
        nombre: empleadoForm.nombre.trim(),
        cedula: empleadoForm.cedula.trim(),
        cargo: empleadoForm.cargo.trim(),
        salario_bruto: parseFloat(empleadoForm.salario_bruto) || 0,
        fecha_ingreso: empleadoForm.fecha_ingreso || null,
        departamento: empleadoForm.departamento || null,
      });
      setShowEmpleadoModal(false);
      setEmpleadoForm({ nombre: "", cedula: "", cargo: "", salario_bruto: "", fecha_ingreso: "", departamento: "" });
      cargarTodo();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        setFormError(String(Object.values(e.response.data).flat().join(". ")).substring(0, 200));
      } else { setFormError("Error de conexion."); }
    } finally { setSaving(false); }
  };

  const crearNomina = async () => {
    if (!nominaForm.nombre.trim() || !nominaForm.periodo_desde || !nominaForm.periodo_hasta) {
      setFormError("Nombre y periodo son requeridos."); return;
    }
    setFormError(""); setSaving(true);
    try {
      await nominasService.create({
        nombre: nominaForm.nombre.trim(),
        tipo: nominaForm.tipo,
        periodo_desde: nominaForm.periodo_desde,
        periodo_hasta: nominaForm.periodo_hasta,
      });
      setShowNominaModal(false);
      setNominaForm({ nombre: "", tipo: "QUINCENAL", periodo_desde: "", periodo_hasta: "" });
      cargarTodo();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        setFormError(String(Object.values(e.response.data).flat().join(". ")).substring(0, 200));
      } else { setFormError("Error de conexion."); }
    } finally { setSaving(false); }
  };

  const crearDepartamento = async () => {
    if (!deptForm.nombre.trim()) { setFormError("Nombre es requerido."); return; }
    setFormError(""); setSaving(true);
    try {
      await departamentosService.create({
        nombre: deptForm.nombre.trim(),
        descripcion: deptForm.descripcion.trim(),
      });
      setShowDeptModal(false);
      setDeptForm({ nombre: "", descripcion: "" });
      cargarTodo();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        setFormError(String(Object.values(e.response.data).flat().join(". ")).substring(0, 200));
      } else { setFormError("Error de conexion."); }
    } finally { setSaving(false); }
  };

  const calcularNomina = async (id: string) => {
    try {
      await nominasService.calcular(id);
      cargarTodo();
    } catch {}
  };

  const aprobarNomina = async (id: string) => {
    try {
      await nominasService.aprobar(id);
      cargarTodo();
    } catch {}
  };

  const aprobarVacacion = async (id: string) => {
    try {
      await vacacionesService.aprobar(id);
      cargarTodo();
    } catch {}
  };

  const verDetalleNomina = async (id: string) => {
    try {
      const { data } = await nominasService.getById(id);
      setSelectedNomina(data);
    } catch {}
  };

  const esClaro = tema.texto === "#0f172a";
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  const activos = empleados.filter((e) => e.estado === "ACTIVO").length;
  const enVacaciones = empleados.filter((e) => e.estado === "VACACIONES").length;
  const suspendidos = empleados.filter((e) => e.estado === "SUSPENDIDO").length;

  const estadoColor = (estado: string) => {
    switch (estado) {
      case "ACTIVO": return { bg: "rgba(16,185,129,0.12)", color: "#10b981" };
      case "VACACIONES": return { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" };
      case "SUSPENDIDO": return { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" };
      case "INACTIVO": return { bg: "rgba(239,68,68,0.12)", color: "#ef4444" };
      default: return { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
    }
  };

  const nominaEstadoColor = (estado: string) => {
    switch (estado) {
      case "BORRADOR": return { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
      case "CALCULADA": return { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" };
      case "APROBADA": return { bg: "rgba(16,185,129,0.12)", color: "#10b981" };
      case "PAGADA": return { bg: "rgba(168,85,247,0.12)", color: "#a855f7" };
      default: return { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
    }
  };

  const vacacionEstadoColor = (estado: string) => {
    switch (estado) {
      case "SOLICITADA": return { bg: "rgba(245,158,11,0.12)", color: "#f59e0b" };
      case "APROBADA": return { bg: "rgba(16,185,129,0.12)", color: "#10b981" };
      case "RECHAZADA": return { bg: "rgba(239,68,68,0.12)", color: "#ef4444" };
      case "EN_CURSO": return { bg: "rgba(59,130,246,0.12)", color: "#3b82f6" };
      case "COMPLETADA": return { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
      default: return { bg: "rgba(100,116,139,0.12)", color: "#64748b" };
    }
  };

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
        .btn-sm { padding:6px 14px; border-radius:8px; border:none; font-weight:500; cursor:pointer; font-size:12px; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
        .btn-sm:hover { opacity:0.85; }
        .hr-tabs { display:flex; gap:8px; margin-bottom:20px; flex-wrap:wrap; }
        .hr-tab { padding:8px 20px; border-radius:8px; border:1px solid ${tema.borde}; cursor:pointer; font-size:13px; background:transparent; color:${tema.subtexto}; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .hr-tab.active { background:linear-gradient(135deg,${tema.secondary},${tema.accent}); color:#fff; border-color:transparent; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:140px; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .hr-table { width:100%; border-collapse:separate; border-spacing:0; background:${tema.card}; border-radius:16px; overflow:hidden; border:1px solid ${tema.borde}; }
        .hr-table th { padding:12px 16px; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:${tema.subtexto}; border-bottom:1px solid ${tema.borde}; font-weight:600; }
        .hr-table td { padding:10px 16px; border-bottom:1px solid ${tema.borde}; font-size:13px; }
        .hr-table tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .hr-badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:10px; font-weight:600; }
        .hr-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:20px; cursor:pointer; transition:all 0.2s; }
        .hr-card:hover { border-color:${tema.accent}; transform:translateY(-2px); }
        .hr-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:16px; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:24px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .form-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; grid-column:1/-1; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .detail-section { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px; margin-top:16px; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => (window.location.href = "/dashboard")}>Volver</button>
            <h1 className="page-title"><span>Recursos Humanos</span></h1>
          </div>
          {tab === "empleados" && (
            <button className="btn-primary" onClick={() => { setFormError(""); setShowEmpleadoModal(true); }}>+ Nuevo Empleado</button>
          )}
          {tab === "nominas" && (
            <button className="btn-primary" onClick={() => { setFormError(""); setShowNominaModal(true); }}>+ Nueva Nomina</button>
          )}
          {tab === "departamentos" && (
            <button className="btn-primary" onClick={() => { setFormError(""); setShowDeptModal(true); }}>+ Nuevo Departamento</button>
          )}
        </div>

        <div className="hr-tabs">
          <button className={`hr-tab ${tab === "empleados" ? "active" : ""}`}
            onClick={() => setTab("empleados")}>Empleados</button>
          <button className={`hr-tab ${tab === "nominas" ? "active" : ""}`}
            onClick={() => { setTab("nominas"); setSelectedNomina(null); }}>Nominas</button>
          <button className={`hr-tab ${tab === "departamentos" ? "active" : ""}`}
            onClick={() => setTab("departamentos")}>Departamentos</button>
          <button className={`hr-tab ${tab === "vacaciones" ? "active" : ""}`}
            onClick={() => setTab("vacaciones")}>Vacaciones</button>
        </div>

        {loading && <div className="loading">Cargando...</div>}

        {/* ========== EMPLEADOS TAB ========== */}
        {!loading && tab === "empleados" && (
          <>
            <div className="stats-row">
              <div className="mini-stat">
                <div className="mini-stat-val" style={{ color: "#10b981" }}>{activos}</div>
                <div className="mini-stat-label">Activos</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-val" style={{ color: "#3b82f6" }}>{enVacaciones}</div>
                <div className="mini-stat-label">En Vacaciones</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-val" style={{ color: "#f59e0b" }}>{suspendidos}</div>
                <div className="mini-stat-label">Suspendidos</div>
              </div>
            </div>

            {empleados.length === 0 ? (
              <div className="empty-state">No hay empleados registrados.</div>
            ) : (
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Codigo</th><th>Nombre</th><th>Cedula</th><th>Cargo</th>
                    <th>Departamento</th><th>Salario Bruto</th><th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {empleados.map((e) => {
                    const ec = estadoColor(e.estado);
                    return (
                      <tr key={e.id}>
                        <td style={{ fontFamily: "monospace", color: tema.accent, fontWeight: 600 }}>{e.codigo}</td>
                        <td style={{ fontWeight: 500 }}>{e.nombre}</td>
                        <td style={{ color: tema.subtexto }}>{e.cedula}</td>
                        <td>{e.cargo}</td>
                        <td style={{ color: tema.subtexto }}>{e.departamento_nombre}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(e.salario_bruto)}</td>
                        <td>
                          <span className="hr-badge" style={{ background: ec.bg, color: ec.color }}>
                            {e.estado}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ========== NOMINAS TAB ========== */}
        {!loading && tab === "nominas" && !selectedNomina && (
          <>
            {nominas.length === 0 ? (
              <div className="empty-state">No hay nominas registradas.</div>
            ) : (
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Nombre</th><th>Tipo</th><th>Periodo Desde</th><th>Periodo Hasta</th>
                    <th>Total Bruto</th><th>Total Neto</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {nominas.map((n) => {
                    const nc = nominaEstadoColor(n.estado);
                    return (
                      <tr key={n.id}>
                        <td style={{ fontWeight: 500, cursor: "pointer", color: tema.accent }}
                          onClick={() => verDetalleNomina(n.id)}>{n.nombre}</td>
                        <td style={{ color: tema.subtexto }}>{n.tipo}</td>
                        <td>{n.periodo_desde}</td>
                        <td>{n.periodo_hasta}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(n.total_bruto)}</td>
                        <td style={{ fontWeight: 600 }}>{fmt(n.total_neto)}</td>
                        <td>
                          <span className="hr-badge" style={{ background: nc.bg, color: nc.color }}>
                            {n.estado}
                          </span>
                        </td>
                        <td style={{ display: "flex", gap: 6 }}>
                          <button className="btn-sm" style={{
                            background: "rgba(59,130,246,0.12)", color: "#3b82f6",
                          }} onClick={() => verDetalleNomina(n.id)}>Ver</button>
                          {n.estado === "BORRADOR" && (
                            <button className="btn-sm" style={{
                              background: "rgba(245,158,11,0.12)", color: "#f59e0b",
                            }} onClick={() => calcularNomina(n.id)}>Calcular</button>
                          )}
                          {n.estado === "CALCULADA" && (
                            <button className="btn-sm" style={{
                              background: "rgba(16,185,129,0.12)", color: "#10b981",
                            }} onClick={() => aprobarNomina(n.id)}>Aprobar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}

        {/* ========== NOMINA DETALLE ========== */}
        {!loading && tab === "nominas" && selectedNomina && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 700, fontSize: 18 }}>{selectedNomina.nombre}</div>
                <div style={{ color: tema.subtexto, fontSize: 13 }}>
                  {selectedNomina.tipo} | {selectedNomina.periodo_desde} - {selectedNomina.periodo_hasta}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {selectedNomina.estado === "BORRADOR" && (
                  <button className="btn-sm" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}
                    onClick={() => calcularNomina(selectedNomina.id)}>Calcular</button>
                )}
                {selectedNomina.estado === "CALCULADA" && (
                  <button className="btn-sm" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981" }}
                    onClick={() => aprobarNomina(selectedNomina.id)}>Aprobar</button>
                )}
                <button className="btn-cancel" style={{ padding: "6px 14px", fontSize: 13 }}
                  onClick={() => setSelectedNomina(null)}>Volver a lista</button>
              </div>
            </div>

            <div className="stats-row">
              <div className="mini-stat">
                <div className="mini-stat-val" style={{ color: tema.accent }}>{fmt(selectedNomina.total_bruto)}</div>
                <div className="mini-stat-label">Total Bruto</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-val" style={{ color: "#10b981" }}>{fmt(selectedNomina.total_neto)}</div>
                <div className="mini-stat-label">Total Neto</div>
              </div>
              <div className="mini-stat">
                <div className="mini-stat-val">
                  <span className="hr-badge" style={{
                    ...(() => { const c = nominaEstadoColor(selectedNomina.estado); return { background: c.bg, color: c.color }; })(),
                    fontSize: 12, padding: "4px 12px",
                  }}>{selectedNomina.estado}</span>
                </div>
                <div className="mini-stat-label">Estado</div>
              </div>
            </div>

            <div className="detail-section">
              <div style={{ fontWeight: 700, marginBottom: 16, fontSize: 14 }}>Desglose por Empleado</div>
              {selectedNomina.detalles && selectedNomina.detalles.length > 0 ? (
                <table className="hr-table">
                  <thead>
                    <tr>
                      <th>Empleado</th><th>Salario Bruto</th><th>TSS</th>
                      <th>ISR</th><th>Total Deducciones</th><th>Neto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedNomina.detalles.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 500 }}>{d.empleado_nombre}</td>
                        <td>{fmt(d.salario_bruto)}</td>
                        <td style={{ color: "#ef4444" }}>{fmt(d.tss_empleado)}</td>
                        <td style={{ color: "#ef4444" }}>{fmt(d.isr)}</td>
                        <td style={{ color: "#ef4444", fontWeight: 600 }}>{fmt(d.total_deducciones)}</td>
                        <td style={{ color: "#10b981", fontWeight: 700 }}>{fmt(d.neto)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="empty-state" style={{ padding: 30 }}>
                  No hay detalles. Calcule la nomina para generar el desglose.
                </div>
              )}
            </div>
          </>
        )}

        {/* ========== DEPARTAMENTOS TAB ========== */}
        {!loading && tab === "departamentos" && (
          <>
            {departamentos.length === 0 ? (
              <div className="empty-state">No hay departamentos registrados.</div>
            ) : (
              <div className="hr-grid">
                {departamentos.map((d) => (
                  <div className="hr-card" key={d.id} style={{ cursor: "default" }}>
                    <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 6 }}>{d.nombre}</div>
                    {d.descripcion && (
                      <div style={{ color: tema.subtexto, fontSize: ".85rem" }}>{d.descripcion}</div>
                    )}
                    <div style={{ marginTop: 10, fontSize: ".8rem", color: tema.subtexto }}>
                      {empleados.filter((e) => e.departamento === d.id).length} empleados
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ========== VACACIONES TAB ========== */}
        {!loading && tab === "vacaciones" && (
          <>
            {vacaciones.length === 0 ? (
              <div className="empty-state">No hay solicitudes de vacaciones.</div>
            ) : (
              <table className="hr-table">
                <thead>
                  <tr>
                    <th>Empleado</th><th>Fecha Desde</th><th>Fecha Hasta</th>
                    <th>Dias</th><th>Estado</th><th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {vacaciones.map((v) => {
                    const vc = vacacionEstadoColor(v.estado);
                    return (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 500 }}>{v.empleado_nombre}</td>
                        <td>{v.fecha_desde}</td>
                        <td>{v.fecha_hasta}</td>
                        <td style={{ fontWeight: 600 }}>{v.dias}</td>
                        <td>
                          <span className="hr-badge" style={{ background: vc.bg, color: vc.color }}>
                            {v.estado}
                          </span>
                        </td>
                        <td>
                          {v.estado === "SOLICITADA" && (
                            <button className="btn-sm" style={{
                              background: "rgba(16,185,129,0.12)", color: "#10b981",
                            }} onClick={() => aprobarVacacion(v.id)}>Aprobar</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>

      {/* ========== MODAL: NUEVO EMPLEADO ========== */}
      {showEmpleadoModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowEmpleadoModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Nuevo Empleado</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group full">
                <label className="form-label">Nombre *</label>
                <input className="form-input" placeholder="Nombre completo" value={empleadoForm.nombre}
                  onChange={(e) => setEmpleadoForm({ ...empleadoForm, nombre: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Cedula *</label>
                <input className="form-input" placeholder="000-0000000-0" value={empleadoForm.cedula}
                  onChange={(e) => setEmpleadoForm({ ...empleadoForm, cedula: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Cargo</label>
                <input className="form-input" placeholder="Cargo" value={empleadoForm.cargo}
                  onChange={(e) => setEmpleadoForm({ ...empleadoForm, cargo: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Salario Bruto</label>
                <input type="number" className="form-input" placeholder="0.00" value={empleadoForm.salario_bruto}
                  onChange={(e) => setEmpleadoForm({ ...empleadoForm, salario_bruto: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Fecha Ingreso</label>
                <input type="date" className="form-input" value={empleadoForm.fecha_ingreso}
                  onChange={(e) => setEmpleadoForm({ ...empleadoForm, fecha_ingreso: e.target.value })} />
              </div>
              <div className="form-group full">
                <label className="form-label">Departamento</label>
                <select className="form-input" value={empleadoForm.departamento}
                  onChange={(e) => setEmpleadoForm({ ...empleadoForm, departamento: e.target.value })}>
                  <option value="">-- Seleccionar --</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>{d.nombre}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowEmpleadoModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearEmpleado} disabled={saving}>
                {saving ? "Guardando..." : "Crear Empleado"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: NUEVA NOMINA ========== */}
      {showNominaModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowNominaModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Nueva Nomina</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group full">
                <label className="form-label">Nombre *</label>
                <input className="form-input" placeholder="Ej: Nomina Marzo 2026" value={nominaForm.nombre}
                  onChange={(e) => setNominaForm({ ...nominaForm, nombre: e.target.value })} />
              </div>
              <div className="form-group full">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={nominaForm.tipo}
                  onChange={(e) => setNominaForm({ ...nominaForm, tipo: e.target.value })}>
                  <option value="QUINCENAL">Quincenal</option>
                  <option value="MENSUAL">Mensual</option>
                  <option value="SEMANAL">Semanal</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Periodo Desde *</label>
                <input type="date" className="form-input" value={nominaForm.periodo_desde}
                  onChange={(e) => setNominaForm({ ...nominaForm, periodo_desde: e.target.value })} />
              </div>
              <div className="form-group">
                <label className="form-label">Periodo Hasta *</label>
                <input type="date" className="form-input" value={nominaForm.periodo_hasta}
                  onChange={(e) => setNominaForm({ ...nominaForm, periodo_hasta: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowNominaModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearNomina} disabled={saving}>
                {saving ? "Guardando..." : "Crear Nomina"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== MODAL: NUEVO DEPARTAMENTO ========== */}
      {showDeptModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowDeptModal(false)}>
          <div className="modal">
            <h2 className="modal-title">Nuevo Departamento</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group full">
                <label className="form-label">Nombre *</label>
                <input className="form-input" placeholder="Nombre del departamento" value={deptForm.nombre}
                  onChange={(e) => setDeptForm({ ...deptForm, nombre: e.target.value })} />
              </div>
              <div className="form-group full">
                <label className="form-label">Descripcion</label>
                <input className="form-input" placeholder="Descripcion (opcional)" value={deptForm.descripcion}
                  onChange={(e) => setDeptForm({ ...deptForm, descripcion: e.target.value })} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowDeptModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={crearDepartamento} disabled={saving}>
                {saving ? "Guardando..." : "Crear Departamento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
