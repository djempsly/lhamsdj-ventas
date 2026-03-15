"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { useI18n } from "@/i18n";
import { useLocaleFormat } from "@/hooks/useLocaleFormat";

interface Solicitud {
  id: string;
  workflow_nombre: string;
  solicitante_nombre: string;
  paso_actual_nombre: string | null;
  estado: string;
  monto: string;
  creado_en: string;
  decisiones: { id: string; aprobador_nombre: string; decision: string; comentario: string; fecha_decision: string }[];
}

type Tab = "PENDIENTE" | "APROBADA" | "RECHAZADA" | "all";

export default function AprobacionesPage() {
  const i18n = useI18n();
  const fmt = useLocaleFormat();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("PENDIENTE");
  const [comentario, setComentario] = useState("");

  useEffect(() => {
    loadData();
  }, [tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      const params = tab === "all" ? {} : { estado: tab };
      const res = await api.get("/solicitudes-aprobacion/", { params });
      setSolicitudes(res.data.results || res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleAprobar = async (id: string) => {
    try {
      await api.post(`/solicitudes-aprobacion/${id}/aprobar/`, { comentario });
      setComentario("");
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleRechazar = async (id: string) => {
    if (!comentario) return alert(i18n.approvals.comment);
    try {
      await api.post(`/solicitudes-aprobacion/${id}/rechazar/`, { comentario });
      setComentario("");
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const estadoColor = (estado: string) => {
    switch (estado) {
      case "PENDIENTE": return "#f59e0b";
      case "APROBADA": return "#10b981";
      case "RECHAZADA": return "#ef4444";
      case "ESCALADA": return "#8b5cf6";
      case "CANCELADA": return "#64748b";
      default: return "#94a3b8";
    }
  };

  const estadoLabel = (estado: string) => {
    switch (estado) {
      case "PENDIENTE": return i18n.approvals.pending;
      case "APROBADA": return i18n.approvals.approved;
      case "RECHAZADA": return i18n.approvals.rejected;
      case "ESCALADA": return i18n.approvals.escalated;
      case "CANCELADA": return i18n.approvals.cancelled;
      default: return estado;
    }
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "PENDIENTE", label: i18n.approvals.pending },
    { key: "APROBADA", label: i18n.approvals.approved },
    { key: "RECHAZADA", label: i18n.approvals.rejected },
    { key: "all", label: i18n.common.all },
  ];

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{i18n.approvals.title}</h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)",
              background: tab === t.key ? "rgba(14,165,233,0.15)" : "transparent",
              color: tab === t.key ? "#0ea5e9" : "inherit", cursor: "pointer", fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 40, color: "#94a3b8" }}>{i18n.common.loading}</div>
      ) : solicitudes.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>{i18n.approvals.noPending}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {solicitudes.map((s) => (
            <div key={s.id} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.workflow_nombre}</div>
                  <div style={{ fontSize: 13, color: "#94a3b8" }}>
                    {i18n.approvals.requester}: {s.solicitante_nombre} | {i18n.approvals.amount}: {fmt.formatCurrency(Number(s.monto))}
                  </div>
                  {s.paso_actual_nombre && (
                    <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                      {i18n.approvals.currentStep}: {s.paso_actual_nombre}
                    </div>
                  )}
                </div>
                <span style={{ padding: "4px 12px", borderRadius: 12, fontSize: 12, background: `${estadoColor(s.estado)}22`, color: estadoColor(s.estado) }}>
                  {estadoLabel(s.estado)}
                </span>
              </div>

              {s.decisiones.length > 0 && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: "#64748b", marginBottom: 8 }}>{i18n.approvals.timeline}</div>
                  {s.decisiones.map((d) => (
                    <div key={d.id} style={{ fontSize: 12, marginBottom: 4, color: d.decision === "APROBADA" ? "#10b981" : "#ef4444" }}>
                      {d.decision === "APROBADA" ? i18n.approvals.approvedBy : i18n.approvals.rejectedBy}: {d.aprobador_nombre}
                      {d.comentario && <span style={{ color: "#94a3b8" }}> — {d.comentario}</span>}
                    </div>
                  ))}
                </div>
              )}

              {s.estado === "PENDIENTE" && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    placeholder={i18n.approvals.commentPlaceholder}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "inherit", fontSize: 13 }}
                  />
                  <button
                    onClick={() => handleAprobar(s.id)}
                    style={{ padding: "8px 16px", borderRadius: 8, background: "#10b981", color: "white", border: "none", cursor: "pointer", fontSize: 13 }}
                  >
                    {i18n.approvals.approve}
                  </button>
                  <button
                    onClick={() => handleRechazar(s.id)}
                    style={{ padding: "8px 16px", borderRadius: 8, background: "#ef4444", color: "white", border: "none", cursor: "pointer", fontSize: 13 }}
                  >
                    {i18n.approvals.reject}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
