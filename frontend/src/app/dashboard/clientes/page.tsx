"use client";
import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clienteService } from "@/services/clientes";
import { clienteSchema } from "@/lib/validations/cliente";
import { useDebounce } from "@/hooks/useDebounce";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/constants";

interface Cliente {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  tipo_cliente: string;
  limite_credito: number;
  balance: number;
  activo: boolean;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function ClientesPage() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState<Cliente | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("");

  const debouncedSearch = useDebounce(busqueda, 300);
  const pagination = usePagination(25);
  const { canEditCredit, isAdmin } = usePermissions();

  const { register, handleSubmit, formState: { errors }, reset, watch } = useForm({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nombre: "", tipo_documento: "CEDULA" as const, numero_documento: "",
      telefono: "", email: "", direccion: "", tipo_cliente: "FINAL" as const,
      limite_credito: 0,
    },
  });

  const tipoCliente = watch("tipo_cliente");

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
  }, []);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: pagination.page,
        page_size: pagination.pageSize,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (filtroTipo) params.tipo_cliente = filtroTipo;
      if (filtroActivo !== "") params.activo = filtroActivo;
      const { data } = await clienteService.getAll(params);
      const response = data as { count?: number; results?: Cliente[] };
      setClientes(response.results || (Array.isArray(data) ? data : []));
      pagination.setTotal(response.count || 0);
    } catch { /* interceptor */ }
    setLoading(false);
  }, [pagination.page, pagination.pageSize, debouncedSearch, filtroTipo, filtroActivo]);

  useEffect(() => {
    if (mounted) cargarDatos();
  }, [mounted, cargarDatos]);

  useEffect(() => {
    pagination.setPage(1);
  }, [debouncedSearch, filtroTipo, filtroActivo]);

  const onSubmit = async (formData: Record<string, unknown>) => {
    setServerError("");
    setSaving(true);
    try {
      const payload = { ...formData, limite_credito: Number(formData.limite_credito) || 0 };
      if (editando) {
        await clienteService.actualizar(editando.id, payload);
      } else {
        await clienteService.crear(payload);
      }
      setShowModal(false);
      setEditando(null);
      reset();
      cargarDatos();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        const msg = Object.values(e.response.data).flat().join(". ");
        setServerError(String(msg).substring(0, 200));
      } else {
        setServerError("Error de conexion. Intente nuevamente.");
      }
    } finally {
      setSaving(false);
    }
  };

  const desactivarCliente = async (id: number) => {
    if (!confirm("Desactivar este cliente?")) return;
    await clienteService.desactivar(id);
    cargarDatos();
  };

  const abrirEditar = (c: Cliente) => {
    setEditando(c);
    reset({
      nombre: c.nombre,
      tipo_documento: c.tipo_documento as "CEDULA" | "RNC" | "PASAPORTE" | "OTRO",
      numero_documento: c.numero_documento,
      telefono: c.telefono || "",
      email: c.email || "",
      direccion: c.direccion || "",
      tipo_cliente: c.tipo_cliente as "FINAL" | "CREDITO" | "GUBERNAMENTAL" | "ESPECIAL",
      limite_credito: c.limite_credito,
    });
    setServerError("");
    setShowModal(true);
  };

  const abrirNuevo = () => {
    setEditando(null);
    reset();
    setServerError("");
    setShowModal(true);
  };

  const exportarCSV = async () => {
    try {
      const { data } = await clienteService.exportCSV();
      const blob = new Blob([data as BlobPart], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clientes_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch { /* error */ }
  };

  // Stats from current page
  const conBalance = clientes.filter(c => c.balance > 0).length;
  const totalCartera = clientes.reduce((a, c) => a + Number(c.balance), 0);
  const clientesCredito = clientes.filter(c => c.tipo_cliente === "CREDITO").length;

  const esClaro = tema.texto === "#0f172a";
  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        .page { min-height:100vh; background:${tema.bg}; color:${tema.texto}; padding:32px; font-family:'DM Sans',sans-serif; }
        .header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:16px; }
        .header-left { display:flex; align-items:center; gap:16px; }
        .page-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .page-title span { color:${tema.accent}; }
        .toolbar { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:24px; align-items:center; }
        .search-input { flex:1; min-width:200px; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 16px; color:${tema.texto}; font-size:14px; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .search-input::placeholder { color:${tema.subtexto}; }
        .search-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .filter-select { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; color:${tema.texto}; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; cursor:pointer; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px ${tema.accent}40; }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .btn-outline { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 16px; color:${tema.subtexto}; font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .btn-outline:hover { border-color:${tema.accent}40; color:${tema.accent}; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:140px; box-shadow:${esClaro ? "0 2px 8px rgba(0,0,0,0.06)" : "none"}; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; box-shadow:${esClaro ? "0 4px 16px rgba(0,0,0,0.07)" : "none"}; }
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
        .form-input.error { border-color:rgba(239,68,68,0.5); }
        .field-error { font-size:12px; color:#fca5a5; margin-top:2px; }
        .modal-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
        .btn-cancel:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .server-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; grid-column:1/-1; }
        .pagination { display:flex; align-items:center; justify-content:space-between; padding:16px; border-top:1px solid ${tema.borde}; }
        .page-info { font-size:13px; color:${tema.subtexto}; }
        .page-btns { display:flex; gap:6px; }
        .page-btn { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:8px; padding:6px 12px; font-size:12px; cursor:pointer; color:${tema.subtexto}; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
        .page-btn:hover:not(:disabled) { border-color:${tema.accent}40; color:${tema.accent}; }
        .page-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .page-btn.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }
        .skeleton { background:${tema.borde}; border-radius:6px; animation:pulse 1.5s ease-in-out infinite; }
        .sk-row { display:flex; gap:16px; padding:14px 16px; border-bottom:1px solid ${tema.borde}; }
        .sk-cell { height:16px; flex:1; }
        .credit-warn { display:inline-flex; align-items:center; gap:4px; color:#ef4444; font-size:10px; font-weight:700; }
        @media (max-width: 768px) {
          .page { padding:16px; }
          .form-grid { grid-template-columns:1fr; }
          .stats-row { flex-direction:column; }
          .toolbar { flex-direction:column; }
          th, td { padding:10px 8px; font-size:12px; }
        }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <h1 className="page-title"><span>Clientes</span></h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-outline" onClick={exportarCSV}>Exportar CSV</button>
            <button className="btn-primary" onClick={abrirNuevo}>+ Nuevo Cliente</button>
          </div>
        </div>

        <div className="stats-row">
          {[
            { val: pagination.total, label: "Total clientes" },
            { val: conBalance, label: "Con balance" },
            { val: formatCurrency(totalCartera), label: "Total cartera" },
            { val: clientesCredito, label: "Clientes credito" },
          ].map((s, i) => (
            <div className="mini-stat" key={i}>
              <div className="mini-stat-val">{s.val}</div>
              <div className="mini-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Buscar por nombre o documento..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value.substring(0, 100))}
            maxLength={100}
          />
          <select className="filter-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">Todos los tipos</option>
            <option value="FINAL">Consumidor Final</option>
            <option value="CREDITO">Credito</option>
            <option value="GUBERNAMENTAL">Gubernamental</option>
            <option value="ESPECIAL">Especial</option>
          </select>
          <select className="filter-select" value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)}>
            <option value="">Todos</option>
            <option value="true">Activos</option>
            <option value="false">Inactivos</option>
          </select>
        </div>

        {loading ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Documento</th><th>Nombre</th><th>Telefono</th><th>Tipo</th><th>Limite</th><th>Balance</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}><div className="skeleton" style={{ height: 16, width: `${60 + Math.random() * 40}%` }} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : clientes.length === 0 ? (
          <div className="empty-state"><p>{debouncedSearch ? "No se encontraron clientes." : "No hay clientes. Crea el primero!"}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Documento</th><th>Nombre</th><th>Telefono</th>
                  <th>Tipo</th><th>Limite</th><th>Balance</th><th>Estado</th><th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span className="badge badge-blue" style={{ marginRight: 6 }}>{c.tipo_documento}</span>
                      <span style={{ fontFamily: "monospace", fontSize: 12 }}>{c.numero_documento}</span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{c.nombre}</td>
                    <td>{c.telefono || "—"}</td>
                    <td><span className={`badge ${c.tipo_cliente === "CREDITO" ? "badge-yellow" : "badge-green"}`}>{c.tipo_cliente}</span></td>
                    <td>{formatCurrency(c.limite_credito)}</td>
                    <td>
                      <span className={`badge ${Number(c.balance) > 0 ? "badge-yellow" : "badge-green"}`}>
                        {formatCurrency(c.balance)}
                      </span>
                      {c.tipo_cliente === "CREDITO" && c.balance > c.limite_credito && c.limite_credito > 0 && (
                        <span className="credit-warn"> EXCEDE</span>
                      )}
                    </td>
                    <td><span className={`badge ${c.activo ? "badge-green" : "badge-red"}`}>{c.activo ? "Activo" : "Inactivo"}</span></td>
                    <td>
                      <button className="action-btn" onClick={() => abrirEditar(c)}>Editar</button>
                      {isAdmin && <button className="action-btn del" onClick={() => desactivarCliente(c.id)}>Desactivar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <div className="page-info">
                Mostrando {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} de {pagination.total}
              </div>
              <div className="page-btns">
                <button className="page-btn" onClick={pagination.prevPage} disabled={!pagination.canPrev}>Anterior</button>
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  const startPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                  const p = startPage + i;
                  if (p > pagination.totalPages) return null;
                  return (
                    <button key={p} className={`page-btn ${p === pagination.page ? "active" : ""}`} onClick={() => pagination.setPage(p)}>{p}</button>
                  );
                })}
                <button className="page-btn" onClick={pagination.nextPage} disabled={!pagination.canNext}>Siguiente</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editando ? "Editar Cliente" : "Nuevo Cliente"}</h2>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="form-grid">
                {serverError && <div className="server-error">{serverError}</div>}

                <div className="form-group full">
                  <label className="form-label">Nombre *</label>
                  <input className={`form-input ${errors.nombre ? "error" : ""}`} placeholder="Nombre completo o razon social" {...register("nombre")} maxLength={200} />
                  {errors.nombre && <span className="field-error">{errors.nombre.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo Documento</label>
                  <select className="form-input" {...register("tipo_documento")}>
                    <option value="CEDULA">Cedula</option>
                    <option value="RNC">RNC</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">No. Documento *</label>
                  <input className={`form-input ${errors.numero_documento ? "error" : ""}`} placeholder="000-0000000-0" {...register("numero_documento")} maxLength={20} />
                  {errors.numero_documento && <span className="field-error">{errors.numero_documento.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Telefono</label>
                  <input className={`form-input ${errors.telefono ? "error" : ""}`} placeholder="809-000-0000" {...register("telefono")} maxLength={20} />
                  {errors.telefono && <span className="field-error">{errors.telefono.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className={`form-input ${errors.email ? "error" : ""}`} type="email" placeholder="correo@ejemplo.com" {...register("email")} />
                  {errors.email && <span className="field-error">{errors.email.message}</span>}
                </div>

                <div className="form-group full">
                  <label className="form-label">Direccion</label>
                  <input className={`form-input ${errors.direccion ? "error" : ""}`} placeholder="Direccion completa" {...register("direccion")} />
                  {errors.direccion && <span className="field-error">{errors.direccion.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo de Cliente</label>
                  <select className="form-input" {...register("tipo_cliente")}>
                    <option value="FINAL">Consumidor Final</option>
                    <option value="CREDITO">Credito</option>
                    <option value="GUBERNAMENTAL">Gubernamental</option>
                    <option value="ESPECIAL">Especial</option>
                  </select>
                </div>

                {tipoCliente === "CREDITO" && (
                  <div className="form-group">
                    <label className="form-label">Limite de Credito (RD$)</label>
                    <input
                      className={`form-input ${errors.limite_credito ? "error" : ""}`}
                      type="number" step="0.01" min="0" placeholder="0.00"
                      {...register("limite_credito")}
                      disabled={!canEditCredit}
                    />
                    {!canEditCredit && <span className="field-error">No tiene permisos para editar limites de credito</span>}
                    {errors.limite_credito && <span className="field-error">{errors.limite_credito.message}</span>}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? "Guardando..." : editando ? "Guardar cambios" : "Crear cliente"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
