"use client";
import { useEffect, useState } from "react";
import { ordenesCompraService } from "@/services/cotizaciones";

const TEMA_DEFAULT = {
  bg: "#03080f", card: "rgba(255,255,255,0.02)", borde: "rgba(255,255,255,0.05)",
  texto: "#e2eaf5", subtexto: "#475569", accent: "#0ea5e9", secondary: "#1d4ed8",
};

interface OrdenCompra {
  id: string; numero: string; proveedor_nombre: string; fecha: string;
  subtotal: number; total: number; estado: string; solicitado_por: string;
  aprobado_por: string | null; notas: string;
}

const ESTADO_COLORS: Record<string,string> = {
  BORRADOR: "#64748b", PENDIENTE_APROBACION: "#f59e0b", APROBADA: "#10b981",
  RECHAZADA: "#ef4444", ENVIADA: "#3b82f6", RECIBIDA: "#22c55e", CANCELADA: "#6b7280",
};

export default function OrdenesCompraPage() {
  const [tema, setTema] = useState(TEMA_DEFAULT);
  const [mounted, setMounted] = useState(false);
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");

  useEffect(() => {
    setMounted(true);
    try { const t = localStorage.getItem("tema"); if (t) setTema(JSON.parse(t)); } catch {}
    cargar();
  }, []);

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await ordenesCompraService.getAll();
      setOrdenes(Array.isArray(data) ? data : data.results || []);
    } catch {}
    setLoading(false);
  };

  const handleAction = async (id: string, action: "aprobar" | "enviar" | "convertirCompra") => {
    try {
      await ordenesCompraService[action](id);
      cargar();
    } catch {}
  };

  const filtradas = filtro ? ordenes.filter(o => o.estado === filtro) : ordenes;
  const fmt = (n: number) => new Intl.NumberFormat("es-DO", { style: "currency", currency: "DOP" }).format(n);
  const esClaro = tema.texto === "#0f172a";

  if (!mounted) return null;

  return (
    <div style={{ minHeight: "100vh", background: tema.bg, color: tema.texto, padding: 24, fontFamily: "'DM Sans',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=DM+Sans:wght@300;400;500&display=swap');`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: ".85rem", color: tema.subtexto, cursor: "pointer" }} onClick={() => window.location.href = "/dashboard"}>← Volver</div>
          <h1 style={{ fontFamily: "'Syne',sans-serif", fontSize: "1.5rem", fontWeight: 800 }}>Ordenes de Compra</h1>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>{ordenes.length}</div>
          <div style={{ fontSize: 12, color: tema.subtexto }}>Total</div>
        </div>
        <div style={{ background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>{ordenes.filter(o => o.estado === "PENDIENTE_APROBACION").length}</div>
          <div style={{ fontSize: 12, color: tema.subtexto }}>Pendientes</div>
        </div>
        <div style={{ background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800 }}>{ordenes.filter(o => o.estado === "APROBADA").length}</div>
          <div style={{ fontSize: 12, color: tema.subtexto }}>Aprobadas</div>
        </div>
        <div style={{ background: tema.card, border: `1px solid ${tema.borde}`, borderRadius: 12, padding: "16px 20px", flex: 1, minWidth: 130 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 22, fontWeight: 800, color: tema.accent }}>
            {fmt(ordenes.reduce((s, o) => s + Number(o.total), 0))}
          </div>
          <div style={{ fontSize: 12, color: tema.subtexto }}>Valor total</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {["", "BORRADOR", "PENDIENTE_APROBACION", "APROBADA", "ENVIADA", "RECIBIDA"].map(e => (
          <button key={e} onClick={() => setFiltro(e)} style={{
            padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            border: `1px solid ${filtro === e ? tema.accent : tema.borde}`,
            background: filtro === e ? tema.accent : tema.card,
            color: filtro === e ? "white" : tema.subtexto,
            fontFamily: "'DM Sans',sans-serif",
          }}>{e || "Todos"}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>Cargando...</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, background: tema.card, borderRadius: 12, overflow: "hidden", border: `1px solid ${tema.borde}` }}>
          <thead>
            <tr>
              {["Numero", "Proveedor", "Fecha", "Total", "Estado", "Acciones"].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: ".75rem", textTransform: "uppercase", letterSpacing: ".5px", color: tema.subtexto, borderBottom: `1px solid ${tema.borde}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map(o => (
              <tr key={o.id}>
                <td style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.borde}`, fontWeight: 600 }}>{o.numero}</td>
                <td style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.borde}` }}>{o.proveedor_nombre}</td>
                <td style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.borde}`, color: tema.subtexto }}>{new Date(o.fecha).toLocaleDateString("es-DO")}</td>
                <td style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.borde}`, fontWeight: 600 }}>{fmt(o.total)}</td>
                <td style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.borde}` }}>
                  <span style={{ padding: "3px 10px", borderRadius: 100, fontSize: 10, fontWeight: 600, background: `${ESTADO_COLORS[o.estado] || "#64748b"}20`, color: ESTADO_COLORS[o.estado] || "#64748b" }}>{o.estado.replace("_", " ")}</span>
                </td>
                <td style={{ padding: "10px 16px", borderBottom: `1px solid ${tema.borde}` }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {o.estado === "PENDIENTE_APROBACION" && (
                      <button onClick={() => handleAction(o.id, "aprobar")} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#10b981", color: "white", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Aprobar</button>
                    )}
                    {o.estado === "APROBADA" && (
                      <>
                        <button onClick={() => handleAction(o.id, "enviar")} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#3b82f6", color: "white", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Enviar</button>
                        <button onClick={() => handleAction(o.id, "convertirCompra")} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#059669", color: "white", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Compra</button>
                      </>
                    )}
                    {o.estado === "ENVIADA" && (
                      <button onClick={() => handleAction(o.id, "convertirCompra")} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#059669", color: "white", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Recibir</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtradas.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", padding: 30, color: tema.subtexto }}>No hay ordenes de compra</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
