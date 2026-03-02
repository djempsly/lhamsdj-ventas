"use client";
import { useEffect, useState } from "react";
import { proveedorService } from "@/services/proveedores";

interface Proveedor {
  id: string;
  identificacion_fiscal: string;
  nombre: string;
  nombre_comercial: string;
  telefono: string;
  email: string;
  direccion: string;
  tipo_retencion: string;
  dias_credito: number;
  balance: number;
  activo: boolean;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Proveedor | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nombre: "", nombre_comercial: "", identificacion_fiscal: "",
    telefono: "", email: "", direccion: "",
    tipo_retencion: "NINGUNA", dias_credito: "0"
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
      const { data } = await proveedorService.getAll();
      setProveedores(Array.isArray(data) ? data : data.results || []);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  const validateForm = (): string | null => {
    if (!form.nombre.trim()) return "El nombre es requerido.";
    if (form.nombre.trim().length > 200) return "Nombre muy largo (max 200).";
    if (!form.identificacion_fiscal.trim()) return "La identificacion fiscal es requerida.";
    if (form.identificacion_fiscal.trim().length > 20) return "Identificacion fiscal muy larga (max 20).";
    if (!form.telefono.trim()) return "El telefono es requerido.";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Email invalido.";
    const dias = parseInt(form.dias_credito);
    if (isNaN(dias) || dias < 0) return "Dias de credito invalido.";
    return null;
  };

