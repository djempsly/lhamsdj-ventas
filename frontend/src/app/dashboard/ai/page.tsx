"use client";
import { useEffect, useState } from "react";
import { analisisAIService } from "@/services/ai";

interface AnalisisAI {
  id: string;
  tipo: string;
  titulo: string;
  descripcion: string;
  datos: Record<string, unknown> | null;
  confianza: number | null;
  accionable: boolean;
  leido: boolean;
  fecha: string;
}

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)",
  borde: "rgba(255,255,255,0.05)", texto: "#e2eaf5",
  subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8"
};

const TIPO_COLORS: Record<string,string> = {
  CLASIFICACION: "badge-blue", PREDICCION: "badge-green",
  ANOMALIA: "badge-red", INSIGHT: "badge-yellow", RECOMENDACION: "badge-purple"
};

export default function AIPage() {
  const [analisis, setAnalisis] = useState<AnalisisAI[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [filtroTipo, setFiltroTipo] = useState("");
  const [detalle, setDetalle] = useState<AnalisisAI | null>(null);

  useEffect(() => {
    setMounted(true);
    const tg = localStorage.getItem("tema");
    if (tg) { try { setTema(JSON.parse(tg)); } catch { /* default */ } }
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const { data } = await analisisAIService.getAll();
      setAnalisis(Array.isArray(data) ? data : data.results || []);
    } catch { /* interceptor */ }
    setLoading(false);
  };

  const verDetalle = async (id: string) => {
    try {
      const { data } = await analisisAIService.getById(id);
      setDetalle(data);
    } catch { /* interceptor */ }
  };

  const filtrados = filtroTipo
    ? analisis.filter(a => a.tipo === filtroTipo)
    : analisis;

  const tipos = [...new Set(analisis.map(a => a.tipo))];
  const formatFecha = (f: string) => new Date(f).toLocaleString('es-DO', { dateStyle: 'medium', timeStyle: 'short' });
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
        .stats-row { display:flex; gap:12px; margin-bottom:24px; flex-wrap:wrap; }
        .mini-stat { background:${tema.card}; border:1px solid ${tema.borde}; border-radius:12px; padding:16px 20px; flex:1; min-width:130px; }
        .mini-stat-val { font-family:'Syne',sans-serif; font-size:22px; font-weight:800; }
        .mini-stat-label { font-size:12px; color:${tema.subtexto}; margin-top:2px; }
        .filters { display:flex; gap:6px; margin-bottom:24px; flex-wrap:wrap; }
        .filter-btn { padding:7px 14px; border-radius:8px; font-size:12px; font-weight:600; cursor:pointer; border:1px solid ${tema.borde}; background:${tema.card}; color:${tema.subtexto}; transition:all 0.2s; font-family:'DM Sans',sans-serif; }
        .filter-btn.active { background:${tema.accent}; color:white; border-color:${tema.accent}; }
        .cards-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(340px,1fr)); gap:16px; }
        .ai-card {
          background:${tema.card}; border:1px solid ${tema.borde}; border-radius:16px;
          padding:20px; cursor:pointer; transition:all 0.2s;
        }
        .ai-card:hover { border-color:${tema.accent}40; transform:translateY(-2px); box-shadow:0 8px 24px ${tema.accent}10; }
        .ai-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
        .ai-card h3 { font-family:'Syne',sans-serif; font-size:15px; font-weight:700; margin-bottom:6px; }
        .ai-card p { font-size:13px; color:${tema.subtexto}; line-height:1.5; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
        .ai-card-footer { display:flex; align-items:center; justify-content:space-between; margin-top:12px; font-size:11px; color:${tema.subtexto}; }
        .confidence-bar { width:80px; height:6px; background:${tema.borde}; border-radius:3px; overflow:hidden; }
        .confidence-fill { height:100%; border-radius:3px; background:${tema.accent}; }
        .badge { display:inline-flex; align-items:center; border-radius:100px; padding:3px 10px; font-size:10px; font-weight:600; }
        .badge-green { background:rgba(16,185,129,0.12); color:#10b981; }
        .badge-red { background:rgba(239,68,68,0.12); color:#ef4444; }
        .badge-yellow { background:rgba(245,158,11,0.12); color:#f59e0b; }
        .badge-blue { background:rgba(59,130,246,0.12); color:#3b82f6; }
        .badge-purple { background:rgba(139,92,246,0.12); color:#8b5cf6; }
        .unread-dot { width:8px; height:8px; border-radius:50%; background:${tema.accent}; display:inline-block; margin-right:6px; }
        .modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.7); display:flex; align-items:center; justify-content:center; z-index:1000; backdrop-filter:blur(4px); }
        .modal { background:${esClaro ? "#ffffff" : "#0d1829"}; border:1px solid ${tema.borde}; border-radius:20px; padding:36px; width:100%; max-width:600px; max-height:90vh; overflow-y:auto; box-shadow:0 30px 60px rgba(0,0,0,0.4); }
        .modal-title { font-family:'Syne',sans-serif; font-size:20px; font-weight:800; margin-bottom:16px; }
        .modal p { font-size:14px; line-height:1.6; color:${tema.subtexto}; margin-bottom:12px; }
        .datos-block { background:${esClaro ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.04)"}; border:1px solid ${tema.borde}; border-radius:10px; padding:16px; font-family:monospace; font-size:12px; white-space:pre-wrap; word-break:break-all; max-height:300px; overflow-y:auto; }
        .btn-cancel { background:none; border:1px solid ${tema.borde}; border-radius:10px; padding:10px 20px; color:${tema.subtexto}; font-size:14px; cursor:pointer; font-family:'DM Sans',sans-serif; }
        .empty-state { text-align:center; padding:60px 20px; color:${tema.subtexto}; }
        .loading { text-align:center; padding:60px; color:${tema.subtexto}; }
      `}</style>

      <div className="page">
        <div className="header">
          <div className="header-left">
            <button className="back-btn" onClick={() => window.location.href="/dashboard"}>Volver</button>
            <h1 className="page-title"><span>AI</span> Agent / Analisis</h1>
          </div>
        </div>

        <div className="stats-row">
          <div className="mini-stat"><div className="mini-stat-val">{analisis.length}</div><div className="mini-stat-label">Total analisis</div></div>
          <div className="mini-stat"><div className="mini-stat-val">{analisis.filter(a => !a.leido).length}</div><div className="mini-stat-label">Sin leer</div></div>
          <div className="mini-stat"><div className="mini-stat-val">{analisis.filter(a => a.accionable).length}</div><div className="mini-stat-label">Accionables</div></div>
          <div className="mini-stat"><div className="mini-stat-val">{analisis.length > 0 ? `${Math.round(analisis.reduce((s,a) => s + (Number(a.confianza)||0), 0) / analisis.length)}%` : "—"}</div><div className="mini-stat-label">Confianza prom.</div></div>
        </div>

        <div className="filters">
          <button className={`filter-btn ${filtroTipo===""?"active":""}`} onClick={() => setFiltroTipo("")}>Todos</button>
          {tipos.map(t => (
            <button key={t} className={`filter-btn ${filtroTipo===t?"active":""}`} onClick={() => setFiltroTipo(t)}>{t}</button>
          ))}
        </div>

        {loading ? (
          <div className="loading">Cargando analisis...</div>
        ) : filtrados.length === 0 ? (
          <div className="empty-state"><p>No hay analisis disponibles. El agente AI generara insights automaticamente.</p></div>
        ) : (
          <div className="cards-grid">
            {filtrados.map(a => (
              <div key={a.id} className="ai-card" onClick={() => verDetalle(a.id)} style={{opacity: a.leido ? 0.8 : 1}}>
                <div className="ai-card-header">
                  <span className={`badge ${TIPO_COLORS[a.tipo] || "badge-blue"}`}>{a.tipo}</span>
                  {!a.leido && <span className="unread-dot" />}
                  {a.accionable && <span className="badge badge-green">Accionable</span>}
                </div>
                <h3>{a.titulo}</h3>
                <p>{a.descripcion}</p>
                <div className="ai-card-footer">
                  <span>{formatFecha(a.fecha)}</span>
                  {a.confianza != null && (
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <span>{Number(a.confianza).toFixed(0)}%</span>
                      <div className="confidence-bar"><div className="confidence-fill" style={{width:`${a.confianza}%`}} /></div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {detalle && (
        <div className="modal-overlay" onClick={e => e.target===e.currentTarget && setDetalle(null)}>
          <div className="modal">
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <span className={`badge ${TIPO_COLORS[detalle.tipo] || "badge-blue"}`}>{detalle.tipo}</span>
              {detalle.accionable && <span className="badge badge-green">Accionable</span>}
              {detalle.confianza != null && <span className="badge badge-blue">Confianza: {Number(detalle.confianza).toFixed(0)}%</span>}
            </div>
            <h2 className="modal-title">{detalle.titulo}</h2>
            <p>{detalle.descripcion}</p>
            <p style={{fontSize:12}}>{formatFecha(detalle.fecha)}</p>
            {detalle.datos && (
              <>
                <div style={{fontSize:11,color:tema.subtexto,textTransform:"uppercase",fontWeight:600,marginBottom:8,marginTop:16}}>Datos del Analisis</div>
                <div className="datos-block">{JSON.stringify(detalle.datos, null, 2)}</div>
              </>
            )}
            <div style={{marginTop:20,textAlign:"right"}}>
              <button className="btn-cancel" onClick={() => setDetalle(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
