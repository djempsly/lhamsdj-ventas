'use client';
import { useState, useEffect, use, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clienteService } from '@/services/clientes';
import { ventaService } from '@/services/ventas';
import { cxcService } from '@/services/cxc-cxp';
import { clienteSchema } from '@/lib/validations/cliente';
import { formatCurrency, formatDate } from '@/lib/constants';
import { usePermissions } from '@/hooks/usePermissions';
import { useI18n } from '@/i18n';

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
  fecha_creacion?: string;
}

interface Venta {
  id: number;
  numero_factura?: string;
  fecha: string;
  total: number;
  estado: string;
  tipo_pago: string;
}

interface CuentaCobrar {
  id: number;
  factura?: string;
  monto_original: number;
  saldo_pendiente: number;
  fecha_vencimiento: string;
  estado: string;
  dias_vencida?: number;
}

const TAB_KEYS = ['Info', 'Facturas', 'CxC', 'Historial'] as const;

const TEMA_DEFAULT = {
  bg: '#03080f', card: 'rgba(255,255,255,0.02)',
  borde: 'rgba(255,255,255,0.05)', texto: '#e2eaf5',
  subtexto: '#475569', accent: '#0ea5e9', secondary: '#1d4ed8',
};

export default function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const i18n = useI18n();
  const { canEditCredit, isAdmin } = usePermissions();

  const [activeTab, setActiveTab] = useState<typeof TAB_KEYS[number]>('Info');
  const [cliente, setCliente] = useState<Cliente | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState('');

  // Tab data
  const [ventas, setVentas] = useState<Venta[]>([]);
  const [ventasLoading, setVentasLoading] = useState(false);
  const [cxc, setCxc] = useState<CuentaCobrar[]>([]);
  const [cxcLoading, setCxcLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      nombre: '', tipo_documento: 'CEDULA' as const, numero_documento: '',
      telefono: '', email: '', direccion: '', tipo_cliente: 'FINAL' as const,
      limite_credito: 0,
    },
  });

  const esClaro = tema.texto === '#0f172a';

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem('tema');
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
  }, []);

  const cargarCliente = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await clienteService.getById(id);
      setCliente(data as Cliente);
      const c = data as Cliente;
      reset({
        nombre: c.nombre,
        tipo_documento: c.tipo_documento as 'CEDULA' | 'RNC' | 'PASAPORTE' | 'OTRO',
        numero_documento: c.numero_documento,
        telefono: c.telefono || '',
        email: c.email || '',
        direccion: c.direccion || '',
        tipo_cliente: c.tipo_cliente as 'FINAL' | 'CREDITO' | 'GUBERNAMENTAL' | 'ESPECIAL',
        limite_credito: c.limite_credito,
      });
    } catch {
      // redirect on error
    }
    setLoading(false);
  }, [id, reset]);

  useEffect(() => {
    if (mounted) cargarCliente();
  }, [mounted, cargarCliente]);

  const cargarFacturas = useCallback(async () => {
    setVentasLoading(true);
    try {
      const { data } = await ventaService.getAll({ cliente: id });
      const response = data as { results?: Venta[] };
      setVentas(response.results || (Array.isArray(data) ? (data as Venta[]) : []));
    } catch { /* error */ }
    setVentasLoading(false);
  }, [id]);

  const cargarCxc = useCallback(async () => {
    setCxcLoading(true);
    try {
      const { data } = await cxcService.getAll();
      const all = (data as { results?: CuentaCobrar[] }).results || (Array.isArray(data) ? (data as CuentaCobrar[]) : []);
      // Filter by client if API doesn't support param
      setCxc(all);
    } catch { /* error */ }
    setCxcLoading(false);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (activeTab === 'Facturas' && ventas.length === 0 && !ventasLoading) cargarFacturas();
    if (activeTab === 'CxC' && cxc.length === 0 && !cxcLoading) cargarCxc();
  }, [activeTab, mounted, cargarFacturas, cargarCxc, ventas.length, cxc.length, ventasLoading, cxcLoading]);

  const onSubmit = async (formData: Record<string, unknown>) => {
    setServerError('');
    setSaving(true);
    try {
      const payload = { ...formData, limite_credito: Number(formData.limite_credito) || 0 };
      await clienteService.actualizar(Number(id), payload);
      setEditing(false);
      cargarCliente();
    } catch (err: unknown) {
      const e = err as { response?: { data?: Record<string, unknown> } };
      if (e?.response?.data) {
        const msg = Object.values(e.response.data).flat().join('. ');
        setServerError(String(msg).substring(0, 200));
      } else {
        setServerError(i18n.clients.connectionError);
      }
    } finally {
      setSaving(false);
    }
  };

  const TABS_LABELS: Record<typeof TAB_KEYS[number], string> = {
    Info: i18n.clients.info,
    Facturas: i18n.clients.invoices,
    CxC: i18n.clients.receivables,
    Historial: i18n.clients.history,
  };

  if (!mounted) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        .detail-page { min-height:100vh; background:${tema.bg}; color:${tema.texto}; padding:32px; font-family:'DM Sans',sans-serif; }
        .detail-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:28px; flex-wrap:wrap; gap:16px; }
        .back-btn { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:8px 16px; color:${tema.subtexto}; font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .back-btn:hover { border-color:${tema.accent}40; color:${tema.accent}; }
        .detail-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; }
        .detail-title span { color:${tema.accent}; }
        .tabs-row { display:flex; gap:4px; margin-bottom:24px; background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:4px; }
        .tab-btn { background:none; border:none; border-radius:8px; padding:10px 20px; font-size:13px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; color:${tema.subtexto}; }
        .tab-btn:hover { color:${tema.texto}; }
        .tab-btn.active { background:${tema.accent}; color:white; }
        .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
        .info-card { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; padding:24px; box-shadow:${esClaro ? '0 2px 12px rgba(0,0,0,0.06)' : 'none'}; }
        .info-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
        .info-value { font-size:16px; font-weight:500; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:140px; box-shadow:${esClaro ? '0 2px 8px rgba(0,0,0,0.06)' : 'none'}; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; box-shadow:${esClaro ? '0 4px 16px rgba(0,0,0,0.07)' : 'none'}; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)'}; }
        th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; }
        td { padding:14px 16px; font-size:14px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)'}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px ${tema.accent}40; }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .btn-outline { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 16px; color:${tema.subtexto}; font-size:13px; cursor:pointer; transition:all 0.2s; font-family:'DM Sans',sans-serif; white-space:nowrap; }
        .btn-outline:hover { border-color:${tema.accent}40; color:${tema.accent}; }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input { background:${esClaro ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.04)'}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; transition:all 0.2s; }
        .form-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .form-input.error { border-color:rgba(239,68,68,0.5); }
        .field-error { font-size:12px; color:#fca5a5; margin-top:2px; }
        .server-error { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; grid-column:1/-1; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .edit-actions { display:flex; gap:10px; margin-top:24px; justify-content:flex-end; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.2s; }
        .btn-cancel:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        @keyframes pulse { 0%,100%{opacity:0.4} 50%{opacity:0.7} }
        .skeleton { background:${tema.borde}; border-radius:6px; animation:pulse 1.5s ease-in-out infinite; }
        .history-item { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; margin-bottom:12px; display:flex; align-items:center; gap:16px; }
        .history-dot { width:10px; height:10px; border-radius:50%; background:${tema.accent}; flex-shrink:0; }
        .history-text { flex:1; }
        .history-date { font-size:12px; color:${tema.subtexto}; }
        @media (max-width: 768px) {
          .detail-page { padding:16px; }
          .info-grid { grid-template-columns:1fr; }
          .form-grid { grid-template-columns:1fr; }
          .stats-row { flex-direction:column; }
          .tabs-row { overflow-x:auto; }
        }
      `}</style>

      <div className="detail-page">
        <div className="detail-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button className="back-btn" onClick={() => router.push('/dashboard/clientes')}>
              {i18n.nav.back}
            </button>
            <h1 className="detail-title">
              <span>{cliente?.nombre || i18n.common.loading}</span>
            </h1>
            {cliente && (
              <span className={`badge ${cliente.activo ? 'badge-green' : 'badge-red'}`}>
                {cliente.activo ? i18n.clients.active : i18n.clients.inactive}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {activeTab === 'Info' && !editing && (
              <button className="btn-primary" onClick={() => setEditing(true)}>{i18n.common.edit}</button>
            )}
          </div>
        </div>

        {cliente && (
          <div className="stats-row">
            <div className="mini-stat">
              <div className="mini-stat-val">{cliente.tipo_cliente}</div>
              <div className="mini-stat-label">{i18n.clients.clientType}</div>
            </div>
            <div className="mini-stat">
              <div className="mini-stat-val">{formatCurrency(cliente.limite_credito)}</div>
              <div className="mini-stat-label">{i18n.clients.creditLimit}</div>
            </div>
            <div className="mini-stat">
              <div className="mini-stat-val" style={{ color: cliente.balance > 0 ? '#f59e0b' : '#10b981' }}>
                {formatCurrency(cliente.balance)}
              </div>
              <div className="mini-stat-label">{i18n.common.currentBalance}</div>
            </div>
            <div className="mini-stat">
              <div className="mini-stat-val">{cliente.tipo_documento}</div>
              <div className="mini-stat-label">{cliente.numero_documento}</div>
            </div>
          </div>
        )}

        <div className="tabs-row">
          {TAB_KEYS.map((tab) => (
            <button
              key={tab}
              className={`tab-btn ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {TABS_LABELS[tab]}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="info-grid">
            {[1, 2, 3, 4].map((i) => (
              <div className="info-card" key={i}>
                <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 8 }} />
                <div className="skeleton" style={{ height: 20, width: '70%' }} />
              </div>
            ))}
          </div>
        ) : !cliente ? (
          <div className="empty-state">
            <p>{i18n.common.clientNotFound}</p>
            <button className="btn-outline" onClick={() => router.push('/dashboard/clientes')} style={{ marginTop: 16 }}>
              {i18n.common.backToClients}
            </button>
          </div>
        ) : (
          <>
            {/* Info Tab */}
            {activeTab === 'Info' && !editing && (
              <div className="info-grid">
                <div className="info-card">
                  <div className="info-label">{i18n.clients.name}</div>
                  <div className="info-value">{cliente.nombre}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.clients.document}</div>
                  <div className="info-value">
                    <span className="badge badge-blue" style={{ marginRight: 8 }}>{cliente.tipo_documento}</span>
                    {cliente.numero_documento}
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.clients.phone}</div>
                  <div className="info-value">{cliente.telefono || '---'}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.clients.email}</div>
                  <div className="info-value">{cliente.email || '---'}</div>
                </div>
                <div className="info-card" style={{ gridColumn: '1 / -1' }}>
                  <div className="info-label">{i18n.clients.address}</div>
                  <div className="info-value">{cliente.direccion || '---'}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.clients.clientType}</div>
                  <div className="info-value">
                    <span className={`badge ${cliente.tipo_cliente === 'CREDITO' ? 'badge-yellow' : 'badge-green'}`}>
                      {cliente.tipo_cliente}
                    </span>
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.clients.creditLimit}</div>
                  <div className="info-value">{formatCurrency(cliente.limite_credito)}</div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.clients.balance}</div>
                  <div className="info-value" style={{ color: cliente.balance > 0 ? '#f59e0b' : '#10b981' }}>
                    {formatCurrency(cliente.balance)}
                  </div>
                </div>
                <div className="info-card">
                  <div className="info-label">{i18n.common.status}</div>
                  <div className="info-value">
                    <span className={`badge ${cliente.activo ? 'badge-green' : 'badge-red'}`}>
                      {cliente.activo ? i18n.clients.active : i18n.clients.inactive}
                    </span>
                  </div>
                </div>
                {cliente.fecha_creacion && (
                  <div className="info-card">
                    <div className="info-label">{i18n.common.creationDate}</div>
                    <div className="info-value">{formatDate(cliente.fecha_creacion)}</div>
                  </div>
                )}
              </div>
            )}

            {/* Info Tab - Edit Mode */}
            {activeTab === 'Info' && editing && (
              <div className="info-card" style={{ gridColumn: '1 / -1' }}>
                <form onSubmit={handleSubmit(onSubmit)}>
                  <div className="form-grid">
                    {serverError && <div className="server-error">{serverError}</div>}

                    <div className="form-group full">
                      <label className="form-label">{i18n.clients.name} *</label>
                      <input className={`form-input ${errors.nombre ? 'error' : ''}`} placeholder="Nombre completo" {...register('nombre')} maxLength={200} />
                      {errors.nombre && <span className="field-error">{errors.nombre.message}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">{i18n.clients.documentType}</label>
                      <select className="form-input" {...register('tipo_documento')}>
                        <option value="CEDULA">Cedula</option>
                        <option value="RNC">RNC</option>
                        <option value="PASAPORTE">Pasaporte</option>
                        <option value="OTRO">Otro</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">{i18n.clients.documentNumber} *</label>
                      <input className={`form-input ${errors.numero_documento ? 'error' : ''}`} {...register('numero_documento')} maxLength={20} />
                      {errors.numero_documento && <span className="field-error">{errors.numero_documento.message}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">{i18n.clients.phone}</label>
                      <input className={`form-input ${errors.telefono ? 'error' : ''}`} {...register('telefono')} maxLength={20} />
                      {errors.telefono && <span className="field-error">{errors.telefono.message}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">{i18n.clients.email}</label>
                      <input className={`form-input ${errors.email ? 'error' : ''}`} type="email" {...register('email')} />
                      {errors.email && <span className="field-error">{errors.email.message}</span>}
                    </div>

                    <div className="form-group full">
                      <label className="form-label">{i18n.clients.address}</label>
                      <input className={`form-input ${errors.direccion ? 'error' : ''}`} {...register('direccion')} />
                      {errors.direccion && <span className="field-error">{errors.direccion.message}</span>}
                    </div>

                    <div className="form-group">
                      <label className="form-label">{i18n.clients.clientType}</label>
                      <select className="form-input" {...register('tipo_cliente')}>
                        <option value="FINAL">{i18n.clients.finalConsumer}</option>
                        <option value="CREDITO">{i18n.clients.credit}</option>
                        <option value="GUBERNAMENTAL">{i18n.clients.governmental}</option>
                        <option value="ESPECIAL">{i18n.clients.special}</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">{i18n.clients.creditLimit} (RD$)</label>
                      <input
                        className={`form-input ${errors.limite_credito ? 'error' : ''}`}
                        type="number" step="0.01" min="0" placeholder="0.00"
                        {...register('limite_credito')}
                        disabled={!canEditCredit}
                      />
                      {!canEditCredit && <span className="field-error">{i18n.clients.noCreditPermission}</span>}
                      {errors.limite_credito && <span className="field-error">{errors.limite_credito.message}</span>}
                    </div>
                  </div>

                  <div className="edit-actions">
                    <button type="button" className="btn-cancel" onClick={() => { setEditing(false); setServerError(''); cargarCliente(); }}>
                      {i18n.common.cancel}
                    </button>
                    <button type="submit" className="btn-primary" disabled={saving}>
                      {saving ? i18n.clients.saving : i18n.clients.saveChanges}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Facturas Tab */}
            {activeTab === 'Facturas' && (
              ventasLoading ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>{i18n.common.invoice}</th><th>{i18n.common.date}</th><th>{i18n.common.total}</th><th>{i18n.common.status}</th><th>{i18n.sales.paymentType}</th></tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j}><div className="skeleton" style={{ height: 16, width: '70%' }} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : ventas.length === 0 ? (
                <div className="empty-state"><p>{i18n.clients.noInvoices}</p></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{i18n.common.invoice}</th>
                        <th>{i18n.common.date}</th>
                        <th>{i18n.common.total}</th>
                        <th>{i18n.common.status}</th>
                        <th>{i18n.sales.paymentType}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ventas.map((v) => (
                        <tr key={v.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {v.numero_factura || `#${v.id}`}
                          </td>
                          <td>{formatDate(v.fecha)}</td>
                          <td style={{ fontWeight: 600 }}>{formatCurrency(v.total)}</td>
                          <td>
                            <span className={`badge ${
                              v.estado === 'COMPLETADA' ? 'badge-green' :
                              v.estado === 'ANULADA' ? 'badge-red' : 'badge-yellow'
                            }`}>
                              {v.estado}
                            </span>
                          </td>
                          <td>{v.tipo_pago}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* CxC Tab */}
            {activeTab === 'CxC' && (
              cxcLoading ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr><th>{i18n.common.invoice}</th><th>{i18n.common.originalAmount}</th><th>{i18n.common.pendingBalance}</th><th>{i18n.common.dueDate}</th><th>{i18n.common.status}</th></tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 5 }).map((_, j) => (
                            <td key={j}><div className="skeleton" style={{ height: 16, width: '70%' }} /></td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : cxc.length === 0 ? (
                <div className="empty-state"><p>{i18n.clients.noReceivables}</p></div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>{i18n.common.invoice}</th>
                        <th>{i18n.common.originalAmount}</th>
                        <th>{i18n.common.pendingBalance}</th>
                        <th>{i18n.common.dueDate}</th>
                        <th>{i18n.common.status}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cxc.map((c) => (
                        <tr key={c.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                            {c.factura || `#${c.id}`}
                          </td>
                          <td>{formatCurrency(c.monto_original)}</td>
                          <td style={{ fontWeight: 600, color: c.saldo_pendiente > 0 ? '#f59e0b' : '#10b981' }}>
                            {formatCurrency(c.saldo_pendiente)}
                          </td>
                          <td>{formatDate(c.fecha_vencimiento)}</td>
                          <td>
                            <span className={`badge ${
                              c.estado === 'PAGADA' ? 'badge-green' :
                              c.estado === 'VENCIDA' ? 'badge-red' : 'badge-yellow'
                            }`}>
                              {c.estado}
                            </span>
                            {c.dias_vencida && c.dias_vencida > 0 && (
                              <span style={{ fontSize: 11, color: '#ef4444', marginLeft: 6 }}>
                                {c.dias_vencida}d vencida
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}

            {/* Historial Tab */}
            {activeTab === 'Historial' && (
              <div>
                {cliente.fecha_creacion && (
                  <div className="history-item">
                    <div className="history-dot" />
                    <div className="history-text">
                      <div style={{ fontWeight: 500 }}>{i18n.common.clientCreated}</div>
                      <div className="history-date">{formatDate(cliente.fecha_creacion)}</div>
                    </div>
                  </div>
                )}
                {ventas.length > 0 && ventas.slice(0, 10).map((v) => (
                  <div className="history-item" key={`h-v-${v.id}`}>
                    <div className="history-dot" style={{ background: v.estado === 'ANULADA' ? '#ef4444' : tema.accent }} />
                    <div className="history-text">
                      <div style={{ fontWeight: 500 }}>
                        Factura {v.numero_factura || `#${v.id}`} - {formatCurrency(v.total)}
                      </div>
                      <div className="history-date">{formatDate(v.fecha)}</div>
                    </div>
                    <span className={`badge ${v.estado === 'COMPLETADA' ? 'badge-green' : v.estado === 'ANULADA' ? 'badge-red' : 'badge-yellow'}`}>
                      {v.estado}
                    </span>
                  </div>
                ))}
                {!cliente.fecha_creacion && ventas.length === 0 && (
                  <div className="empty-state"><p>{i18n.clients.noHistory}</p></div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