  const guardarProveedor = async () => {
    const error = validateForm();
    if (error) { setFormError(error); return; }
    setFormError("");
    setSaving(true);
    try {
      const data = {
        nombre: form.nombre.trim(),
        nombre_comercial: form.nombre_comercial.trim(),
        identificacion_fiscal: form.identificacion_fiscal.trim(),
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        direccion: form.direccion.trim(),
        tipo_retencion: form.tipo_retencion,
        dias_credito: parseInt(form.dias_credito) || 0,
      };
      if (editando) {
        await proveedorService.actualizar(editando.id, data);
      } else {
        await proveedorService.crear(data);
      }
      setShowModal(false);
      setEditando(null);
      resetForm();
      cargarDatos();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        setFormError(String(Object.values(e.response.data).flat().join('. ')).substring(0, 200));
      } else {
        setFormError("Error de conexion. Intente nuevamente.");
      }
    } finally {
      setSaving(false);
    }
  };

  const eliminarProveedor = async (id: string) => {
    if (!confirm("Desactivar este proveedor?")) return;
    await proveedorService.desactivar(id);
    cargarDatos();
  };

  const resetForm = () => {
    setForm({ nombre: "", nombre_comercial: "", identificacion_fiscal: "", telefono: "", email: "", direccion: "", tipo_retencion: "NINGUNA", dias_credito: "0" });
    setFormError("");
  };

  const abrirEditar = (p: Proveedor) => {
    setEditando(p);
    setForm({
      nombre: p.nombre, nombre_comercial: p.nombre_comercial || "",
      identificacion_fiscal: p.identificacion_fiscal, telefono: p.telefono,
      email: p.email || "", direccion: p.direccion || "",
      tipo_retencion: p.tipo_retencion, dias_credito: String(p.dias_credito)
    });
    setFormError("");
    setShowModal(true);
  };

  const filtrados = proveedores.filter(p =>
    p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.identificacion_fiscal.toLowerCase().includes(busqueda.toLowerCase()) ||
    (p.nombre_comercial || "").toLowerCase().includes(busqueda.toLowerCase())
  );

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
        .toolbar { display:flex; gap:12px; margin-bottom:24px; }
        .search-input { flex:1; min-width:200px; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 16px; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .search-input::placeholder { color:${tema.subtexto}; }
        .search-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px ${tema.accent}40; }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
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
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .action-btn { background:none; border:1px solid ${tema.borde}; border-radius:8px; padding:5px 10px; font-size:12px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; margin-right:4px; }
        .action-btn:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .action-btn.del:hover { border-color:rgba(239,68,68,0.4); color:#ef4444; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:24px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .btn-cancel:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .form-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; grid-column:1/-1; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Proveedores</span></h1>
          </div>
          <button className="btn-primary" onClick={() => { resetForm(); setEditando(null); setShowModal(true); }}>+ Nuevo Proveedor</button>
        </div>

        <div className="stats-row">
          {[
            { val: proveedores.length, label: "Total proveedores" },
            { val: proveedores.filter(p => p.activo).length, label: "Activos" },
            { val: formatCurrency(proveedores.reduce((a, p) => a + Number(p.balance), 0)), label: "Cuentas por pagar" },
            { val: Math.round(proveedores.reduce((a, p) => a + p.dias_credito, 0) / (proveedores.length || 1)), label: "Dias credito prom." },
          ].map((s, i) => (
            <div className="mini-stat" key={i}>
              <div className="mini-stat-val">{s.val}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <input className="search-input" placeholder="Buscar por nombre o RNC..." value={busqueda} onChange={e => setBusqueda(e.target.value.substring(0, 100))} maxLength={100} />
        </div>

        {loading ? (
          <div className="loading">Cargando proveedores...</div>
        ) : filtrados.length === 0 ? (
          <div className="empty-state"><p>No hay proveedores. Crea el primero!</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>RNC/ID Fiscal</th><th>Nombre</th><th>Comercial</th><th>Telefono</th>
                  <th>Retencion</th><th>Dias Credito</th><th>Balance</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id}>
                    <td style={{fontFamily:"monospace",fontSize:12}}>{p.identificacion_fiscal}</td>
                    <td style={{fontWeight:500}}>{p.nombre}</td>
                    <td>{p.nombre_comercial || "—"}</td>
                    <td>{p.telefono}</td>
                    <td><span className={`badge ${p.tipo_retencion==="NINGUNA"?"badge-green":p.tipo_retencion==="AMBAS"?"badge-yellow":"badge-blue"}`}>{p.tipo_retencion}</span></td>
                    <td>{p.dias_credito} dias</td>
                    <td><span className={`badge ${Number(p.balance)>0?"badge-yellow":"badge-green"}`}>{formatCurrency(p.balance)}</span></td>
                    <td><span className={`badge ${p.activo?"badge-green":"badge-red"}`}>{p.activo?"Activo":"Inactivo"}</span></td>
                    <td>
                      <button className="action-btn" onClick={() => abrirEditar(p)}>Editar</button>
                      <button className="action-btn del" onClick={() => eliminarProveedor(p.id)}>Desactivar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editando ? "Editar Proveedor" : "Nuevo Proveedor"}</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group full">
                <label className="form-label">Nombre / Razon Social *</label>
                <input className="form-input" placeholder="Nombre del proveedor" value={form.nombre} onChange={e => setForm({...form,nombre:e.target.value})} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label">Nombre Comercial</label>
                <input className="form-input" placeholder="Nombre comercial" value={form.nombre_comercial} onChange={e => setForm({...form,nombre_comercial:e.target.value})} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label">RNC / ID Fiscal *</label>
                <input className="form-input" placeholder="000-00000-0" value={form.identificacion_fiscal} onChange={e => setForm({...form,identificacion_fiscal:e.target.value})} maxLength={20} />
              </div>
              <div className="form-group">
                <label className="form-label">Telefono *</label>
                <input className="form-input" placeholder="809-000-0000" value={form.telefono} onChange={e => setForm({...form,telefono:e.target.value})} maxLength={20} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input className="form-input" type="email" placeholder="correo@ejemplo.com" value={form.email} onChange={e => setForm({...form,email:e.target.value})} />
              </div>
              <div className="form-group full">
                <label className="form-label">Direccion</label>
                <input className="form-input" placeholder="Direccion completa" value={form.direccion} onChange={e => setForm({...form,direccion:e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo Retencion</label>
                <select className="form-input" value={form.tipo_retencion} onChange={e => setForm({...form,tipo_retencion:e.target.value})}>
                  <option value="NINGUNA">Ninguna</option>
                  <option value="ISR">ISR</option>
                  <option value="ITBIS">ITBIS</option>
                  <option value="AMBAS">Ambas</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Dias de Credito</label>
                <input className="form-input" type="number" min="0" placeholder="0" value={form.dias_credito} onChange={e => setForm({...form,dias_credito:e.target.value})} />
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarProveedor} disabled={saving}>
                {saving ? "Guardando..." : editando ? "Guardar cambios" : "Crear proveedor"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
