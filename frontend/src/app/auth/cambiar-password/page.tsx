"use client";
import { useState } from "react";
import { securityService } from "@/services/security";

export default function CambiarPasswordPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const validatePassword = (pwd: string): string[] => {
    const errors: string[] = [];
    if (pwd.length < 12) errors.push("Minimo 12 caracteres");
    if (!/[A-Z]/.test(pwd)) errors.push("Al menos una mayuscula");
    if (!/[a-z]/.test(pwd)) errors.push("Al menos una minuscula");
    if (!/\d/.test(pwd)) errors.push("Al menos un numero");
    if (!/[!@#$%^&*()_+\-=[\]{}|;:'",.<>?/\\`~]/.test(pwd))
      errors.push("Al menos un caracter especial");
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Las contrasenas no coinciden");
      return;
    }

    const validationErrors = validatePassword(newPassword);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(". "));
      return;
    }

    setLoading(true);
    try {
      await securityService.changePassword(oldPassword, newPassword);
      setSuccess(true);
      localStorage.removeItem("usuario");
      setTimeout(() => {
        window.location.href = "/";
      }, 2000);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(
        axiosErr?.response?.data?.detail || "Error al cambiar la contrasena"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#03080f",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "rgba(10,18,35,0.85)",
          border: "1px solid rgba(56,189,248,0.08)",
          borderRadius: "28px",
          padding: "48px 40px",
          backdropFilter: "blur(24px)",
        }}
      >
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "24px",
            fontWeight: 700,
            color: "#e2eaf5",
            marginBottom: "6px",
          }}
        >
          Cambiar Contrasena
        </h2>
        <p style={{ fontSize: "13px", color: "#334155", marginBottom: "36px" }}>
          Su contrasena ha expirado o debe ser cambiada
        </p>

        {success ? (
          <div
            style={{
              background: "rgba(34,197,94,0.08)",
              border: "1px solid rgba(34,197,94,0.18)",
              borderRadius: "10px",
              padding: "16px",
              color: "#86efac",
              fontSize: "14px",
            }}
          >
            Contrasena actualizada. Redirigiendo al login...
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.18)",
                  borderRadius: "10px",
                  padding: "11px 14px",
                  fontSize: "13px",
                  color: "#fca5a5",
                  marginBottom: "18px",
                }}
              >
                {error}
              </div>
            )}

            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#475569",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  marginBottom: "8px",
                }}
              >
                Contrasena actual
              </label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  padding: "13px 16px",
                  fontSize: "14px",
                  color: "#cbd5e1",
                  outline: "none",
                }}
              />
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#475569",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  marginBottom: "8px",
                }}
              >
                Nueva contrasena
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  padding: "13px 16px",
                  fontSize: "14px",
                  color: "#cbd5e1",
                  outline: "none",
                }}
              />
              <p
                style={{
                  fontSize: "11px",
                  color: "#334155",
                  marginTop: "6px",
                }}
              >
                Min 12 chars, mayuscula, minuscula, numero, caracter especial
              </p>
            </div>

            <div style={{ marginBottom: "18px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "11px",
                  fontWeight: 600,
                  color: "#475569",
                  textTransform: "uppercase" as const,
                  letterSpacing: "0.1em",
                  marginBottom: "8px",
                }}
              >
                Confirmar nueva contrasena
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={12}
                style={{
                  width: "100%",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "12px",
                  padding: "13px 16px",
                  fontSize: "14px",
                  color: "#cbd5e1",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background:
                  "linear-gradient(135deg, #1d4ed8 0%, #0ea5e9 100%)",
                border: "none",
                borderRadius: "12px",
                padding: "14px",
                fontSize: "15px",
                fontWeight: 700,
                color: "white",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.65 : 1,
              }}
            >
              {loading ? "Actualizando..." : "Cambiar Contrasena"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
