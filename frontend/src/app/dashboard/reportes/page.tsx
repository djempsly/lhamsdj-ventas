"use client";
import { useEffect, useState } from "react";
import { fiscalService } from "@/services/fiscal";

interface ReporteRow {
  [key: string]: string | number;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export default function ReportesPage() {
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [tipo, setTipo] = useState<"606" | "607">("607");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [preview, setPreview] = useState<ReporteRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
  }, []);

  const generarPreview = async () => {
    setError("");
    setLoading(true);
    try {
      const { data } = await fiscalService.getPreview(tipo, year, month);
      const rows = Array.isArray(data) ? data : data.registros || data.results || [];
      setPreview(rows);
    } catch {
      setError("Error al generar vista previa. Verifique que existen datos para el periodo seleccionado.");
      setPreview([]);
    } finally {
      setLoading(false);
    }
  };

  const exportar = async () => {
    setExporting(true);
    try {
      const response = await fiscalService.exportar(tipo, year, month);
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `reporte_${tipo}_${year}_${String(month).padStart(2, "0")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      setError("Error al exportar. Verifique permisos y datos del periodo.");
    } finally {
      setExporting(false);
    }
  };

  const columns = preview.length > 0 ? Object.keys(preview[0]) : [];
  const totalMonto = preview.reduce((sum, r) => sum + (Number(r.monto_facturado || r.total || r.monto || 0)), 0);
  const totalITBIS = preview.reduce((sum, r) => sum + (Number(r.itbis || r.itbis_facturado || 0)), 0);

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
        .controls { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; align-items:flex-end; }
        .control-group { display:flex; flex-direction:column; gap:4px; }
        .control-label { font-size:11px; color:${tema.subtexto}; text-transform:uppercase; font-weight:600; letter-spacing:0.08em; }
        .control-input { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 14px; font-size:14px; color:${tema.texto}; font-family:'DM Sans',sans-serif; outline:none; }
        .control-input:focus { border-color:${tema.accent}50; }
        .btn-primary { background:linear-gradient(135deg, ${tema.secondary}, ${tema.accent}); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; font-family:'Syne',sans-serif; white-space:nowrap; box-shadow:0 4px 16px ${tema.accent}30; }
        .btn-primary:hover { transform:translateY(-1px); }
        .btn-primary:disabled { opacity:0.6; cursor:not-allowed; transform:none; }
        .btn-export { background:linear-gradient(135deg, #059669, #10b981); border:none; border-radius:10px; padding:10px 20px; color:white; font-size:14px; font-weight:600; cursor:pointer; font-family:'Syne',sans-serif; white-space:nowrap; }
        .btn-export:disabled { opacity:0.5; cursor:not-allowed; }
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:140px; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .table-wrap { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px; overflow-x:auto; }
        table { width:100%; border-collapse:collapse; }
        thead { background:${esClaro ? "rgba(0,0,0,0.03)" : "rgba(255,255,255,0.03)"}; }
        th { padding:12px 16px; text-align:left; font-size:11px; font-weight:600; color:${tema.subtexto}; text-transform:uppercase; letter-spacing:0.08em; border-bottom:1px solid ${tema.borde}; white-space:nowrap; }
        td { padding:14px 16px; font-size:13px; border-bottom:1px solid ${tema.borde}; }
        tr:last-child td { border-bottom:none; }
        tr:hover td { background:${esClaro ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.02)"}; }
        .tipo-tabs { display:flex; gap:4px; }
        .tipo-tab { padding:10px 20px; border-radius:10px; font-size:14px; font-weight:600; cursor:pointer; border:1px solid ${tema.borde}; background:${tema.card}; color:${tema.subtexto}; transition:all 0.2s; font-family:'Syne',sans-serif; }
        .tipo-tab.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
        .error-msg { background:rgba(239,68,68,0.08); border:1px solid rgba(239,68,68,0.18); border-radius:10px; padding:10px 14px; font-size:13px; color:#fca5a5; margin-bottom:16px; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>Reportes</span> Fiscales DGII</h1>
          </div>
        </div>

        <div className="controls">
          <div className="control-group">
            <div className="control-label">Tipo de Reporte</div>
            <div className="tipo-tabs">
              <button className={`tipo-tab ${tipo==="607"?"active":""}`} onClick={() => setTipo("607")}>607 Ventas</button>
              <button className={`tipo-tab ${tipo==="606"?"active":""}`} onClick={() => setTipo("606")}>606 Compras</button>
            </div>
          </div>
          <div className="control-group">
            <div className="control-label">Ano</div>
            <select className="control-input" value={year} onChange={e => setYear(Number(e.target.value))}>
              {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="control-group">
            <div className="control-label">Mes</div>
            <select className="control-input" value={month} onChange={e => setMonth(Number(e.target.value))}>
              {MESES.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
            </select>
          </div>
          <button className="btn-primary" onClick={generarPreview} disabled={loading}>
            {loading ? "Generando..." : "Vista Previa"}
          </button>
          <button className="btn-export" onClick={exportar} disabled={exporting || preview.length === 0}>
            {exporting ? "Exportando..." : "Exportar"}
          </button>
        </div>

        {error && <div className="error-msg">{error}</div>}

        {preview.length > 0 && (
          <>
            <div className="stats-row">
              <div className="mini-stat"><div className="mini-stat-val">{preview.length}</div><div className="mini-stat-label">Total registros</div></div>
              <div className="mini-stat"><div className="mini-stat-val">{formatCurrency(totalMonto)}</div><div className="mini-stat-label">Total monto</div></div>
              <div className="mini-stat"><div className="mini-stat-val">{formatCurrency(totalITBIS)}</div><div className="mini-stat-label">Total ITBIS</div></div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>{columns.map(col => <th key={col}>{col.replace(/_/g, ' ')}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {columns.map(col => (
                        <td key={col}>{typeof row[col] === 'number' ? Number(row[col]).toLocaleString('es-DO') : String(row[col] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {!loading && preview.length === 0 && !error && (
          <div className="empty-state"><p>Seleccione el tipo de reporte, periodo y haga clic en &quot;Vista Previa&quot;</p></div>
        )}
      </div>
    </>
  );
}
