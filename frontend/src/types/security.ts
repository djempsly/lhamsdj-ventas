export interface LoginResponse {
  requires_mfa?: boolean;
  session_token?: string;
  usuario?: UsuarioInfo;
  negocio?: NegocioInfo;
}

export interface UsuarioInfo {
  id: string;
  username: string;
  email: string;
  nombre: string;
  rol: string;
  two_factor_enabled: boolean;
  forzar_cambio_password: boolean;
  password_expirado: boolean;
  permisos: {
    puede_crear_productos: boolean;
    puede_editar_precios: boolean;
    puede_ver_costos: boolean;
    puede_hacer_descuentos: boolean;
    puede_anular_ventas: boolean;
    puede_ver_reportes: boolean;
  };
}

export interface NegocioInfo {
  id: string;
  nombre: string;
  pais: string;
}

export interface MFASetupResponse {
  secret: string;
  qr_code: string;
  uri: string;
}

export interface SesionActiva {
  id: string;
  ip_address: string;
  user_agent: string;
  creado_en: string;
  ultimo_uso: string;
}

export interface ApiKeyResponse {
  id: string;
  nombre: string;
  key: string;
  prefix: string;
  scopes: string[];
  detail: string;
}

export interface ApiKeyInfo {
  id: string;
  nombre: string;
  key_prefix: string;
  scopes: string[];
  activa: boolean;
  ultimo_uso: string | null;
  expira_en: string | null;
  creado_por: string;
  creado_por_nombre: string;
  creado_en: string;
}

export interface AlertaSeguridad {
  id: string;
  tipo: string;
  severidad: "BAJA" | "MEDIA" | "ALTA" | "CRITICA";
  titulo: string;
  descripcion: string;
  usuario: string | null;
  usuario_nombre: string;
  ip_address: string | null;
  datos: Record<string, unknown>;
  leida: boolean;
  resuelta: boolean;
  creado_en: string;
}

export interface AuditLogEntry {
  id: string;
  usuario: string | null;
  usuario_nombre: string;
  accion: string;
  modelo: string;
  objeto_id: string;
  descripcion: string;
  datos_anteriores: Record<string, unknown> | null;
  datos_nuevos: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string;
  sesion_id: string;
  duracion_ms: number | null;
  resultado: "SUCCESS" | "FAILED";
  fecha: string;
}

export interface ConfirmacionTransaccion {
  id: string;
  tipo: string;
  objeto_id: string;
  monto: string;
  solicitado_por: string;
  solicitado_por_nombre: string;
  confirmado_por: string | null;
  confirmado_por_nombre: string;
  estado: "PENDIENTE" | "APROBADA" | "RECHAZADA" | "EXPIRADA";
  expira_en: string;
  creado_en: string;
}

export interface LicenciaInfo {
  valida: boolean;
  tipo: string;
  detalle: string;
  max_usuarios?: number;
  max_sucursales?: number;
  fecha_fin?: string;
}
