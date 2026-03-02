"use client";
import { useEffect, useState } from "react";
import { negocioService, sucursalService, categoriaService } from "@/services/settings";
import { usuarioService } from "@/services/usuarios";

interface Negocio {
  id: string;
  codigo_licencia: string;
  nombre_comercial: string;
  razon_social: string;
  identificacion_fiscal: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  tipo_licencia: string;
  estado_licencia: string;
  fecha_vencimiento: string;
  max_usuarios: number;
  max_sucursales: number;
  ambiente_fiscal: string;
}

interface Sucursal {
  id: string;
  nombre: string;
  codigo: string;
  direccion: string;
  telefono: string;
  es_principal: boolean;
  activa: boolean;
}

interface Usuario {
  id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  rol: string;
  telefono: string;
  sucursal_nombre: string;
  puede_crear_productos: boolean;
  puede_editar_precios: boolean;
  puede_ver_costos: boolean;
  puede_hacer_descuentos: boolean;
  puede_anular_ventas: boolean;
  puede_ver_reportes: boolean;
  two_factor_enabled: boolean;
  ultimo_acceso: string;
}

interface Categoria {
  id: string;
  nombre: string;
  descripcion: string;
  codigo: string;
  activa: boolean;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

const ROLES = ["SUPER_ADMIN","ADMIN_NEGOCIO","GERENTE","CONTADOR","CAJERO","VENDEDOR","ALMACEN"];

type Tab = "negocio" | "sucursales" | "usuarios" | "categorias";

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [tab, setTab] = useState<Tab>("negocio");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Negocio
  const [negocio, setNegocio] = useState<Negocio | null>(null);
  const [negForm, setNegForm] = useState({ nombre_comercial: "", razon_social: "", identificacion_fiscal: "", telefono: "", email: "", direccion: "", ciudad: "", ambiente_fiscal: "TEST" });

  // Sucursales
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [showSucModal, setShowSucModal] = useState(false);
  const [editSuc, setEditSuc] = useState<Sucursal | null>(null);
  const [sucForm, setSucForm] = useState({ nombre: "", codigo: "", direccion: "", telefono: "", es_principal: false, activa: true });

  // Usuarios
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [showUsrModal, setShowUsrModal] = useState(false);
  const [editUsr, setEditUsr] = useState<Usuario | null>(null);
  const [usrForm, setUsrForm] = useState({
    username: "", email: "", first_name: "", last_name: "", password: "",
    rol: "CAJERO", telefono: "",
    puede_crear_productos: false, puede_editar_precios: false, puede_ver_costos: false,
    puede_hacer_descuentos: false, puede_anular_ventas: false, puede_ver_reportes: false,
  });

