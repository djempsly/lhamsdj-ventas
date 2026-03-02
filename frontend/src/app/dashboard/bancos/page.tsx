"use client";
import { useEffect, useState } from "react";
import { bancosService } from "@/services/bancos";

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

interface CuentaBancaria {
  id: string; banco: string; tipo: string; numero: string; saldo: number; activa: boolean;
}
interface Movimiento {
  id: string; fecha: string; descripcion: string; referencia: string;
  monto: number; tipo: string; saldo_posterior: number; conciliado: boolean;
}

export default function BancosPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [cuentas, setCuentas] = useState<CuentaBancaria[]>([]);
  const [selectedCuenta, setSelectedCuenta] = useState<string>("");
  const [movimientos, setMovimientos] = useState<Movimiento[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"cuentas" | "movimientos" | "conciliar">("cuentas");
  const [conciliarForm, setConciliarForm] = useState({ fecha_desde: "", fecha_hasta: "", saldo_extracto: 0 });
  const [conciliarResult, setConciliarResult] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    try { const t = localStorage.getItem("tema"); if (t) setTema(JSON.parse(t)); } catch {}
  }, []);

  useEffect(() => { if (mounted) cargarCuentas(); }, [mounted]);

  const cargarCuentas = async () => {
    setLoading(true);
    try {
      const { data } = await bancosService.getCuentas();
      setCuentas(Array.isArray(data) ? data : data.results || []);
    } catch {}
    setLoading(false);
  };

  const cargarMovimientos = async (cuentaId: string) => {
    setSelectedCuenta(cuentaId);
    setTab("movimientos");
    try {
      const { data } = await bancosService.getMovimientos(cuentaId);
      setMovimientos(Array.isArray(data) ? data : data.results || []);
    } catch {}
  };

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0] || !selectedCuenta) return;
    const formData = new FormData();
    formData.append("archivo", e.target.files[0]);
    try {
      const { data } = await bancosService.importarMovimientos(selectedCuenta, formData);
      alert(`${data.movimientos_importados} movimientos importados`);
      cargarMovimientos(selectedCuenta);
    } catch {}
  };

  const handleConciliar = async () => {
    if (!selectedCuenta) return;
    try {
      const { data } = await bancosService.conciliar(selectedCuenta, conciliarForm);
      setConciliarResult(data);
    } catch {}
  };

  const esClaro = tema.texto === "#0f172a";
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);

  if (!mounted) return null;

  return (
    <div style={{ minHeight: "100vh", background: tema.bg, color: tema.texto, padding: "24px" }}>
      <style>{`
        .banco-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
        .banco-title{font-size:1.5rem;font-weight:700}
        .banco-tabs{display:flex;gap:8px;margin-bottom:20px}
        .banco-tab{padding:8px 20px;border-radius:8px;border:1px solid ${tema.borde};cursor:pointer;
          font-size:.85rem;background:transparent;color:${tema.subtexto};transition:all .2s}
        .banco-tab.active{background:linear-gradient(135deg,${tema.accent},${tema.secondary});
          color:#fff;border-color:transparent}
        .banco-card{background:${tema.card};border:1px solid ${tema.borde};border-radius:12px;
          padding:20px;cursor:pointer;transition:all .2s}
        .banco-card:hover{border-color:${tema.accent};transform:translateY(-2px)}
        .banco-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px}
        .banco-table{width:100%;border-collapse:separate;border-spacing:0;
          background:${tema.card};border-radius:12px;overflow:hidden;border:1px solid ${tema.borde}}
        .banco-table th{padding:12px 16px;text-align:left;font-size:.75rem;text-transform:uppercase;
          letter-spacing:.5px;color:${tema.subtexto};border-bottom:1px solid ${tema.borde}}
        .banco-table td{padding:10px 16px;border-bottom:1px solid ${tema.borde};font-size:.85rem}
        .banco-table tr:hover td{background:${tema.borde}}
        .banco-btn{padding:10px 20px;border-radius:10px;border:none;font-weight:600;cursor:pointer;
          background:linear-gradient(135deg,${tema.accent},${tema.secondary});color:#fff}
        .banco-btn:hover{opacity:.9}
        .banco-btn-sm{padding:6px 14px;border-radius:8px;border:none;font-weight:500;cursor:pointer;
          font-size:.8rem}
        .form-group{margin-bottom:14px}
        .form-label{display:block;font-size:.8rem;margin-bottom:4px;color:${tema.subtexto}}
        .form-input{width:100%;padding:10px;border-radius:8px;border:1px solid ${tema.borde};
          background:${esClaro ? "#f8fafc" : "rgba(255,255,255,.05)"};color:${tema.texto};font-size:.9rem}
        .conc-box{background:${tema.card};border:1px solid ${tema.borde};border-radius:12px;padding:24px}
        .check-icon{color:#22c55e;font-weight:700}
        .pending-icon{color:#eab308}
      `}</style>

      <div className="banco-header">
        <div>
          <div style={{ fontSize: ".85rem", color: tema.subtexto, cursor: "pointer" }}
            onClick={() => (window.location.href = "/dashboard")}>← Volver al Dashboard</div>
          <div className="banco-title">Reconciliacion Bancaria</div>
        </div>
      </div>

      <div className="banco-tabs">
        <button className={`banco-tab ${tab === "cuentas" ? "active" : ""}`}
          onClick={() => setTab("cuentas")}>Cuentas</button>
        <button className={`banco-tab ${tab === "movimientos" ? "active" : ""}`}
          onClick={() => setTab("movimientos")} disabled={!selectedCuenta}>Movimientos</button>
        <button className={`banco-tab ${tab === "conciliar" ? "active" : ""}`}
          onClick={() => setTab("conciliar")} disabled={!selectedCuenta}>Conciliar</button>
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40 }}>Cargando...</div>}

      {!loading && tab === "cuentas" && (
        <div className="banco-grid">
          {cuentas.map((c) => (
            <div className="banco-card" key={c.id} onClick={() => cargarMovimientos(c.id)}>
              <div style={{ fontWeight: 700, fontSize: "1.1rem", marginBottom: 8 }}>{c.banco}</div>
              <div style={{ color: tema.subtexto, fontSize: ".85rem" }}>
                {c.tipo} - {c.numero}
              </div>
              <div style={{ fontSize: "1.3rem", fontWeight: 700, marginTop: 12, color: tema.accent }}>
                {fmt(c.saldo)}
              </div>
              <div style={{
                marginTop: 8, fontSize: ".75rem", padding: "3px 8px", borderRadius: 6, display: "inline-block",
                background: c.activa ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)",
                color: c.activa ? "#22c55e" : "#ef4444",
              }}>
                {c.activa ? "Activa" : "Inactiva"}
              </div>
            </div>
          ))}
          {cuentas.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: tema.subtexto }}>
              No hay cuentas bancarias registradas
            </div>
          )}
        </div>
      )}

      {!loading && tab === "movimientos" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ fontWeight: 600 }}>
              Movimientos - {cuentas.find((c) => c.id === selectedCuenta)?.banco}
            </div>
            <label className="banco-btn" style={{ cursor: "pointer" }}>
              Importar CSV
              <input type="file" accept=".csv" style={{ display: "none" }} onChange={handleImportar} />
            </label>
          </div>
          <table className="banco-table">
            <thead>
              <tr>
                <th>Fecha</th><th>Descripcion</th><th>Referencia</th><th>Tipo</th>
                <th>Monto</th><th>Saldo</th><th>Conciliado</th>
              </tr>
            </thead>
            <tbody>
              {movimientos.map((m) => (
                <tr key={m.id}>
                  <td>{m.fecha}</td>
                  <td>{m.descripcion}</td>
                  <td style={{ color: tema.subtexto }}>{m.referencia}</td>
                  <td>
                    <span style={{
                      color: m.tipo === "CREDITO" ? "#22c55e" : "#ef4444",
                      fontWeight: 600,
                    }}>
                      {m.tipo}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600 }}>{fmt(m.monto)}</td>
                  <td>{fmt(m.saldo_posterior)}</td>
                  <td>
                    {m.conciliado
                      ? <span className="check-icon">&#10003;</span>
                      : <span className="pending-icon">&#9679;</span>}
                  </td>
                </tr>
              ))}
              {movimientos.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", padding: 30 }}>
                  Sin movimientos. Importe un extracto CSV.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && tab === "conciliar" && (
        <div className="conc-box">
          <h3 style={{ marginBottom: 16 }}>Conciliar Cuenta</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Fecha Desde</label>
              <input type="date" className="form-input" value={conciliarForm.fecha_desde}
                onChange={(e) => setConciliarForm({ ...conciliarForm, fecha_desde: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Fecha Hasta</label>
              <input type="date" className="form-input" value={conciliarForm.fecha_hasta}
                onChange={(e) => setConciliarForm({ ...conciliarForm, fecha_hasta: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Saldo Extracto Bancario</label>
              <input type="number" className="form-input" value={conciliarForm.saldo_extracto}
                onChange={(e) => setConciliarForm({ ...conciliarForm, saldo_extracto: +e.target.value })} />
            </div>
          </div>
          <button className="banco-btn" onClick={handleConciliar}>Ejecutar Conciliacion</button>

          {conciliarResult && (
            <div style={{
              marginTop: 20, padding: 20, borderRadius: 12,
              background: esClaro ? "#f0fdf4" : "rgba(34,197,94,.08)",
              border: `1px solid ${conciliarResult.diferencia === 0 ? "rgba(34,197,94,.3)" : "rgba(234,179,8,.3)"}`,
            }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>Resultado de Conciliacion</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                <div>
                  <div style={{ color: tema.subtexto, fontSize: ".8rem" }}>Conciliados</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#22c55e" }}>
                    {conciliarResult.movimientos_conciliados}
                  </div>
                </div>
                <div>
                  <div style={{ color: tema.subtexto, fontSize: ".8rem" }}>Pendientes</div>
                  <div style={{ fontSize: "1.3rem", fontWeight: 700, color: "#eab308" }}>
                    {conciliarResult.movimientos_pendientes}
                  </div>
                </div>
                <div>
                  <div style={{ color: tema.subtexto, fontSize: ".8rem" }}>Diferencia</div>
                  <div style={{
                    fontSize: "1.3rem", fontWeight: 700,
                    color: conciliarResult.diferencia === 0 ? "#22c55e" : "#ef4444",
                  }}>
                    {fmt(conciliarResult.diferencia)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
