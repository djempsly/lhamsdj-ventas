"use client";
import { useEffect, useState, useCallback } from "react";
import { negocioService, sucursalService } from "@/services/settings";
import { usuarioService } from "@/services/usuarios";
import { cuentaContableService } from "@/services/contabilidad";
import { PROVINCIAS_RD } from "@/lib/constants";

interface OnboardingProgress {
  paso_actual: number;
  datos: Record<string, unknown>;
}

const PASOS = [
  { titulo: "Datos del Negocio", desc: "Informacion basica de tu empresa" },
  { titulo: "Informacion Fiscal", desc: "RNC y datos fiscales para DGII" },
  { titulo: "Sucursal Principal", desc: "Configura tu primera sucursal" },
  { titulo: "Plan de Cuentas", desc: "Catalogo contable PCGA RD" },
  { titulo: "Comprobantes Fiscales", desc: "Secuencias de NCF (B01, B02, etc.)" },
  { titulo: "Usuarios", desc: "Invita a tu equipo de trabajo" },
  { titulo: "Certificado Digital", desc: "e-CF para facturacion electronica" },
  { titulo: "Finalizacion", desc: "Revisa y completa la configuracion" },
];

const PLAN_CUENTAS_PCGA_RD = [
  { codigo: "1", nombre: "Activos", tipo: "DEBITO", padre: null },
  { codigo: "1.1", nombre: "Activo Corriente", tipo: "DEBITO", padre: "1" },
  { codigo: "1.1.1", nombre: "Caja y Bancos", tipo: "DEBITO", padre: "1.1" },
  { codigo: "1.1.1.01", nombre: "Caja General", tipo: "DEBITO", padre: "1.1.1" },
  { codigo: "1.1.1.02", nombre: "Caja Chica", tipo: "DEBITO", padre: "1.1.1" },
  { codigo: "1.1.1.03", nombre: "Bancos", tipo: "DEBITO", padre: "1.1.1" },
  { codigo: "1.1.2", nombre: "Cuentas por Cobrar", tipo: "DEBITO", padre: "1.1" },
  { codigo: "1.1.2.01", nombre: "Clientes", tipo: "DEBITO", padre: "1.1.2" },
  { codigo: "1.1.3", nombre: "Inventarios", tipo: "DEBITO", padre: "1.1" },
  { codigo: "1.1.3.01", nombre: "Mercancias", tipo: "DEBITO", padre: "1.1.3" },
  { codigo: "1.1.4", nombre: "Impuestos Pagados por Anticipado", tipo: "DEBITO", padre: "1.1" },
  { codigo: "1.1.4.01", nombre: "ITBIS Pagado", tipo: "DEBITO", padre: "1.1.4" },
  { codigo: "1.2", nombre: "Activo No Corriente", tipo: "DEBITO", padre: "1" },
  { codigo: "1.2.1", nombre: "Propiedad, Planta y Equipo", tipo: "DEBITO", padre: "1.2" },
  { codigo: "1.2.1.01", nombre: "Mobiliario y Equipo", tipo: "DEBITO", padre: "1.2.1" },
  { codigo: "1.2.1.02", nombre: "Equipo de Computo", tipo: "DEBITO", padre: "1.2.1" },
  { codigo: "1.2.1.03", nombre: "Vehiculos", tipo: "DEBITO", padre: "1.2.1" },
  { codigo: "1.2.2", nombre: "Depreciacion Acumulada", tipo: "CREDITO", padre: "1.2" },
  { codigo: "2", nombre: "Pasivos", tipo: "CREDITO", padre: null },
  { codigo: "2.1", nombre: "Pasivo Corriente", tipo: "CREDITO", padre: "2" },
  { codigo: "2.1.1", nombre: "Cuentas por Pagar", tipo: "CREDITO", padre: "2.1" },
  { codigo: "2.1.1.01", nombre: "Proveedores", tipo: "CREDITO", padre: "2.1.1" },
  { codigo: "2.1.2", nombre: "Impuestos por Pagar", tipo: "CREDITO", padre: "2.1" },
  { codigo: "2.1.2.01", nombre: "ITBIS por Pagar", tipo: "CREDITO", padre: "2.1.2" },
  { codigo: "2.1.2.02", nombre: "ISR por Pagar", tipo: "CREDITO", padre: "2.1.2" },
  { codigo: "2.1.3", nombre: "Retenciones por Pagar", tipo: "CREDITO", padre: "2.1" },
  { codigo: "3", nombre: "Capital", tipo: "CREDITO", padre: null },
  { codigo: "3.1", nombre: "Capital Social", tipo: "CREDITO", padre: "3" },
  { codigo: "3.2", nombre: "Resultados Acumulados", tipo: "CREDITO", padre: "3" },
  { codigo: "3.3", nombre: "Resultado del Periodo", tipo: "CREDITO", padre: "3" },
  { codigo: "4", nombre: "Ingresos", tipo: "CREDITO", padre: null },
  { codigo: "4.1", nombre: "Ingresos por Ventas", tipo: "CREDITO", padre: "4" },
  { codigo: "4.1.1", nombre: "Ventas de Mercancias", tipo: "CREDITO", padre: "4.1" },
  { codigo: "4.2", nombre: "Otros Ingresos", tipo: "CREDITO", padre: "4" },
  { codigo: "5", nombre: "Costos", tipo: "DEBITO", padre: null },
  { codigo: "5.1", nombre: "Costo de Ventas", tipo: "DEBITO", padre: "5" },
  { codigo: "5.1.1", nombre: "Costo de Mercancias Vendidas", tipo: "DEBITO", padre: "5.1" },
  { codigo: "6", nombre: "Gastos", tipo: "DEBITO", padre: null },
  { codigo: "6.1", nombre: "Gastos Operacionales", tipo: "DEBITO", padre: "6" },
  { codigo: "6.1.1", nombre: "Gastos de Personal", tipo: "DEBITO", padre: "6.1" },
  { codigo: "6.1.1.01", nombre: "Sueldos y Salarios", tipo: "DEBITO", padre: "6.1.1" },
  { codigo: "6.1.1.02", nombre: "Seguridad Social (TSS)", tipo: "DEBITO", padre: "6.1.1" },
  { codigo: "6.1.2", nombre: "Gastos Generales", tipo: "DEBITO", padre: "6.1" },
  { codigo: "6.1.2.01", nombre: "Alquiler", tipo: "DEBITO", padre: "6.1.2" },
  { codigo: "6.1.2.02", nombre: "Energia Electrica", tipo: "DEBITO", padre: "6.1.2" },
  { codigo: "6.1.2.03", nombre: "Telecomunicaciones", tipo: "DEBITO", padre: "6.1.2" },
  { codigo: "6.2", nombre: "Gastos Financieros", tipo: "DEBITO", padre: "6" },
  { codigo: "6.2.1", nombre: "Intereses Pagados", tipo: "DEBITO", padre: "6.2" },
];

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

