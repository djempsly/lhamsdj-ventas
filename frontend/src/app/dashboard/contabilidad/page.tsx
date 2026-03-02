"use client";
import { useEffect, useState } from "react";
import { cuentaContableService } from "@/services/contabilidad";
import { contabilidadService } from "@/services/bancos";

interface CuentaContable {
  id: string;
  codigo: string;
  nombre: string;
  tipo: string;
  naturaleza: string;
  nivel: number;
  es_cuenta_detalle: boolean;
  saldo_actual: number;
  activa: boolean;
  cuenta_padre: string | null;
  cuenta_padre_nombre: string | null;
  subcuentas: CuentaContable[];
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

const TIPOS_CUENTA = ["ACTIVO","PASIVO","PATRIMONIO","INGRESO","COSTO","GASTO"];
const TIPO_COLORS: Record<string,string> = { ACTIVO:"badge-blue", PASIVO:"badge-red", PATRIMONIO:"badge-green", INGRESO:"badge-green", COSTO:"badge-yellow", GASTO:"badge-yellow" };

export default function ContabilidadPage() {
  const [cuentas, setCuentas] = useState<CuentaContable[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<CuentaContable | null>(null);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    codigo: "", nombre: "", tipo: "ACTIVO", naturaleza: "DEUDORA",
    cuenta_padre: "", es_cuenta_detalle: true, activa: true
  });
  const [activeTab, setActiveTab] = useState<"cuentas" | "balance" | "resultados">("cuentas");
  const [balanceGeneral, setBalanceGeneral] = useState<any>(null);
  const [estadoResultados, setEstadoResultados] = useState<any>(null);
  const [fechaBalance, setFechaBalance] = useState(new Date().toISOString().split("T")[0]);
  const [fechaDesde, setFechaDesde] = useState(`${new Date().getFullYear()}-01-01`);
  const [fechaHasta, setFechaHasta] = useState(new Date().toISOString().split("T")[0]);
  const [loadingEF, setLoadingEF] = useState(false);

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data } = await cuentaContableService.getAll();
      setCuentas(Array.isArray(data) ? data : data.results || []);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const flattenCuentas = (list: CuentaContable[]): CuentaContable[] => {
    const result: CuentaContable[] = [];
    const walk = (items: CuentaContable[]) => {
      for (const c of items) {
        result.push(c);
        if (c.subcuentas?.length) walk(c.subcuentas);
      }
    };
    walk(list);
    return result;
  };

  const validateForm = (): string | null => {
    if (!form.codigo.trim()) return "El codigo es requerido.";
    if (form.codigo.trim().length > 20) return "Codigo muy largo (max 20).";
    if (!form.nombre.trim()) return "El nombre es requerido.";
    if (form.nombre.trim().length > 200) return "Nombre muy largo (max 200).";
    return null;
  };

  const guardarCuenta = async () => {
    const error = validateForm();
    if (error) { setFormError(error); return; }
    setFormError("");
    setSaving(true);
    try {
      const data = {
        codigo: form.codigo.trim(),
        nombre: form.nombre.trim(),
        tipo: form.tipo,
        naturaleza: form.naturaleza,
        cuenta_padre: form.cuenta_padre || null,
        es_cuenta_detalle: form.es_cuenta_detalle,
        activa: form.activa,
      };
      if (editando) {
        await cuentaContableService.actualizar(editando.id, data);
      } else {
        await cuentaContableService.crear(data);
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
        setFormError("Error de conexion.");
      }
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setForm({ codigo: "", nombre: "", tipo: "ACTIVO", naturaleza: "DEUDORA", cuenta_padre: "", es_cuenta_detalle: true, activa: true });
    setFormError("");
  };

  const abrirEditar = (c: CuentaContable) => {
    setEditando(c);
    setForm({
      codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, naturaleza: c.naturaleza,
      cuenta_padre: c.cuenta_padre || "", es_cuenta_detalle: c.es_cuenta_detalle, activa: c.activa
    });
    setFormError("");
    setShowModal(true);
  };

  const cargarBalanceGeneral = async () => {
    setLoadingEF(true);
    try {
      const { data } = await contabilidadService.getBalanceGeneral(fechaBalance);
      setBalanceGeneral(data);
    } catch {}
    setLoadingEF(false);
  };

  const cargarEstadoResultados = async () => {
    setLoadingEF(true);
    try {
      const { data } = await contabilidadService.getEstadoResultados(fechaDesde, fechaHasta);
      setEstadoResultados(data);
    } catch {}
    setLoadingEF(false);
  };

  const formatCurrency = (n: number) => new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(n);
  const esClaro = tema.texto === "#0f172a";
  const allFlat = flattenCuentas(cuentas);

  const renderCuenta = (cuenta: CuentaContable, depth: number = 0): React.ReactNode => {
    const hasSub = cuenta.subcuentas?.length > 0;
    const isExpanded = expanded.has(cuenta.id);
    return (
      <div key={cuenta.id}>
        <div className="tree-row" style={{paddingLeft: `${16 + depth * 24}px`}}>
          <span className="tree-toggle" onClick={() => hasSub && toggleExpand(cuenta.id)}>
            {hasSub ? (isExpanded ? "v" : ">") : " "}
          </span>
          <span className="tree-code">{cuenta.codigo}</span>
          <span className="tree-name">{cuenta.nombre}</span>
          <span className={`badge ${TIPO_COLORS[cuenta.tipo] || "badge-blue"}`}>{cuenta.tipo}</span>
          <span className="badge badge-blue" style={{marginLeft:4}}>{cuenta.naturaleza}</span>
          <span className="tree-saldo">{formatCurrency(cuenta.saldo_actual)}</span>
          <span className={`badge ${cuenta.activa?"badge-green":"badge-red"}`} style={{marginLeft:4}}>{cuenta.activa?"Activa":"Inactiva"}</span>
          <button className="action-btn" style={{marginLeft:8}} onClick={() => abrirEditar(cuenta)}>Editar</button>
        </div>
        {hasSub && isExpanded && cuenta.subcuentas.map(sub => renderCuenta(sub, depth + 1))}
      </div>
    );
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
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:120px; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .tree-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow:hidden; }
        .tree-row {
          display:flex; align-items:center; gap:8px; padding:12px 16px;
          border-bottom:1px solid ${tema.borde}; font-size:13px; transition:background 0.15s;
        }
        .tree-row:hover { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .tree-toggle { width:16px; cursor:pointer; font-family:monospace; color:${tema.subtexto}; user-select:none; }
        .tree-code { font-family:monospace; font-size:12px; color:${tema.accent}; min-width:80px; font-weight:600; }
        .tree-name { flex:1; font-weight:500; }
        .tree-saldo { font-family:'Syne',sans-serif; font-weight:700; min-width:120px; text-align:right; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:10px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .action-btn { background:none; border:1px solid ${tema.borde}; border-radius:8px; padding:4px 8px; font-size:11px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; }
        .action-btn:hover { border-color:${tema.accent}50; color:${tema.accent}; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:24px; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; }
        .form-checkbox { display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer; }
        .form-checkbox input { width:18px; height:18px; cursor:pointer; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .form-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; grid-column:1/-1; }
        .ef-tabs { display:flex; gap:8px; margin-bottom:20px; }
        .ef-tab { padding:8px 20px; border-radius:8px; border:1px solid ${tema.borde}; cursor:pointer; font-size:13px; background:transparent; color:${tema.subtexto}; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .ef-tab.active { background:linear-gradient(135deg,${tema.secondary},${tema.accent}); color:#fff; border-color:transparent; }
        .ef-section { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px; }
        .ef-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid ${tema.borde}; font-size:13px; }
        .ef-row.total { font-weight:700; font-size:15px; border-top:2px solid ${tema.accent}; margin-top:8px; padding-top:12px; }
        .ef-group-title { font-weight:700; font-size:14px; margin:16px 0 8px; color:${tema.accent}; }
        .ef-filter-row { display:flex; gap:12px; margin-bottom:16px; align-items:end; }
        .ef-filter-row .form-group { margin-bottom:0; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Contabilidad</span></h1>
          </div>
          {activeTab === "cuentas" && (
            <button className="btn-primary" onClick={() => { resetForm(); setEditando(null); setShowModal(true); }}>+ Nueva Cuenta</button>
          )}
        </div>

        <div className="ef-tabs">
          <button className={`ef-tab ${activeTab === "cuentas" ? "active" : ""}`}
            onClick={() => setActiveTab("cuentas")}>Plan de Cuentas</button>
          <button className={`ef-tab ${activeTab === "balance" ? "active" : ""}`}
            onClick={() => { setActiveTab("balance"); if (!balanceGeneral) cargarBalanceGeneral(); }}>Balance General</button>
          <button className={`ef-tab ${activeTab === "resultados" ? "active" : ""}`}
            onClick={() => { setActiveTab("resultados"); if (!estadoResultados) cargarEstadoResultados(); }}>Estado de Resultados</button>
        </div>

        {activeTab === "cuentas" && (
          <>
            <div className="stats-row">
              {TIPOS_CUENTA.map(t => (
                <div className="mini-stat" key={t}>
                  <div className="mini-stat-val">{allFlat.filter(c => c.tipo === t).length}</div>
                  <div className="mini-stat-label">{t}</div>
                </div>
              ))}
            </div>

            {loading ? (
              <div className="loading">Cargando plan de cuentas...</div>
            ) : cuentas.length === 0 ? (
              <div className="empty-state"><p>No hay cuentas contables. Cree la primera!</p></div>
            ) : (
              <div className="tree-wrap">
                {cuentas.map(c => renderCuenta(c))}
              </div>
            )}
          </>
        )}

        {activeTab === "balance" && (
          <div className="ef-section">
            <div className="ef-filter-row">
              <div className="form-group">
                <label className="form-label">Fecha de corte</label>
                <input type="date" className="form-input" value={fechaBalance}
                  onChange={(e) => setFechaBalance(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={cargarBalanceGeneral}
                disabled={loadingEF}>{loadingEF ? "Cargando..." : "Generar"}</button>
            </div>

            {balanceGeneral && (
              <>
                <div className="ef-group-title">Activos</div>
                {balanceGeneral.activos.cuentas.map((c: any) => (
                  <div className="ef-row" key={c.codigo}>
                    <span>{c.codigo} - {c.nombre}</span>
                    <span>{formatCurrency(c.saldo)}</span>
                  </div>
                ))}
                <div className="ef-row total">
                  <span>Total Activos</span>
                  <span>{formatCurrency(balanceGeneral.activos.total)}</span>
                </div>

                <div className="ef-group-title">Pasivos</div>
                {balanceGeneral.pasivos.cuentas.map((c: any) => (
                  <div className="ef-row" key={c.codigo}>
                    <span>{c.codigo} - {c.nombre}</span>
                    <span>{formatCurrency(c.saldo)}</span>
                  </div>
                ))}
                <div className="ef-row total">
                  <span>Total Pasivos</span>
                  <span>{formatCurrency(balanceGeneral.pasivos.total)}</span>
                </div>

                <div className="ef-group-title">Patrimonio</div>
                {balanceGeneral.patrimonio.cuentas.map((c: any) => (
                  <div className="ef-row" key={c.codigo}>
                    <span>{c.codigo} - {c.nombre}</span>
                    <span>{formatCurrency(c.saldo)}</span>
                  </div>
                ))}
                <div className="ef-row total">
                  <span>Total Patrimonio</span>
                  <span>{formatCurrency(balanceGeneral.patrimonio.total)}</span>
                </div>

                <div className="ef-row total" style={{ marginTop: 16 }}>
                  <span>Activos = Pasivos + Patrimonio</span>
                  <span style={{ color: balanceGeneral.balance_cuadrado ? "#22c55e" : "#ef4444" }}>
                    {balanceGeneral.balance_cuadrado ? "Cuadrado" : "Descuadrado"}
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "resultados" && (
          <div className="ef-section">
            <div className="ef-filter-row">
              <div className="form-group">
                <label className="form-label">Desde</label>
                <input type="date" className="form-input" value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Hasta</label>
                <input type="date" className="form-input" value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={cargarEstadoResultados}
                disabled={loadingEF}>{loadingEF ? "Cargando..." : "Generar"}</button>
            </div>

            {estadoResultados && (
              <>
                <div className="ef-group-title">Ingresos</div>
                {estadoResultados.ingresos.cuentas.map((c: any) => (
                  <div className="ef-row" key={c.codigo}>
                    <span>{c.codigo} - {c.nombre}</span>
                    <span>{formatCurrency(c.monto)}</span>
                  </div>
                ))}
                <div className="ef-row total">
                  <span>Total Ingresos</span>
                  <span style={{ color: "#22c55e" }}>{formatCurrency(estadoResultados.ingresos.total)}</span>
                </div>

                <div className="ef-group-title">Costos</div>
                {estadoResultados.costos.cuentas.map((c: any) => (
                  <div className="ef-row" key={c.codigo}>
                    <span>{c.codigo} - {c.nombre}</span>
                    <span>{formatCurrency(c.monto)}</span>
                  </div>
                ))}
                <div className="ef-row total">
                  <span>Total Costos</span>
                  <span style={{ color: "#ef4444" }}>{formatCurrency(estadoResultados.costos.total)}</span>
                </div>

                <div className="ef-row total" style={{ background: "rgba(14,165,233,0.05)", borderRadius: 8, padding: "12px 8px" }}>
                  <span>Utilidad Bruta</span>
                  <span>{formatCurrency(estadoResultados.utilidad_bruta)}</span>
                </div>

                <div className="ef-group-title">Gastos Operativos</div>
                {estadoResultados.gastos.cuentas.map((c: any) => (
                  <div className="ef-row" key={c.codigo}>
                    <span>{c.codigo} - {c.nombre}</span>
                    <span>{formatCurrency(c.monto)}</span>
                  </div>
                ))}
                <div className="ef-row total">
                  <span>Total Gastos</span>
                  <span style={{ color: "#ef4444" }}>{formatCurrency(estadoResultados.gastos.total)}</span>
                </div>

                <div className="ef-row total" style={{
                  background: estadoResultados.utilidad_neta >= 0 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  borderRadius: 8, padding: "14px 8px", marginTop: 12,
                }}>
                  <span style={{ fontSize: 16 }}>Utilidad Neta</span>
                  <span style={{
                    fontSize: 18,
                    color: estadoResultados.utilidad_neta >= 0 ? "#22c55e" : "#ef4444",
                  }}>
                    {formatCurrency(estadoResultados.utilidad_neta)}
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editando ? "Editar Cuenta" : "Nueva Cuenta Contable"}</h2>
            <div className="form-grid">
              {formError && <div className="form-error">{formError}</div>}
              <div className="form-group">
                <label className="form-label">Codigo *</label>
                <input className="form-input" placeholder="1.1.01" value={form.codigo} onChange={e => setForm({...form,codigo:e.target.value})} maxLength={20} />
              </div>
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" placeholder="Caja General" value={form.nombre} onChange={e => setForm({...form,nombre:e.target.value})} maxLength={200} />
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <select className="form-input" value={form.tipo} onChange={e => setForm({...form,tipo:e.target.value})}>
                  {TIPOS_CUENTA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Naturaleza</label>
                <select className="form-input" value={form.naturaleza} onChange={e => setForm({...form,naturaleza:e.target.value})}>
                  <option value="DEUDORA">Deudora</option>
                  <option value="ACREEDORA">Acreedora</option>
                </select>
              </div>
              <div className="form-group full">
                <label className="form-label">Cuenta Padre (opcional)</label>
                <select className="form-input" value={form.cuenta_padre} onChange={e => setForm({...form,cuenta_padre:e.target.value})}>
                  <option value="">-- Ninguna (cuenta raiz) --</option>
                  {allFlat.map(c => <option key={c.id} value={c.id}>{c.codigo} - {c.nombre}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-checkbox">
                  <input type="checkbox" checked={form.es_cuenta_detalle} onChange={e => setForm({...form,es_cuenta_detalle:e.target.checked})} />
                  Cuenta de detalle
                </label>
              </div>
              <div className="form-group">
                <label className="form-checkbox">
                  <input type="checkbox" checked={form.activa} onChange={e => setForm({...form,activa:e.target.checked})} />
                  Activa
                </label>
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={guardarCuenta} disabled={saving}>
                {saving ? "Guardando..." : editando ? "Guardar cambios" : "Crear cuenta"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
