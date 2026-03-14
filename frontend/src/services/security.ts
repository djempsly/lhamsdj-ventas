import api from "@/lib/axios";
import type {
  MFASetupResponse,
  SesionActiva,
  ApiKeyResponse,
  ApiKeyInfo,
  AlertaSeguridad,
  AuditLogEntry,
  ConfirmacionTransaccion,
  LicenciaInfo,
} from "@/types/security";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export const securityService = {
  // MFA / 2FA
  mfaVerify: (session_token: string, mfa_token: string) =>
    fetch(`${API_URL}/auth/mfa/verify/`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_token, mfa_token }),
    }).then((res) => res.json()),

  setup2FA: () =>
    api.post<MFASetupResponse>("/auth/2fa/setup/"),

  confirm2FA: (token: string) =>
    api.post("/auth/2fa/confirm/", { token }),

  disable2FA: (password: string) =>
    api.post("/auth/2fa/disable/", { password }),

  // Password
  changePassword: (old_password: string, new_password: string) =>
    api.post("/auth/change-password/", { old_password, new_password }),

  // Sessions
  getSessions: () =>
    api.get<SesionActiva[]>("/auth/sessions/"),

  invalidateSession: (session_id: string) =>
    api.delete("/auth/sessions/", { data: { session_id } }),

  logoutAll: () =>
    api.post("/auth/logout-all/"),

  // API Keys
  getApiKeys: () =>
    api.get<{ results: ApiKeyInfo[] }>("/seguridad/api-keys/"),

  createApiKey: (nombre: string, scopes: string[], expira_en?: string) =>
    api.post<ApiKeyResponse>("/seguridad/api-keys/", { nombre, scopes, expira_en }),

  deleteApiKey: (id: string) =>
    api.delete(`/seguridad/api-keys/${id}/`),

  // Alerts
  getAlerts: (params?: { tipo?: string; severidad?: string; no_leida?: string }) =>
    api.get<{ results: AlertaSeguridad[] }>("/seguridad/alertas/", { params }),

  markAlertRead: (id: string) =>
    api.patch(`/seguridad/alertas/${id}/`, { leida: true }),

  resolveAlert: (id: string) =>
    api.patch(`/seguridad/alertas/${id}/`, { resuelta: true }),

  // Audit Log
  getAuditLog: (params?: Record<string, string>) =>
    api.get<{ results: AuditLogEntry[] }>("/seguridad/audit-log/", { params }),

  // Confirmations
  getConfirmations: () =>
    api.get<{ results: ConfirmacionTransaccion[] }>("/seguridad/confirmaciones/"),

  approveConfirmation: (id: string) =>
    api.post(`/seguridad/confirmaciones/${id}/aprobar/`),

  rejectConfirmation: (id: string) =>
    api.post(`/seguridad/confirmaciones/${id}/rechazar/`),

  // License
  verifyLicense: () =>
    api.get<LicenciaInfo>("/licencia/verificar/"),
};
