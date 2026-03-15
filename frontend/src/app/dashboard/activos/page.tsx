"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { useI18n } from "@/i18n";
import { useLocaleFormat } from "@/hooks/useLocaleFormat";

interface ActivoFijo {
  id: string;
  codigo: string;
  nombre: string;
  categoria_nombre: string;
  costo_adquisicion: string;
  estado: string;
  depreciacion_acumulada: string;
  valor_en_libros: string;
  creado_en: string;
}

interface Resumen {
  total_activos: number;
  total_costo: string;
  total_depreciacion: string;
  total_valor_libros: string;
}

export default function ActivosPage() {
  const i18n = useI18n();
  const fmt = useLocaleFormat();
  const [activos, setActivos] = useState<ActivoFijo[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [activosRes, resumenRes] = await Promise.all([
        api.get("/activos-fijos/"),
        api.get("/activos-fijos/resumen/"),
      ]);
      setActivos(activosRes.data.results || activosRes.data);
      setResumen(resumenRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const filtrados = activos.filter(
    (a) =>
      a.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
      a.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  const estadoColor = (estado: string) => {
    switch (estado) {
      case "ACTIVO": return "#10b981";
      case "DEPRECIADO_TOTAL": return "#f59e0b";
      case "DADO_DE_BAJA": return "#ef4444";
      case "EN_MANTENIMIENTO": return "#6366f1";
      default: return "#94a3b8";
    }
  };

  const estadoLabel = (estado: string) => {
    switch (estado) {
      case "ACTIVO": return i18n.fixedAssets.active;
      case "DEPRECIADO_TOTAL": return i18n.fixedAssets.fullyDepreciated;
      case "DADO_DE_BAJA": return i18n.fixedAssets.writtenOff;
      case "EN_MANTENIMIENTO": return i18n.fixedAssets.inMaintenance;
      default: return estado;
    }
  };

  if (loading) return <div style={{ padding: 40, color: "#94a3b8" }}>{i18n.common.loading}</div>;

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>{i18n.fixedAssets.title}</h1>
      </div>

      {resumen && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
          {[
            { label: i18n.fixedAssets.title, value: resumen.total_activos },
            { label: i18n.fixedAssets.acquisitionCost, value: fmt.formatCurrency(Number(resumen.total_costo)) },
            { label: i18n.fixedAssets.accumulatedDepreciation, value: fmt.formatCurrency(Number(resumen.total_depreciacion)) },
            { label: i18n.fixedAssets.bookValue, value: fmt.formatCurrency(Number(resumen.total_valor_libros)) },
          ].map((card, i) => (
            <div key={i} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#64748b", marginBottom: 4 }}>{card.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{card.value}</div>
            </div>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder={i18n.fixedAssets.searchPlaceholder}
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "inherit", marginBottom: 16 }}
      />

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.code}</th>
              <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.name}</th>
              <th style={{ padding: "12px 8px", textAlign: "left", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.category}</th>
              <th style={{ padding: "12px 8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.acquisitionCost}</th>
              <th style={{ padding: "12px 8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.accumulatedDepreciation}</th>
              <th style={{ padding: "12px 8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.bookValue}</th>
              <th style={{ padding: "12px 8px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{i18n.fixedAssets.status}</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((a) => (
              <tr key={a.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <td style={{ padding: "10px 8px", fontFamily: "monospace", fontSize: 13 }}>{a.codigo}</td>
                <td style={{ padding: "10px 8px" }}>{a.nombre}</td>
                <td style={{ padding: "10px 8px", color: "#94a3b8" }}>{a.categoria_nombre}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmt.formatCurrency(Number(a.costo_adquisicion))}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace" }}>{fmt.formatCurrency(Number(a.depreciacion_acumulada))}</td>
                <td style={{ padding: "10px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600 }}>{fmt.formatCurrency(Number(a.valor_en_libros))}</td>
                <td style={{ padding: "10px 8px", textAlign: "center" }}>
                  <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, background: `${estadoColor(a.estado)}22`, color: estadoColor(a.estado) }}>
                    {estadoLabel(a.estado)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtrados.length === 0 && <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>{i18n.common.noResults}</div>}
    </div>
  );
}
