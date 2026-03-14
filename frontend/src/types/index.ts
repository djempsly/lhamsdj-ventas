// Tipos compartidos del sistema de ventas

export interface Cliente {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  tipo_cliente: string;
  limite_credito: number;
  balance: number;
  activo: boolean;
  creado_en: string;
  consentimiento_datos: boolean;
  fecha_consentimiento: string | null;
  vendedor_asignado?: number | null;
}

export interface Producto {
  id: number;
  codigo_barras: string;
  codigo_interno: string;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  precio_mayorista?: number | null;
  stock_actual: number;
  stock_minimo: number;
  stock_maximo: number;
  aplica_impuesto: boolean;
  tasa_impuesto: number;
  categoria: string;
  activo: boolean;
  unidad_medida: string;
  imagen?: string | null;
}

export interface DetalleVenta {
  id: number;
  producto: number;
  producto_nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  subtotal: number;
  impuesto: number;
  total: number;
}

export interface Venta {
  id: number;
  numero: string;
  cajero: number;
  cliente: number | null;
  sucursal: number;
  subtotal: number;
  descuento: number;
  subtotal_con_descuento: number;
  total_impuestos: number;
  total: number;
  tipo_pago: string;
  monto_pagado: number;
  cambio: number;
  estado: string;
  tipo_ncf: string;
  ncf: string;
  notas: string;
  creado_en: string;
}

export interface CuadreCaja {
  id: number;
  cajero: number;
  sucursal: number;
  monto_apertura: number;
  monto_cierre: number;
  diferencia: number;
  estado: string;
  notas: string;
  abierto_en: string;
  cerrado_en: string | null;
  denominaciones?: Record<string, number> | null;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface DashboardStats {
  total_ventas: number;
  total_transacciones: number;
  ganancia_estimada: number;
  ticket_promedio: number;
  ventas_semana: number;
  ventas_mes: number;
  comparacion_periodo_anterior?: {
    ventas: number;
    transacciones: number;
    porcentaje_cambio: number;
  } | null;
}

export interface Usuario {
  id: number;
  username: string;
  nombre: string;
  email: string;
  rol: string;
  permisos: string[];
  activo: boolean;
  sucursal?: number | null;
}