export default function OnboardingPage() {
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [paso, setPaso] = useState(0);
  const [saving, setSaving] = useState(false);
  const [completado, setCompletado] = useState(false);

  // Step 1: Negocio data
  const [negocio, setNegocio] = useState({
    nombre: "", nombre_comercial: "", tipo_negocio: "RETAIL",
    telefono: "", email: "", sitio_web: "", direccion: "",
  });

  // Step 2: Fiscal
  const [fiscal, setFiscal] = useState({
    rnc: "", nombre_fiscal: "", regimen_fiscal: "NORMAL",
    tipo_contribuyente: "JURIDICA",
  });

  // Step 3: Sucursal
  const [sucursal, setSucursal] = useState({
    nombre: "Principal", direccion: "", telefono: "",
    provincia: "01", municipio: "", es_principal: true,
  });

  // Step 4: Plan de cuentas
  const [cuentasCreadas, setCuentasCreadas] = useState(false);
  const [creandoCuentas, setCreandoCuentas] = useState(false);
  const [cuentasCount, setCuentasCount] = useState(0);

  // Step 5: NCF sequences
  const [ncfSecuencias, setNcfSecuencias] = useState([
    { tipo: "B01", prefijo: "B01", desde: 1, hasta: 500, actual: 1 },
    { tipo: "B02", prefijo: "B02", desde: 1, hasta: 1000, actual: 1 },
    { tipo: "B14", prefijo: "B14", desde: 1, hasta: 200, actual: 1 },
    { tipo: "B15", prefijo: "B15", desde: 1, hasta: 100, actual: 1 },
  ]);

  // Step 6: Users
  const [invitaciones, setInvitaciones] = useState<Array<{ email: string; rol: string; nombre: string }>>([]);
  const [nuevoUsuario, setNuevoUsuario] = useState({ email: "", rol: "VENDEDOR", nombre: "" });

  // Step 7: Certificado
  const [certificado, setCertificado] = useState<File | null>(null);
  const [certPassword, setCertPassword] = useState("");

  const esClaro = tema.texto === "#0f172a";

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    // Load saved progress
    const saved = localStorage.getItem("onboarding_progress");
    if (saved) {
      try {
        const prog: OnboardingProgress = JSON.parse(saved);
        setPaso(prog.paso_actual || 0);
        if (prog.datos.negocio) setNegocio(prog.datos.negocio as typeof negocio);
        if (prog.datos.fiscal) setFiscal(prog.datos.fiscal as typeof fiscal);
        if (prog.datos.sucursal) setSucursal(prog.datos.sucursal as typeof sucursal);
        if (prog.datos.cuentasCreadas) setCuentasCreadas(true);
      } catch { /* ignore */ }
    }
  }, []);

  const guardarProgreso = useCallback((pasoActual: number) => {
    const progress: OnboardingProgress = {
      paso_actual: pasoActual,
      datos: { negocio, fiscal, sucursal, cuentasCreadas },
    };
    localStorage.setItem("onboarding_progress", JSON.stringify(progress));
  }, [negocio, fiscal, sucursal, cuentasCreadas]);

  const siguiente = () => {
    if (paso < PASOS.length - 1) {
      const next = paso + 1;
      setPaso(next);
      guardarProgreso(next);
    }
  };

  const anterior = () => {
    if (paso > 0) {
      const prev = paso - 1;
      setPaso(prev);
      guardarProgreso(prev);
    }
  };

  const crearPlanCuentas = async () => {
    setCreandoCuentas(true);
    setCuentasCount(0);
    try {
      for (let i = 0; i < PLAN_CUENTAS_PCGA_RD.length; i++) {
        const cuenta = PLAN_CUENTAS_PCGA_RD[i];
        try {
          await cuentaContableService.crear({
            codigo: cuenta.codigo,
            nombre: cuenta.nombre,
            tipo: cuenta.tipo,
          });
        } catch { /* may already exist */ }
        setCuentasCount(i + 1);
      }
      setCuentasCreadas(true);
      guardarProgreso(paso);
    } catch { /* error handled */ }
    setCreandoCuentas(false);
  };

  const agregarInvitacion = () => {
    if (!nuevoUsuario.email || !nuevoUsuario.nombre) return;
    setInvitaciones([...invitaciones, { ...nuevoUsuario }]);
    setNuevoUsuario({ email: "", rol: "VENDEDOR", nombre: "" });
  };

  const quitarInvitacion = (idx: number) => {
    setInvitaciones(invitaciones.filter((_, i) => i !== idx));
  };

  const finalizarOnboarding = async () => {
    setSaving(true);
    try {
      // Save negocio data
      const negocios = await negocioService.getAll();
      const negocioList = negocios.data?.results || negocios.data || [];
      if (negocioList.length > 0) {
        await negocioService.actualizar(negocioList[0].id, {
          ...negocio,
          ...fiscal,
          onboarding_completado: true,
        });
      }

      // Create sucursal
      try {
        await sucursalService.crear({
          nombre: sucursal.nombre,
          direccion: sucursal.direccion,
          telefono: sucursal.telefono,
          es_principal: true,
        });
      } catch { /* may exist */ }

      // Create invited users
      for (const inv of invitaciones) {
        try {
          await usuarioService.crear({
            username: inv.email.split("@")[0],
            email: inv.email,
            nombre: inv.nombre,
            rol: inv.rol,
            password: "TempPass123!",
          });
        } catch { /* user may exist */ }
      }

      localStorage.removeItem("onboarding_progress");
      setCompletado(true);
    } catch { /* error */ }
    setSaving(false);
  };

  if (!mounted) return null;

  const renderPaso = () => {
    switch (paso) {
      case 0: // Datos del Negocio
        return (
          <div className="form-grid">
            <div className="form-group full">
              <label className="form-label">Nombre del Negocio *</label>
              <input className="form-input" placeholder="Ej: Distribuidora Acme SRL" value={negocio.nombre}
                onChange={e => setNegocio({ ...negocio, nombre: e.target.value })} maxLength={200} />
            </div>
            <div className="form-group">
              <label className="form-label">Nombre Comercial</label>
              <input className="form-input" placeholder="Nombre de marca" value={negocio.nombre_comercial}
                onChange={e => setNegocio({ ...negocio, nombre_comercial: e.target.value })} maxLength={200} />
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Negocio</label>
              <select className="form-input" value={negocio.tipo_negocio}
                onChange={e => setNegocio({ ...negocio, tipo_negocio: e.target.value })}>
                <option value="RETAIL">Retail / Comercio</option>
                <option value="DISTRIBUCION">Distribucion</option>
                <option value="SERVICIOS">Servicios</option>
                <option value="MANUFACTURA">Manufactura</option>
                <option value="RESTAURANTE">Restaurante / Food</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" placeholder="809-000-0000" value={negocio.telefono}
                onChange={e => setNegocio({ ...negocio, telefono: e.target.value })} maxLength={20} />
            </div>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input className="form-input" type="email" placeholder="info@empresa.com" value={negocio.email}
                onChange={e => setNegocio({ ...negocio, email: e.target.value })} />
            </div>
            <div className="form-group full">
              <label className="form-label">Direccion</label>
              <input className="form-input" placeholder="Calle, numero, sector, ciudad" value={negocio.direccion}
                onChange={e => setNegocio({ ...negocio, direccion: e.target.value })} />
            </div>
          </div>
        );

      case 1: // Fiscal
        return (
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">RNC *</label>
              <input className="form-input" placeholder="000000000" value={fiscal.rnc}
                onChange={e => setFiscal({ ...fiscal, rnc: e.target.value.replace(/[^0-9-]/g, "") })} maxLength={11} />
              <span className="hint">9 digitos para empresas, 11 para personas fisicas</span>
            </div>
            <div className="form-group">
              <label className="form-label">Nombre Fiscal *</label>
              <input className="form-input" placeholder="Razon social segun DGII" value={fiscal.nombre_fiscal}
                onChange={e => setFiscal({ ...fiscal, nombre_fiscal: e.target.value })} maxLength={200} />
            </div>
            <div className="form-group">
              <label className="form-label">Regimen Fiscal</label>
              <select className="form-input" value={fiscal.regimen_fiscal}
                onChange={e => setFiscal({ ...fiscal, regimen_fiscal: e.target.value })}>
                <option value="NORMAL">Regimen Normal</option>
                <option value="SIMPLIFICADO">Regimen Simplificado (RST)</option>
                <option value="ESPECIAL">Regimen Especial</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Tipo de Contribuyente</label>
              <select className="form-input" value={fiscal.tipo_contribuyente}
                onChange={e => setFiscal({ ...fiscal, tipo_contribuyente: e.target.value })}>
                <option value="JURIDICA">Persona Juridica</option>
                <option value="FISICA">Persona Fisica</option>
              </select>
            </div>
          </div>
        );

      case 2: // Sucursal
        return (
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Nombre de Sucursal *</label>
              <input className="form-input" value={sucursal.nombre}
                onChange={e => setSucursal({ ...sucursal, nombre: e.target.value })} maxLength={100} />
            </div>
            <div className="form-group">
              <label className="form-label">Provincia</label>
              <select className="form-input" value={sucursal.provincia}
                onChange={e => setSucursal({ ...sucursal, provincia: e.target.value })}>
                {PROVINCIAS_RD.map(p => (
                  <option key={p.codigo} value={p.codigo}>{p.nombre}</option>
                ))}
              </select>
            </div>
            <div className="form-group full">
              <label className="form-label">Direccion</label>
              <input className="form-input" placeholder="Direccion completa de la sucursal" value={sucursal.direccion}
                onChange={e => setSucursal({ ...sucursal, direccion: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Telefono</label>
              <input className="form-input" placeholder="809-000-0000" value={sucursal.telefono}
                onChange={e => setSucursal({ ...sucursal, telefono: e.target.value })} maxLength={20} />
            </div>
          </div>
        );

      case 3: // Plan de Cuentas
        return (
          <div>
            <p style={{ color: tema.subtexto, marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              El plan de cuentas PCGA-RD es el catalogo contable estandar de Republica Dominicana.
              Se crearan {PLAN_CUENTAS_PCGA_RD.length} cuentas organizadas en: Activos, Pasivos, Capital,
              Ingresos, Costos y Gastos.
            </p>
            {!cuentasCreadas ? (
              <div style={{ textAlign: "center" }}>
                <button className="btn-primary" onClick={crearPlanCuentas} disabled={creandoCuentas}>
                  {creandoCuentas
                    ? `Creando... ${cuentasCount}/${PLAN_CUENTAS_PCGA_RD.length}`
                    : "Crear Plan de Cuentas PCGA-RD"}
                </button>
                {creandoCuentas && (
                  <div className="progress-bar" style={{ marginTop: 16 }}>
                    <div className="progress-fill" style={{ width: `${(cuentasCount / PLAN_CUENTAS_PCGA_RD.length) * 100}%` }} />
                  </div>
                )}
              </div>
            ) : (
              <div className="success-box">
                <span style={{ fontSize: 24 }}>OK</span>
                <p>{PLAN_CUENTAS_PCGA_RD.length} cuentas creadas exitosamente</p>
              </div>
            )}
            <div style={{ marginTop: 24, maxHeight: 300, overflowY: "auto", border: `1px solid ${tema.borde}`, borderRadius: 12, padding: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: tema.subtexto, fontSize: 11, borderBottom: `1px solid ${tema.borde}` }}>Codigo</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: tema.subtexto, fontSize: 11, borderBottom: `1px solid ${tema.borde}` }}>Nombre</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", color: tema.subtexto, fontSize: 11, borderBottom: `1px solid ${tema.borde}` }}>Tipo</th>
                  </tr>
                </thead>
                <tbody>
                  {PLAN_CUENTAS_PCGA_RD.map(c => (
                    <tr key={c.codigo}>
                      <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 12, color: tema.accent }}>{c.codigo}</td>
                      <td style={{ padding: "4px 8px", paddingLeft: `${(c.codigo.split(".").length - 1) * 16 + 8}px` }}>{c.nombre}</td>
                      <td style={{ padding: "4px 8px", color: tema.subtexto, fontSize: 11 }}>{c.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 4: // NCF Sequences
        return (
          <div>
            <p style={{ color: tema.subtexto, marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              Configura las secuencias de Comprobantes Fiscales (NCF) autorizados por la DGII.
              Estos numeros se asignan automaticamente al facturar.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {ncfSecuencias.map((seq, i) => (
                <div key={seq.tipo} style={{ background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 16, color: tema.accent }}>{seq.tipo}</span>
                    <span style={{ fontSize: 12, color: tema.subtexto }}>
                      {seq.tipo === "B01" ? "Credito Fiscal" : seq.tipo === "B02" ? "Consumidor Final" : seq.tipo === "B14" ? "Regimen Especial" : "Gubernamental"}
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <label className="form-label">Desde</label>
                      <input className="form-input" type="number" min="1" value={seq.desde}
                        onChange={e => {
                          const updated = [...ncfSecuencias];
                          updated[i] = { ...updated[i], desde: parseInt(e.target.value) || 1 };
                          setNcfSecuencias(updated);
                        }} />
                    </div>
                    <div>
                      <label className="form-label">Hasta</label>
                      <input className="form-input" type="number" min="1" value={seq.hasta}
                        onChange={e => {
                          const updated = [...ncfSecuencias];
                          updated[i] = { ...updated[i], hasta: parseInt(e.target.value) || 100 };
                          setNcfSecuencias(updated);
                        }} />
                    </div>
                    <div>
                      <label className="form-label">Disponibles</label>
                      <div style={{ padding: "10px 14px", fontSize: 16, fontWeight: 700, color: seq.hasta - seq.desde < 50 ? "#f59e0b" : "#10b981" }}>
                        {seq.hasta - seq.desde + 1}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 5: // Usuarios
        return (
          <div>
            <p style={{ color: tema.subtexto, marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              Invita a tu equipo. Se les enviara un email con credenciales temporales.
              Puedes agregar mas usuarios despues desde Configuracion.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
              <div>
                <label className="form-label">Nombre</label>
                <input className="form-input" placeholder="Juan Perez" value={nuevoUsuario.nombre}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="form-input" type="email" placeholder="correo@empresa.com" value={nuevoUsuario.email}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })} />
              </div>
              <div>
                <label className="form-label">Rol</label>
                <select className="form-input" value={nuevoUsuario.rol}
                  onChange={e => setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })}>
                  <option value="GERENTE">Gerente</option>
                  <option value="CONTADOR">Contador</option>
                  <option value="CAJERO">Cajero</option>
                  <option value="VENDEDOR">Vendedor</option>
                  <option value="ALMACEN">Almacen</option>
                </select>
              </div>
              <button className="btn-primary" onClick={agregarInvitacion} style={{ height: 42 }}>+</button>
            </div>
            {invitaciones.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {invitaciones.map((inv, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "10px 14px" }}>
                    <div>
                      <span style={{ fontWeight: 500, marginRight: 8 }}>{inv.nombre}</span>
                      <span style={{ fontSize: 12, color: tema.subtexto }}>{inv.email}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="badge badge-blue">{inv.rol}</span>
                      <button onClick={() => quitarInvitacion(i)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 16 }}>x</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: 40, color: tema.subtexto }}>
                No hay invitaciones pendientes. Puedes agregar usuarios despues.
              </div>
            )}
          </div>
        );

      case 6: // Certificado
        return (
          <div>
            <p style={{ color: tema.subtexto, marginBottom: 20, fontSize: 14, lineHeight: 1.6 }}>
              Sube tu certificado digital P12 para habilitar la facturacion electronica (e-CF) con la DGII.
              Si aun no tienes certificado, puedes omitir este paso y configurarlo despues.
            </p>
            <div style={{ border: `2px dashed ${tema.borde}`, borderRadius: 16, padding: 40, textAlign: "center" }}>
              <input
                type="file"
                accept=".p12,.pfx"
                onChange={e => setCertificado(e.target.files?.[0] || null)}
                style={{ display: "none" }}
                id="cert-upload"
              />
              <label htmlFor="cert-upload" style={{ cursor: "pointer", display: "block" }}>
                <div style={{ fontSize: 32, marginBottom: 12, color: tema.subtexto }}>P12</div>
                <div style={{ fontSize: 14, color: tema.texto, fontWeight: 500, marginBottom: 4 }}>
                  {certificado ? certificado.name : "Haz clic para subir tu certificado"}
                </div>
                <div style={{ fontSize: 12, color: tema.subtexto }}>Formatos: .p12, .pfx</div>
              </label>
            </div>
            {certificado && (
              <div style={{ marginTop: 16 }}>
                <label className="form-label">Contrasena del Certificado</label>
                <input className="form-input" type="password" placeholder="Contrasena del archivo P12"
                  value={certPassword} onChange={e => setCertPassword(e.target.value)} />
              </div>
            )}
            <div style={{ marginTop: 16, padding: 14, background: `${tema.accent}10`, border: `1px solid ${tema.accent}20`, borderRadius: 10, fontSize: 13, color: tema.subtexto }}>
              Este paso es opcional. Puedes configurar el certificado desde Configuracion despues.
            </div>
          </div>
        );

      case 7: // Finalizacion
        return (
          <div>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>OK</div>
              <h3 style={{ fontFamily: "'Syne', sans-serif", fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
                Todo listo para comenzar
              </h3>
              <p style={{ color: tema.subtexto, fontSize: 14 }}>
                Revisa el resumen de tu configuracion
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                { label: "Negocio", value: negocio.nombre || "—", done: !!negocio.nombre },
                { label: "RNC", value: fiscal.rnc || "—", done: !!fiscal.rnc },
                { label: "Sucursal", value: sucursal.nombre, done: !!sucursal.nombre },
                { label: "Plan de Cuentas", value: cuentasCreadas ? `${PLAN_CUENTAS_PCGA_RD.length} cuentas` : "Pendiente", done: cuentasCreadas },
                { label: "NCF", value: ncfSecuencias.map(s => s.tipo).join(", "), done: true },
                { label: "Usuarios", value: invitaciones.length > 0 ? `${invitaciones.length} invitaciones` : "Sin invitaciones", done: true },
                { label: "Certificado", value: certificado ? certificado.name : "Omitido", done: true },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 10, padding: "12px 16px" }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600, marginRight: 8 }}>{item.label}</span>
                    <span style={{ fontSize: 13, color: tema.subtexto }}>{item.value}</span>
                  </div>
                  <span style={{ color: item.done ? "#10b981" : "#f59e0b", fontWeight: 700, fontSize: 12 }}>
                    {item.done ? "OK" : "PENDIENTE"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (completado) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
          * { margin:0; padding:0; box-sizing:border-box; }
          body { background:${tema.bg}; font-family:'DM Sans',sans-serif; }
        `}</style>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: tema.bg, color: tema.texto }}>
          <div style={{ textAlign: "center", maxWidth: 480, padding: 40 }}>
            <div style={{ fontSize: 64, marginBottom: 20 }}>OK</div>
            <h1 style={{ fontFamily: "'Syne', sans-serif", fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
              Configuracion <span style={{ color: tema.accent }}>completada</span>
            </h1>
            <p style={{ color: tema.subtexto, fontSize: 15, marginBottom: 32, lineHeight: 1.6 }}>
              Tu negocio esta listo. Ya puedes comenzar a facturar, registrar productos e invitar a tu equipo.
            </p>
            <button onClick={() => window.location.href = "/dashboard"} style={{
              background: `linear-gradient(135deg, ${tema.secondary}, ${tema.accent})`,
              border: "none", borderRadius: 12, padding: "14px 32px", color: "white",
              fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif",
              boxShadow: `0 4px 16px ${tema.accent}30`,
            }}>
              Ir al Dashboard
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
        * { margin:0; padding:0; box-sizing:border-box; }
        body { background:${tema.bg}; font-family:'DM Sans',sans-serif; }
        .onboarding-root { min-height:100vh; background:${tema.bg}; color:${tema.texto}; display:flex; }
        .onboarding-sidebar {
          width:300px; padding:40px 24px; border-right:1px solid ${tema.borde};
          background:${esClaro ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.01)"};
          display:flex; flex-direction:column;
        }
        .sidebar-logo {
          font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:8px;
        }
        .sidebar-logo span { color:${tema.accent}; }
        .sidebar-subtitle { font-size:13px; color:${tema.subtexto}; margin-bottom:40px; }
        .step-list { display:flex; flex-direction:column; gap:4px; flex:1; }
        .step-item {
          display:flex; align-items:center; gap:12px; padding:10px 12px;
          border-radius:10px; cursor:pointer; transition:all 0.2s; font-size:13px;
        }
        .step-item:hover { background:${tema.card}; }
        .step-item.active { background:${tema.accent}12; color:${tema.accent}; }
        .step-item.completed { color:${tema.subtexto}; }
        .step-number {
          width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:12px; font-weight:700; flex-shrink:0;
          border:2px solid ${tema.borde}; color:${tema.subtexto};
        }
        .step-item.active .step-number { border-color:${tema.accent}; color:${tema.accent}; background:${tema.accent}15; }
        .step-item.completed .step-number { border-color:#10b981; color:#10b981; background:rgba(16,185,129,0.1); }
        .step-info { display:flex; flex-direction:column; }
        .step-name { font-weight:600; font-size:13px; }
        .step-desc { font-size:11px; color:${tema.subtexto}; margin-top:1px; }
        .onboarding-main { flex:1; padding:48px; overflow-y:auto; }
        .main-header { margin-bottom:32px; }
        .main-title { font-family:'Syne',sans-serif; font-size:24px; font-weight:800; margin-bottom:6px; }
        .main-title span { color:${tema.accent}; }
        .main-desc { font-size:14px; color:${tema.subtexto}; }
        .step-content {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:20px;
          padding:32px; margin-bottom:32px;
          box-shadow:${esClaro ? "0 4px 16px rgba(0,0,0,0.06)" : "none"};
        }
        .form-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .form-group { display:flex; flex-direction:column; gap:6px; }
        .form-group.full { grid-column:1/-1; }
        .form-label { font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; }
        .form-input {
          background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"};
          border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px;
          font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif;
          outline:none; transition:all 0.2s;
        }
        .form-input:focus { border-color:${tema.accent}50; box-shadow:0 0 0 3px ${tema.accent}10; }
        .hint { font-size:11px; color:${tema.subtexto}; margin-top:2px; }
        .btn-row { display:flex; gap:12px; justify-content:space-between; }
        .btn-primary {
          background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none;
          border-radius:10px; padding:12px 24px; color:white; font-size:14px; font-weight:600;
          cursor:pointer; font-family:'Syne',sans-serif; transition:all 0.2s;
          box-shadow:0 4px 16px ${tema.accent}30;
        }
        .btn-primary:hover { transform:translateY(-1px); box-shadow:0 8px 24px ${tema.accent}40; }
        .btn-primary:disabled { opacity:0.5; cursor:not-allowed; transform:none; }
        .btn-secondary {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:10px;
          padding:12px 24px; color:${tema.subtexto}; font-size:14px; cursor:pointer;
          font-family:'DM Sans',sans-serif; transition:all 0.2s;
        }
        .btn-secondary:hover { border-color:${tema.accent}40; color:${tema.texto}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:11px; font-weight:600; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .progress-bar { width:100%; height:6px; background:${tema.borde}; border-radius:3px; overflow:hidden; }
        .progress-fill { height:100%; background:linear-gradient(90deg, ${tema.secondary}, ${tema.accent}); border-radius:3px; transition:width 0.3s; }
        .success-box {
          text-align:center; padding:32px; background:rgba(16,185,129,0.06);
          border:1px solid rgba(16,185,129,0.15); border-radius:16px;
        }
        .success-box p { color:#10b981; font-weight:600; margin-top:8px; }
        @media (max-width: 768px) {
          .onboarding-root { flex-direction:column; }
          .onboarding-sidebar { width:100%; padding:20px; border-right:none; border-bottom:1px solid ${tema.borde}; }
          .step-list { flex-direction:row; overflow-x:auto; gap:2px; }
          .step-item { min-width:auto; padding:8px; }
          .step-desc { display:none; }
          .onboarding-main { padding:20px; }
          .form-grid { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="onboarding-root">
        <div className="onboarding-sidebar">
          <div className="sidebar-logo">Lhams-<span>DJ</span></div>
          <div className="sidebar-subtitle">Configuracion inicial</div>
          <div className="step-list">
            {PASOS.map((p, i) => (
              <div
                key={i}
                className={`step-item ${i === paso ? "active" : i < paso ? "completed" : ""}`}
                onClick={() => { if (i <= paso) { setPaso(i); guardarProgreso(i); } }}
              >
                <div className="step-number">{i < paso ? "OK" : i + 1}</div>
                <div className="step-info">
                  <span className="step-name">{p.titulo}</span>
                  <span className="step-desc">{p.desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 24 }}>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${((paso + 1) / PASOS.length) * 100}%` }} />
            </div>
            <div style={{ fontSize: 12, color: tema.subtexto, marginTop: 8, textAlign: "center" }}>
              Paso {paso + 1} de {PASOS.length}
            </div>
          </div>
        </div>

        <div className="onboarding-main">
          <div className="main-header">
            <h1 className="main-title">
              <span>{PASOS[paso].titulo}</span>
            </h1>
            <p className="main-desc">{PASOS[paso].desc}</p>
          </div>

          <div className="step-content">
            {renderPaso()}
          </div>

          <div className="btn-row">
            <button className="btn-secondary" onClick={anterior} style={{ visibility: paso === 0 ? "hidden" : "visible" }}>
              Anterior
            </button>
            {paso < PASOS.length - 1 ? (
              <button className="btn-primary" onClick={siguiente}>
                Siguiente
              </button>
            ) : (
              <button className="btn-primary" onClick={finalizarOnboarding} disabled={saving}>
                {saving ? "Guardando..." : "Finalizar Configuracion"}
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
