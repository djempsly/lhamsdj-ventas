"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { useI18n } from "@/i18n";
import { useLocaleFormat } from "@/hooks/useLocaleFormat";

interface Presupuesto {
  id: string;
  nombre: string;
  periodo_nombre: string;
  departamento_nombre: string | null;
  estado: string;
  total_presupuestado: string;
  creado_en: string;
}

interface LineaEjecucion {
  cuenta: string;
  cuenta_nombre: string;
  presupuestado: string;
  ejecutado: string;
  disponible: string;
  porcentaje: number;
  alerta: boolean;
}

interface Ejecucion {
  presupuesto: string;
  total_presupuestado: string;
  lineas: LineaEjecucion[];
}

export default function PresupuestosPage() {
  const i18n = useI18n();
  const fmt = useLocaleFormat();
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [ejecucion, setEjecucion] = useState<Ejecucion | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await api.get("/presupuestos/");
      setPresupuestos(res.data.results || res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadEjecucion = async (id: string) => {
    setSelectedId(id);
    try {
      const res = await api.get(`/presupuestos/${id}/ejecucion/`);
      setEjecucion(res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const estadoColor = (estado: string) => {
    switch (estado) {
      case "BORRADOR": return "#64748b";
      case "PENDIENTE_APROBACION": return "#f59e0b";
      case "APROBADO": return "#10b981";
      case "CERRADO": return "#94a3b8";
      default: return "#94a3b8";
    }
  };

  const estadoLabel = (estado: string) => {
    switch (estado) {
      case "BORRADOR": return i18n.budgets.draft;
      case "PENDIENTE_APROBACION": return i18n.budgets.pendingApproval;
      case "APROBADO": return i18n.budgets.approved;
      case "CERRADO": return i18n.budgets.closed;
      default: return estado;
    }
  };

  if (loading) return <div style={{ padding: 40, color: "#94a3b8" }}>{i18n.common.loading}</div>;

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{i18n.budgets.title}</h1>
      </div>

      {presupuestos.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>{i18n.budgets.noBudgets}</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: selectedId ? "1fr 2fr" : "1fr", gap: 24 }}>
          {/* Budget list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {presupuestos.map((p) => (
              <div
                key={p.id}
                onClick={() => loadEjecucion(p.id)}
                style={{
                  background: selectedId === p.id ? "rgba(14,165,233,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedId === p.id ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 12, padding: 16, cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>{p.nombre}</span>
                  <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, background: `${estadoColor(p.estado)}22`, color: estadoColor(p.estado) }}>
                    {estadoLabel(p.estado)}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {p.periodo_nombre} {p.departamento_nombre && `| ${p.departamento_nombre}`}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, marginTop: 8, fontFamily: "monospace" }}>
                  {fmt.formatCurrency(Number(p.total_presupuestado))}
                </div>
              </div>
            ))}
          </div>

          {/* Execution detail */}
          {ejecucion && (
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                {i18n.budgets.execution}: {ejecucion.presupuesto}
              </h2>
              <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 16 }}>
                {i18n.budgets.totalBudgeted}: {fmt.formatCurrency(Number(ejecucion.total_presupuestado))}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <th style={{ padding: "8px", textAlign: "left", fontSize: 12, color: "#64748b" }}>{i18n.budgets.account}</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.budgets.budgeted}</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.budgets.actual}</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.budgets.difference}</th>
                    <th style={{ padding: "8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.budgets.percentExecuted}</th>
                  </tr>
                </thead>
                <tbody>
                  {ejecucion.lineas.map((l, idx) => (
                    <tr key={idx} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px" }}>
                        <span style={{ fontFamily: "monospace", fontSize: 12, color: "#94a3b8" }}>{l.cuenta}</span>{" "}
                        {l.cuenta_nombre}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{fmt.formatCurrency(Number(l.presupuestado))}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace" }}>{fmt.formatCurrency(Number(l.ejecutado))}</td>
                      <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", color: Number(l.disponible) < 0 ? "#ef4444" : "#10b981" }}>
                        {fmt.formatCurrency(Number(l.disponible))}
                      </td>
                      <td style={{ padding: "8px", textAlign: "right" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                          <div style={{ width: 60, height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{
                              width: `${Math.min(l.porcentaje, 100)}%`, height: "100%", borderRadius: 3,
                              background: l.alerta ? "#ef4444" : l.porcentaje > 75 ? "#f59e0b" : "#10b981",
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontFamily: "monospace", color: l.alerta ? "#ef4444" : "inherit" }}>
                            {l.porcentaje}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
