"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { z } from "zod";
import { clienteService } from "@/services/clientes";
import { clienteSchema } from "@/lib/validations/cliente";
import { useDebounce } from "@/hooks/useDebounce";
import { usePagination } from "@/hooks/usePagination";
import { usePermissions } from "@/hooks/usePermissions";
import { formatCurrency } from "@/lib/constants";
import { useI18n } from "@/i18n";

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

const csvRowSchema = z.object({
  nombre: z.string().min(2, "Nombre debe tener al menos 2 caracteres"),
  tipo_documento: z.enum(["CEDULA", "RNC", "PASAPORTE", "OTRO"]).default("CEDULA"),
  numero_documento: z.string().min(1, "Numero de documento requerido"),
  telefono: z.string().optional().default(""),
  email: z.string().email("Email invalido").optional().or(z.literal("")).default(""),
  direccion: z.string().optional().default(""),
  tipo_cliente: z.enum(["FINAL", "CREDITO", "GUBERNAMENTAL", "ESPECIAL"]).default("FINAL"),
  limite_credito: z.coerce.number().min(0).default(0),
});

interface CsvParsedRow {
  rowIndex: number;
  data: Record<string, unknown>;
  valid: boolean;
  errors: string[];
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function ClientesPage() {
  const i18n = useI18n();
  const router = useRouter();
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

  // CSV Import state
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvData, setCsvData] = useState<CsvParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<{ imported: number; failed: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setServerError(i18n.clients.connectionError);
      }
    } finally {
      setSaving(false);
    }
  };

  const desactivarCliente = async (id: number) => {
    if (!confirm(i18n.clients.confirmDeactivate)) return;
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

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportResults(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed: CsvParsedRow[] = (results.data as Record<string, unknown>[]).map((row, i) => {
          const result = csvRowSchema.safeParse(row);
          if (result.success) {
            return { rowIndex: i + 1, data: result.data as Record<string, unknown>, valid: true, errors: [] };
          } else {
            const errMsgs = result.error.issues.map((iss) => `${iss.path.join(".")}: ${iss.message}`);
            return { rowIndex: i + 1, data: row, valid: false, errors: errMsgs };
          }
        });
        setCsvData(parsed);
      },
      error: () => {
        setCsvData([]);
      },
    });
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const importarValidos = async () => {
    const validos = csvData.filter((r) => r.valid);
    if (validos.length === 0) return;
    setImporting(true);
    let imported = 0;
    let failed = 0;
    for (const row of validos) {
      try {
        await clienteService.crear(row.data);
        imported++;
      } catch {
        failed++;
      }
    }
    setImportResults({ imported, failed });
    setImporting(false);
    if (imported > 0) cargarDatos();
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setCsvData([]);
    setImportResults(null);
  };

  const csvValidCount = csvData.filter((r) => r.valid).length;
  const csvInvalidCount = csvData.filter((r) => !r.valid).length;

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
            <h1 className="page-title"><span>{i18n.clients.title}</span></h1>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-outline" onClick={() => setShowImportModal(true)}>{i18n.clients.importCsv}</button>
            <button className="btn-outline" onClick={exportarCSV}>{i18n.clients.exportCsv}</button>
            <button className="btn-primary" onClick={abrirNuevo}>+ {i18n.clients.newClient}</button>
          </div>
        </div>

        <div className="stats-row">
          {[
            { val: pagination.total, label: i18n.clients.totalClients },
            { val: conBalance, label: i18n.clients.withBalance },
            { val: formatCurrency(totalCartera), label: i18n.clients.totalPortfolio },
            { val: clientesCredito, label: i18n.clients.creditClients },
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
            placeholder={i18n.clients.searchPlaceholder}
            value={busqueda}
            onChange={e => setBusqueda(e.target.value.substring(0, 100))}
            maxLength={100}
          />
          <select className="filter-select" value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}>
            <option value="">{i18n.clients.allTypes}</option>
            <option value="FINAL">{i18n.clients.finalConsumer}</option>
            <option value="CREDITO">{i18n.clients.credit}</option>
            <option value="GUBERNAMENTAL">{i18n.clients.governmental}</option>
            <option value="ESPECIAL">{i18n.clients.special}</option>
          </select>
          <select className="filter-select" value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)}>
            <option value="">{i18n.clients.allStatus}</option>
            <option value="true">{i18n.clients.activeOnly}</option>
            <option value="false">{i18n.clients.inactiveOnly}</option>
          </select>
        </div>

        {loading ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{i18n.clients.document}</th><th>{i18n.clients.name}</th><th>{i18n.clients.phone}</th><th>{i18n.clients.clientType}</th><th>{i18n.clients.creditLimit}</th><th>{i18n.clients.balance}</th><th>{i18n.common.status}</th><th>{i18n.common.actions}</th>
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
          <div className="empty-state"><p>{debouncedSearch ? i18n.clients.noClientsSearch : i18n.clients.noClientsEmpty}</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{i18n.clients.document}</th><th>{i18n.clients.name}</th><th>{i18n.clients.phone}</th>
                  <th>{i18n.clients.clientType}</th><th>{i18n.clients.creditLimit}</th><th>{i18n.clients.balance}</th><th>{i18n.common.status}</th><th>{i18n.common.actions}</th>
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
                        <span className="credit-warn"> {i18n.clients.exceeds}</span>
                      )}
                    </td>
                    <td><span className={`badge ${c.activo ? "badge-green" : "badge-red"}`}>{c.activo ? i18n.clients.active : i18n.clients.inactive}</span></td>
                    <td>
                      <button className="action-btn" onClick={() => router.push(`/dashboard/clientes/${c.id}`)}>{i18n.common.view}</button>
                      <button className="action-btn" onClick={() => abrirEditar(c)}>{i18n.common.edit}</button>
                      {isAdmin && <button className="action-btn del" onClick={() => desactivarCliente(c.id)}>{i18n.clients.deactivate}</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="pagination">
              <div className="page-info">
                {i18n.common.showing} {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} {i18n.common.of} {pagination.total}
              </div>
              <div className="page-btns">
                <button className="page-btn" onClick={pagination.prevPage} disabled={!pagination.canPrev}>{i18n.common.previous}</button>
                {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
                  const startPage = Math.max(1, Math.min(pagination.page - 2, pagination.totalPages - 4));
                  const p = startPage + i;
                  if (p > pagination.totalPages) return null;
                  return (
                    <button key={p} className={`page-btn ${p === pagination.page ? "active" : ""}`} onClick={() => pagination.setPage(p)}>{p}</button>
                  );
                })}
                <button className="page-btn" onClick={pagination.nextPage} disabled={!pagination.canNext}>{i18n.common.next}</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2 className="modal-title">{editando ? i18n.clients.editClient : i18n.clients.newClient}</h2>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="form-grid">
                {serverError && <div className="server-error">{serverError}</div>}

                <div className="form-group full">
                  <label className="form-label">{i18n.clients.name} *</label>
                  <input className={`form-input ${errors.nombre ? "error" : ""}`} placeholder={i18n.clients.name} {...register("nombre")} maxLength={200} />
                  {errors.nombre && <span className="field-error">{errors.nombre.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">{i18n.clients.documentType}</label>
                  <select className="form-input" {...register("tipo_documento")}>
                    <option value="CEDULA">Cedula</option>
                    <option value="RNC">RNC</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="OTRO">Otro</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">{i18n.clients.documentNumber} *</label>
                  <input className={`form-input ${errors.numero_documento ? "error" : ""}`} placeholder="000-0000000-0" {...register("numero_documento")} maxLength={20} />
                  {errors.numero_documento && <span className="field-error">{errors.numero_documento.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">{i18n.clients.phone}</label>
                  <input className={`form-input ${errors.telefono ? "error" : ""}`} placeholder="809-000-0000" {...register("telefono")} maxLength={20} />
                  {errors.telefono && <span className="field-error">{errors.telefono.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">{i18n.clients.email}</label>
                  <input className={`form-input ${errors.email ? "error" : ""}`} type="email" placeholder="correo@ejemplo.com" {...register("email")} />
                  {errors.email && <span className="field-error">{errors.email.message}</span>}
                </div>

                <div className="form-group full">
                  <label className="form-label">{i18n.clients.address}</label>
                  <input className={`form-input ${errors.direccion ? "error" : ""}`} placeholder="Direccion completa" {...register("direccion")} />
                  {errors.direccion && <span className="field-error">{errors.direccion.message}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">{i18n.clients.clientType}</label>
                  <select className="form-input" {...register("tipo_cliente")}>
                    <option value="FINAL">{i18n.clients.finalConsumer}</option>
                    <option value="CREDITO">{i18n.clients.credit}</option>
                    <option value="GUBERNAMENTAL">{i18n.clients.governmental}</option>
                    <option value="ESPECIAL">{i18n.clients.special}</option>
                  </select>
                </div>

                {tipoCliente === "CREDITO" && (
                  <div className="form-group">
                    <label className="form-label">{i18n.clients.creditLimit} (RD$)</label>
                    <input
                      className={`form-input ${errors.limite_credito ? "error" : ""}`}
                      type="number" step="0.01" min="0" placeholder="0.00"
                      {...register("limite_credito")}
                      disabled={!canEditCredit}
                    />
                    {!canEditCredit && <span className="field-error">{i18n.clients.noCreditPermission}</span>}
                    {errors.limite_credito && <span className="field-error">{errors.limite_credito.message}</span>}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowModal(false)}>{i18n.common.cancel}</button>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? i18n.clients.saving : editando ? i18n.clients.saveChanges : i18n.clients.createClient}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && closeImportModal()}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <h2 className="modal-title">{i18n.clients.importTitle}</h2>
            <p style={{ fontSize: 13, color: tema.subtexto, marginBottom: 20 }}>
              {i18n.clients.importDescription}
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleCsvFile}
              style={{ display: "none" }}
            />
            <button
              className="btn-outline"
              onClick={() => fileInputRef.current?.click()}
              style={{ marginBottom: 20 }}
            >
              {i18n.clients.selectFile}
            </button>

            {csvData.length > 0 && !importResults && (
              <>
                <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                  <div style={{
                    background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.18)",
                    borderRadius: 10, padding: "10px 16px", flex: 1, textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "#10b981" }}>{csvValidCount}</div>
                    <div style={{ fontSize: 12, color: "#10b981" }}>{i18n.clients.validRows}</div>
                  </div>
                  <div style={{
                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)",
                    borderRadius: 10, padding: "10px 16px", flex: 1, textAlign: "center",
                  }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 20, color: "#ef4444" }}>{csvInvalidCount}</div>
                    <div style={{ fontSize: 12, color: "#ef4444" }}>{i18n.clients.invalidRows}</div>
                  </div>
                </div>

                <div style={{ maxHeight: 300, overflowY: "auto", marginBottom: 20 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>{i18n.clients.row}</th>
                        <th>{i18n.clients.name}</th>
                        <th>{i18n.clients.document}</th>
                        <th>{i18n.clients.clientType}</th>
                        <th>{i18n.common.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 50).map((row) => (
                        <tr key={row.rowIndex}>
                          <td>{row.rowIndex}</td>
                          <td>{String(row.data.nombre || "")}</td>
                          <td>{String(row.data.numero_documento || "")}</td>
                          <td>{String(row.data.tipo_cliente || "")}</td>
                          <td>
                            {row.valid ? (
                              <span className="badge badge-green">{i18n.clients.valid}</span>
                            ) : (
                              <span className="badge badge-red" title={row.errors.join("; ")}>
                                {i18n.clients.invalid}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {csvData.length > 50 && (
                    <p style={{ fontSize: 12, color: tema.subtexto, textAlign: "center", marginTop: 8 }}>
                      Mostrando 50 de {csvData.length} filas
                    </p>
                  )}
                </div>
              </>
            )}

            {importResults && (
              <div style={{
                background: tema.card, border: `1px solid ${tema.borde}`,
                borderRadius: 12, padding: 20, marginBottom: 20,
              }}>
                <h3 style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 16, marginBottom: 12 }}>
                  {i18n.clients.importResults}
                </h3>
                <div style={{ display: "flex", gap: 16 }}>
                  <div style={{ textAlign: "center", flex: 1 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: "#10b981" }}>
                      {importResults.imported}
                    </div>
                    <div style={{ fontSize: 12, color: "#10b981" }}>{i18n.clients.imported}</div>
                  </div>
                  <div style={{ textAlign: "center", flex: 1 }}>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontWeight: 800, fontSize: 24, color: "#ef4444" }}>
                      {importResults.failed}
                    </div>
                    <div style={{ fontSize: 12, color: "#ef4444" }}>{i18n.clients.failed}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button type="button" className="btn-cancel" onClick={closeImportModal}>{i18n.common.close}</button>
              {csvData.length > 0 && !importResults && (
                <button
                  className="btn-primary"
                  onClick={importarValidos}
                  disabled={importing || csvValidCount === 0}
                >
                  {importing ? i18n.clients.importing : `${i18n.clients.importValid} ${csvValidCount}`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
