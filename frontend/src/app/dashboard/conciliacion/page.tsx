"use client";
import { useEffect, useState, useRef } from "react";
import api from "@/lib/axios";
import { useI18n } from "@/i18n";
import { useLocaleFormat } from "@/hooks/useLocaleFormat";

interface Importacion {
  id: string;
  archivo_nombre: string;
  formato: string;
  fecha_importacion: string;
  registros_importados: number;
  registros_conciliados: number;
}

interface Transaccion {
  id: string;
  fecha: string;
  descripcion: string;
  referencia: string;
  monto: string;
  estado: string;
  movimiento_match_desc: string | null;
  confianza_match: string;
}

export default function ConciliacionPage() {
  const i18n = useI18n();
  const fmt = useLocaleFormat();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importaciones, setImportaciones] = useState<Importacion[]>([]);
  const [transacciones, setTransacciones] = useState<Transaccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [formato, setFormato] = useState("OFX");
  const [cuentaId, setCuentaId] = useState("");
  const [cuentas, setCuentas] = useState<{ id: string; banco: string; numero: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [impRes, cuentasRes] = await Promise.all([
        api.get("/importaciones-bancarias/"),
        api.get("/cuentas-bancarias/"),
      ]);
      setImportaciones(impRes.data.results || impRes.data);
      const c = cuentasRes.data.results || cuentasRes.data;
      setCuentas(c);
      if (c.length > 0 && !cuentaId) setCuentaId(c[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadTransacciones = async (importId: string) => {
    setSelectedImport(importId);
    try {
      const res = await api.get("/transacciones-bancarias/", { params: { importacion: importId } });
      setTransacciones(res.data.results || res.data);
    } catch (e) {
      console.error(e);
    }
  };

  const handleImport = async (file: File) => {
    if (!cuentaId) return;
    setImporting(true);
    const formData = new FormData();
    formData.append("archivo", file);
    formData.append("cuenta_bancaria", cuentaId);
    formData.append("formato", formato);
    try {
      await api.post("/importaciones-bancarias/importar/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      loadData();
    } catch (e) {
      console.error(e);
    } finally {
      setImporting(false);
    }
  };

  const confirmarMatch = async (id: string) => {
    try {
      await api.post(`/transacciones-bancarias/${id}/confirmar/`);
      if (selectedImport) loadTransacciones(selectedImport);
    } catch (e) { console.error(e); }
  };

  const rechazarMatch = async (id: string) => {
    try {
      await api.post(`/transacciones-bancarias/${id}/rechazar_match/`);
      if (selectedImport) loadTransacciones(selectedImport);
    } catch (e) { console.error(e); }
  };

  const estadoColor = (estado: string) => {
    switch (estado) {
      case "CONCILIADA": return "#10b981";
      case "PENDIENTE": return "#f59e0b";
      case "EXCLUIDA": return "#64748b";
      default: return "#94a3b8";
    }
  };

  const estadoLabel = (estado: string) => {
    switch (estado) {
      case "CONCILIADA": return i18n.reconciliation.matched;
      case "PENDIENTE": return i18n.reconciliation.unmatched;
      case "EXCLUIDA": return i18n.reconciliation.excluded;
      default: return estado;
    }
  };

  if (loading) return <div style={{ padding: 40, color: "#94a3b8" }}>{i18n.common.loading}</div>;

  return (
    <div style={{ padding: "24px", maxWidth: 1400, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{i18n.reconciliation.title}</h1>

      {/* Import Section */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{i18n.reconciliation.importFile}</h3>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <select
            value={cuentaId}
            onChange={(e) => setCuentaId(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "inherit" }}
          >
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>{c.banco} - {c.numero}</option>
            ))}
          </select>
          <select
            value={formato}
            onChange={(e) => setFormato(e.target.value)}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.03)", color: "inherit" }}
          >
            <option value="OFX">OFX/QFX</option>
            <option value="MT940">MT940/SWIFT</option>
            <option value="CSV_BANCO">CSV</option>
          </select>
          <input
            ref={fileRef}
            type="file"
            accept=".ofx,.qfx,.sta,.mt940,.csv"
            style={{ display: "none" }}
            onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#0ea5e9", color: "white", border: "none", cursor: "pointer", fontSize: 13, opacity: importing ? 0.5 : 1 }}
          >
            {importing ? i18n.reconciliation.importing : i18n.reconciliation.importFile}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 8 }}>{i18n.reconciliation.supportedFormats}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedImport ? "300px 1fr" : "1fr", gap: 24 }}>
        {/* Imports list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {importaciones.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>{i18n.reconciliation.noImports}</div>
          ) : (
            importaciones.map((imp) => (
              <div
                key={imp.id}
                onClick={() => loadTransacciones(imp.id)}
                style={{
                  background: selectedImport === imp.id ? "rgba(14,165,233,0.08)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${selectedImport === imp.id ? "rgba(14,165,233,0.3)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 10, padding: 14, cursor: "pointer",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>{imp.archivo_nombre}</div>
                <div style={{ fontSize: 11, color: "#94a3b8" }}>
                  {imp.formato} | {imp.registros_conciliados}/{imp.registros_importados} {i18n.reconciliation.matched.toLowerCase()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Transactions */}
        {selectedImport && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                  <th style={{ padding: "8px", textAlign: "left", fontSize: 12, color: "#64748b" }}>{i18n.common.date}</th>
                  <th style={{ padding: "8px", textAlign: "left", fontSize: 12, color: "#64748b" }}>{i18n.reconciliation.bankTransactions}</th>
                  <th style={{ padding: "8px", textAlign: "right", fontSize: 12, color: "#64748b" }}>{i18n.common.total}</th>
                  <th style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{i18n.reconciliation.matchConfidence}</th>
                  <th style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{i18n.common.status}</th>
                  <th style={{ padding: "8px", textAlign: "center", fontSize: 12, color: "#64748b" }}>{i18n.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {transacciones.map((t) => (
                  <tr key={t.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px", fontSize: 13 }}>{t.fecha}</td>
                    <td style={{ padding: "8px", fontSize: 13 }}>
                      {t.descripcion}
                      {t.movimiento_match_desc && (
                        <div style={{ fontSize: 11, color: "#0ea5e9", marginTop: 2 }}>{t.movimiento_match_desc}</div>
                      )}
                    </td>
                    <td style={{ padding: "8px", textAlign: "right", fontFamily: "monospace", fontWeight: 600, color: Number(t.monto) >= 0 ? "#10b981" : "#ef4444" }}>
                      {fmt.formatCurrency(Number(t.monto))}
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      {Number(t.confianza_match) > 0 && (
                        <span style={{ fontSize: 12, fontFamily: "monospace" }}>{(Number(t.confianza_match) * 100).toFixed(0)}%</span>
                      )}
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, background: `${estadoColor(t.estado)}22`, color: estadoColor(t.estado) }}>
                        {estadoLabel(t.estado)}
                      </span>
                    </td>
                    <td style={{ padding: "8px", textAlign: "center" }}>
                      {t.estado === "PENDIENTE" && t.movimiento_match_desc && (
                        <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                          <button onClick={() => confirmarMatch(t.id)} style={{ padding: "4px 8px", borderRadius: 6, background: "#10b981", color: "white", border: "none", cursor: "pointer", fontSize: 11 }}>
                            {i18n.reconciliation.acceptMatch}
                          </button>
                          <button onClick={() => rechazarMatch(t.id)} style={{ padding: "4px 8px", borderRadius: 6, background: "transparent", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 11 }}>
                            {i18n.reconciliation.rejectMatch}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
