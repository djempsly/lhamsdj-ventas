"use client";
import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { useI18n } from "@/i18n";

interface ServiceStatus {
  name: string;
  state: string;
  fail_count: number;
  fail_max: number;
  reset_timeout: number;
}

export default function ServiciosPage() {
  const i18n = useI18n();
  const [services, setServices] = useState<Record<string, ServiceStatus>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const res = await api.get("/health/services/");
      setServices(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (key: string) => {
    try {
      await api.post("/health/services/", { service: key });
      loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const stateColor = (state: string) => {
    switch (state) {
      case "closed": return "#10b981";
      case "open": return "#ef4444";
      case "half-open": return "#f59e0b";
      default: return "#94a3b8";
    }
  };

  const stateLabel = (state: string) => {
    switch (state) {
      case "closed": return i18n.services.closed;
      case "open": return i18n.services.open;
      case "half-open": return i18n.services.halfOpen;
      default: return state;
    }
  };

  const serviceLabel = (key: string) => {
    switch (key) {
      case "dgii": return i18n.services.dgiiApi;
      case "claude": return i18n.services.claudeApi;
      case "external": return i18n.services.externalApi;
      default: return key;
    }
  };

  if (loading) return <div style={{ padding: 40, color: "#94a3b8" }}>{i18n.common.loading}</div>;

  return (
    <div style={{ padding: "24px", maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>{i18n.services.title}</h1>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {Object.entries(services).map(([key, svc]) => (
          <div key={key} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{serviceLabel(key)}</div>
                <div style={{ fontSize: 13, color: "#94a3b8" }}>{svc.name}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 12, height: 12, borderRadius: "50%",
                  background: stateColor(svc.state),
                  boxShadow: svc.state === "closed" ? `0 0 8px ${stateColor(svc.state)}` : "none",
                }} />
                <span style={{ fontWeight: 600, color: stateColor(svc.state), fontSize: 14 }}>
                  {stateLabel(svc.state)}
                </span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{i18n.services.failures}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace", color: svc.fail_count > 0 ? "#f59e0b" : "inherit" }}>
                  {svc.fail_count} / {svc.fail_max}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 2 }}>{i18n.services.resetTimeout}</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "monospace" }}>{svc.reset_timeout}s</div>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
                {svc.state !== "closed" && (
                  <button
                    onClick={() => handleReset(key)}
                    style={{ padding: "8px 20px", borderRadius: 8, background: "#0ea5e9", color: "white", border: "none", cursor: "pointer", fontSize: 13 }}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