  // Categorias
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [showCatModal, setShowCatModal] = useState(false);
  const [editCat, setEditCat] = useState<Categoria | null>(null);
  const [catForm, setCatForm] = useState({ nombre: "", descripcion: "", codigo: "" });

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [nRes, sRes, uRes, cRes] = await Promise.all([
        negocioService.getAll(),
        sucursalService.getAll(),
        usuarioService.getAll(),
        categoriaService.getAll(),
      ]);
      const negocios = Array.isArray(nRes.data) ? nRes.data : nRes.data.results || [];
      if (negocios.length > 0) {
        setNegocio(negocios[0]);
        const n = negocios[0];
        setNegForm({
          nombre_comercial: n.nombre_comercial || "", razon_social: n.razon_social || "",
          identificacion_fiscal: n.identificacion_fiscal || "", telefono: n.telefono || "",
          email: n.email || "", direccion: n.direccion || "", ciudad: n.ciudad || "",
          ambiente_fiscal: n.ambiente_fiscal || "TEST",
        });
      }
      setSucursales(Array.isArray(sRes.data) ? sRes.data : sRes.data.results || []);
      setUsuarios(Array.isArray(uRes.data) ? uRes.data : uRes.data.results || []);
      setCategorias(Array.isArray(cRes.data) ? cRes.data : cRes.data.results || []);
    } catch { /* interceptor */ }
  };

  const showSuccess = (msg: string) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(""), 3000); };

  // --- Negocio ---
  const guardarNegocio = async () => {
    if (!negocio) return;
    setFormError("");
    setSaving(true);
    try {
      await negocioService.actualizar(negocio.id, negForm);
      showSuccess("Negocio actualizado.");
      loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      setFormError(e?.response?.data ? String(Object.values(e.response.data).flat().join('. ')).substring(0, 200) : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  };

  // --- Sucursales ---
  const guardarSucursal = async () => {
    if (!sucForm.nombre.trim() || !sucForm.codigo.trim()) { setFormError("Nombre y codigo son requeridos."); return; }
    setFormError("");
    setSaving(true);
    try {
      if (editSuc) {
        await sucursalService.actualizar(editSuc.id, sucForm);
      } else {
        await sucursalService.crear(sucForm);
      }
      setShowSucModal(false);
      setEditSuc(null);
      showSuccess("Sucursal guardada.");
      loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      setFormError(e?.response?.data ? String(Object.values(e.response.data).flat().join('. ')).substring(0, 200) : "Error.");
    } finally {
      setSaving(false);
    }
  };

  // --- Usuarios ---
  const guardarUsuario = async () => {
    if (!usrForm.username.trim()) { setFormError("Username requerido."); return; }
    if (!editUsr && !usrForm.password) { setFormError("Password requerido para nuevo usuario."); return; }
    setFormError("");
    setSaving(true);
    try {
      const data: Record<string, unknown> = { ...usrForm };
      if (editUsr) { delete data.password; }
      if (editUsr) {
        await usuarioService.actualizar(editUsr.id, data);
      } else {
        await usuarioService.crear(data);
      }
      setShowUsrModal(false);
      setEditUsr(null);
      showSuccess("Usuario guardado.");
      loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      setFormError(e?.response?.data ? String(Object.values(e.response.data).flat().join('. ')).substring(0, 200) : "Error.");
    } finally {
      setSaving(false);
    }
  };

  // --- Categorias ---
  const guardarCategoria = async () => {
    if (!catForm.nombre.trim()) { setFormError("Nombre requerido."); return; }
    setFormError("");
    setSaving(true);
    try {
      if (editCat) {
        await categoriaService.actualizar(editCat.id, catForm);
      } else {
        await categoriaService.crear(catForm);
      }
      setShowCatModal(false);
      setEditCat(null);
      showSuccess("Categoria guardada.");
      loadAll();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      setFormError(e?.response?.data ? String(Object.values(e.response.data).flat().join('. ')).substring(0, 200) : "Error.");
    } finally {
      setSaving(false);
    }
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
        .header { display:flex; align-items:center; gap:16px; margin-bottom:28px; }
        .back-btn { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:8px 16px; color:${tema.subtexto}; font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .back-btn:hover { color:${tema.accent}; border-color:${tema.accent}40; }
        .page-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .page-title span { color:${tema.accent}; }
        .tabs { display:flex; gap:4px; margin-bottom:24px; border-bottom:1px solid ${tema.borde}; padding-bottom:0; }
        .tab { padding:10px 20px; font-size:14px; font-weight:600; cursor:pointer; color:${tema.subtexto}; border-bottom:2px solid transparent; transition:all 0.2s; font-family:'Syne',sans-serif; background:none; border-top:none; border-left:none; border-right:none; }
        .tab.active { color:${tema.accent}; border-bottom-color:${tema.accent}; }
        .tab:hover { color:${tema.texto}; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .form-section { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:28px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; }
        .form-input:disabled { opacity:0.5; }
        .form-checkbox { display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; }
        .form-checkbox input { width:16px; height:16px; cursor:pointer; }
        .info-badge { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:12px 16px; }
        .info-label { font-size:10px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; }
        .info-val { font-size:14px; font-weight:600; margin-top:2px; }
        .info-row { display:flex; gap:12px; margin-bottom:20px; flex-wrap:wrap; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; }
        td { padding:12px 16px; font-size:13px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:10px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .action-btn { background:none; border:1px solid ${tema.borde}; border-radius:8px; padding:4px 10px; font-size:11px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; margin-right:4px; }
        .action-btn:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:24px; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .form-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; }
        .success-msg { background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#10b981; margin-bottom:16px; }
        .perms-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px; }
        .toolbar { display:flex; justify-content:flex-end; margin-bottom:16px; }
      `}</style>

      <div className="page">
        <div className="header">
          <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
          <h1 className="page-title"><span>Configuracion</span></h1>
        </div>

        {successMsg && <div className="success-msg">{successMsg}</div>}
        {formError && tab === "negocio" && <div className="form-error">{formError}</div>}

        <div className="tabs">
          {([["negocio","Negocio"],["sucursales","Sucursales"],["usuarios","Usuarios"],["categorias","Categorias"]] as const).map(([key, label]) => (
            <button key={key} className={`tab ${tab===key?"active":""}`} onClick={() => { setTab(key); setFormError(""); }}>{label}</button>
          ))}
        </div>

        {/* --- TAB: NEGOCIO --- */}
        {tab === "negocio" && negocio && (
          <div className="form-section">
            <div className="info-row">
              <div className="info-badge"><div className="info-label">Licencia</div><div className="info-val">{negocio.codigo_licencia}</div></div>
              <div className="info-badge"><div className="info-label">Tipo</div><div className="info-val">{negocio.tipo_licencia}</div></div>
              <div className="info-badge"><div className="info-label">Estado</div><div className="info-val"><span className={`badge ${negocio.estado_licencia==="ACTIVA"?"badge-green":"badge-red"}`}>{negocio.estado_licencia}</span></div></div>
              <div className="info-badge"><div className="info-label">Vence</div><div className="info-val">{negocio.fecha_vencimiento?.split('T')[0] || "—"}</div></div>
              <div className="info-badge"><div className="info-label">Max Usuarios</div><div className="info-val">{negocio.max_usuarios}</div></div>
              <div className="info-badge"><div className="info-label">Max Sucursales</div><div className="info-val">{negocio.max_sucursales}</div></div>
            </div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Nombre Comercial</label><input className="form-input" value={negForm.nombre_comercial} onChange={e => setNegForm({...negForm,nombre_comercial:e.target.value})} maxLength={200} /></div>
              <div className="form-group"><label className="form-label">Razon Social</label><input className="form-input" value={negForm.razon_social} onChange={e => setNegForm({...negForm,razon_social:e.target.value})} maxLength={200} /></div>
              <div className="form-group"><label className="form-label">RNC / ID Fiscal</label><input className="form-input" value={negForm.identificacion_fiscal} onChange={e => setNegForm({...negForm,identificacion_fiscal:e.target.value})} maxLength={20} /></div>
              <div className="form-group"><label className="form-label">Telefono</label><input className="form-input" value={negForm.telefono} onChange={e => setNegForm({...negForm,telefono:e.target.value})} maxLength={20} /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="form-input" value={negForm.email} onChange={e => setNegForm({...negForm,email:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Ciudad</label><input className="form-input" value={negForm.ciudad} onChange={e => setNegForm({...negForm,ciudad:e.target.value})} maxLength={100} /></div>
              <div className="form-group full"><label className="form-label">Direccion</label><input className="form-input" value={negForm.direccion} onChange={e => setNegForm({...negForm,direccion:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Ambiente Fiscal</label>
                <select className="form-input" value={negForm.ambiente_fiscal} onChange={e => setNegForm({...negForm,ambiente_fiscal:e.target.value})}>
                  <option value="TEST">Pruebas (TEST)</option><option value="PROD">Produccion (PROD)</option>
                </select>
              </div>
            </div>
            <div style={{marginTop:20,textAlign:"right"}}>
              <button className="btn-primary" onClick={guardarNegocio} disabled={saving}>{saving ? "Guardando..." : "Guardar Cambios"}</button>
            </div>
          </div>
        )}

        {/* --- TAB: SUCURSALES --- */}
        {tab === "sucursales" && (
          <>
            <div className="toolbar"><button className="btn-primary" onClick={() => { setEditSuc(null); setSucForm({nombre:"",codigo:"",direccion:"",telefono:"",es_principal:false,activa:true}); setFormError(""); setShowSucModal(true); }}>+ Nueva Sucursal</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Codigo</th><th>Nombre</th><th>Direccion</th><th>Telefono</th><th>Principal</th><th>Activa</th><th>Acciones</th></tr></thead>
                <tbody>
                  {sucursales.map(s => (
                    <tr key={s.id}>
                      <td style={{fontFamily:"monospace"}}>{s.codigo}</td>
                      <td style={{fontWeight:500}}>{s.nombre}</td>
                      <td>{s.direccion}</td>
                      <td>{s.telefono || "—"}</td>
                      <td>{s.es_principal ? <span className="badge badge-green">Si</span> : "No"}</td>
                      <td><span className={`badge ${s.activa?"badge-green":"badge-red"}`}>{s.activa?"Si":"No"}</span></td>
                      <td><button className="action-btn" onClick={() => { setEditSuc(s); setSucForm({nombre:s.nombre,codigo:s.codigo,direccion:s.direccion,telefono:s.telefono||"",es_principal:s.es_principal,activa:s.activa}); setFormError(""); setShowSucModal(true); }}>Editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* --- TAB: USUARIOS --- */}
        {tab === "usuarios" && (
          <>
            <div className="toolbar"><button className="btn-primary" onClick={() => { setEditUsr(null); setUsrForm({username:"",email:"",first_name:"",last_name:"",password:"",rol:"CAJERO",telefono:"",puede_crear_productos:false,puede_editar_precios:false,puede_ver_costos:false,puede_hacer_descuentos:false,puede_anular_ventas:false,puede_ver_reportes:false}); setFormError(""); setShowUsrModal(true); }}>+ Nuevo Usuario</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Username</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Sucursal</th><th>Ultimo Acceso</th><th>Acciones</th></tr></thead>
                <tbody>
                  {usuarios.map(u => (
                    <tr key={u.id}>
                      <td style={{fontWeight:500}}>{u.username}</td>
                      <td>{u.first_name} {u.last_name}</td>
                      <td>{u.email}</td>
                      <td><span className="badge badge-blue">{u.rol}</span></td>
                      <td>{u.sucursal_nombre || "—"}</td>
                      <td style={{fontSize:12}}>{u.ultimo_acceso ? new Date(u.ultimo_acceso).toLocaleString('es-DO',{dateStyle:'short',timeStyle:'short'}) : "—"}</td>
                      <td><button className="action-btn" onClick={() => {
                        setEditUsr(u);
                        setUsrForm({
                          username:u.username, email:u.email, first_name:u.first_name||"", last_name:u.last_name||"",
                          password:"", rol:u.rol, telefono:u.telefono||"",
                          puede_crear_productos:u.puede_crear_productos, puede_editar_precios:u.puede_editar_precios,
                          puede_ver_costos:u.puede_ver_costos, puede_hacer_descuentos:u.puede_hacer_descuentos,
                          puede_anular_ventas:u.puede_anular_ventas, puede_ver_reportes:u.puede_ver_reportes,
                        });
                        setFormError("");
                        setShowUsrModal(true);
                      }}>Editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* --- TAB: CATEGORIAS --- */}
        {tab === "categorias" && (
          <>
            <div className="toolbar"><button className="btn-primary" onClick={() => { setEditCat(null); setCatForm({nombre:"",descripcion:"",codigo:""}); setFormError(""); setShowCatModal(true); }}>+ Nueva Categoria</button></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Codigo</th><th>Nombre</th><th>Descripcion</th><th>Activa</th><th>Acciones</th></tr></thead>
                <tbody>
                  {categorias.map(c => (
                    <tr key={c.id}>
                      <td style={{fontFamily:"monospace"}}>{c.codigo || "—"}</td>
                      <td style={{fontWeight:500}}>{c.nombre}</td>
                      <td>{c.descripcion || "—"}</td>
                      <td><span className={`badge ${c.activa?"badge-green":"badge-red"}`}>{c.activa?"Si":"No"}</span></td>
                      <td><button className="action-btn" onClick={() => { setEditCat(c); setCatForm({nombre:c.nombre,descripcion:c.descripcion||"",codigo:c.codigo||""}); setFormError(""); setShowCatModal(true); }}>Editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* --- MODAL SUCURSAL --- */}
      {showSucModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowSucModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editSuc ? "Editar Sucursal" : "Nueva Sucursal"}</h2>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Nombre *</label><input className="form-input" value={sucForm.nombre} onChange={e => setSucForm({...sucForm,nombre:e.target.value})} maxLength={100} /></div>
              <div className="form-group"><label className="form-label">Codigo *</label><input className="form-input" value={sucForm.codigo} onChange={e => setSucForm({...sucForm,codigo:e.target.value})} maxLength={20} /></div>
              <div className="form-group full"><label className="form-label">Direccion</label><input className="form-input" value={sucForm.direccion} onChange={e => setSucForm({...sucForm,direccion:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Telefono</label><input className="form-input" value={sucForm.telefono} onChange={e => setSucForm({...sucForm,telefono:e.target.value})} maxLength={20} /></div>
              <div className="form-group">
                <label className="form-checkbox"><input type="checkbox" checked={sucForm.es_principal} onChange={e => setSucForm({...sucForm,es_principal:e.target.checked})} /> Es principal</label>
                <label className="form-checkbox"><input type="checkbox" checked={sucForm.activa} onChange={e => setSucForm({...sucForm,activa:e.target.checked})} /> Activa</label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowSucModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarSucursal} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL USUARIO --- */}
      {showUsrModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowUsrModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editUsr ? "Editar Usuario" : "Nuevo Usuario"}</h2>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Username *</label><input className="form-input" value={usrForm.username} onChange={e => setUsrForm({...usrForm,username:e.target.value})} maxLength={150} /></div>
              <div className="form-group"><label className="form-label">Email</label><input className="form-input" type="email" value={usrForm.email} onChange={e => setUsrForm({...usrForm,email:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Nombre</label><input className="form-input" value={usrForm.first_name} onChange={e => setUsrForm({...usrForm,first_name:e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Apellido</label><input className="form-input" value={usrForm.last_name} onChange={e => setUsrForm({...usrForm,last_name:e.target.value})} /></div>
              {!editUsr && (
                <div className="form-group full"><label className="form-label">Password *</label><input className="form-input" type="password" value={usrForm.password} onChange={e => setUsrForm({...usrForm,password:e.target.value})} /></div>
              )}
              <div className="form-group"><label className="form-label">Rol</label>
                <select className="form-input" value={usrForm.rol} onChange={e => setUsrForm({...usrForm,rol:e.target.value})}>
                  {ROLES.map(r => <option key={r} value={r}>{r.replace(/_/g," ")}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Telefono</label><input className="form-input" value={usrForm.telefono} onChange={e => setUsrForm({...usrForm,telefono:e.target.value})} maxLength={20} /></div>
              <div className="form-group full">
                <label className="form-label">Permisos</label>
                <div className="perms-grid">
                  {([
                    ["puede_crear_productos","Crear productos"],
                    ["puede_editar_precios","Editar precios"],
                    ["puede_ver_costos","Ver costos"],
                    ["puede_hacer_descuentos","Hacer descuentos"],
                    ["puede_anular_ventas","Anular ventas"],
                    ["puede_ver_reportes","Ver reportes"],
                  ] as const).map(([key, label]) => (
                    <label className="form-checkbox" key={key}>
                      <input type="checkbox" checked={usrForm[key]} onChange={e => setUsrForm({...usrForm,[key]:e.target.checked})} /> {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowUsrModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarUsuario} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CATEGORIA --- */}
      {showCatModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowCatModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editCat ? "Editar Categoria" : "Nueva Categoria"}</h2>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-grid">
              <div className="form-group"><label className="form-label">Nombre *</label><input className="form-input" value={catForm.nombre} onChange={e => setCatForm({...catForm,nombre:e.target.value})} maxLength={100} /></div>
              <div className="form-group"><label className="form-label">Codigo</label><input className="form-input" value={catForm.codigo} onChange={e => setCatForm({...catForm,codigo:e.target.value})} maxLength={20} /></div>
              <div className="form-group full"><label className="form-label">Descripcion</label><input className="form-input" value={catForm.descripcion} onChange={e => setCatForm({...catForm,descripcion:e.target.value})} /></div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowCatModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarCategoria} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
