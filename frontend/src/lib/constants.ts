// Provincias de República Dominicana
export const PROVINCIAS_RD = [
  { codigo: '01', nombre: 'Distrito Nacional' },
  { codigo: '02', nombre: 'Azua' },
  { codigo: '03', nombre: 'Baoruco' },
  { codigo: '04', nombre: 'Barahona' },
  { codigo: '05', nombre: 'Dajabón' },
  { codigo: '06', nombre: 'Duarte' },
  { codigo: '07', nombre: 'Elías Piña' },
  { codigo: '08', nombre: 'El Seibo' },
  { codigo: '09', nombre: 'Espaillat' },
  { codigo: '10', nombre: 'Hato Mayor' },
  { codigo: '11', nombre: 'Hermanas Mirabal' },
  { codigo: '12', nombre: 'Independencia' },
  { codigo: '13', nombre: 'La Altagracia' },
  { codigo: '14', nombre: 'La Romana' },
  { codigo: '15', nombre: 'La Vega' },
  { codigo: '16', nombre: 'María Trinidad Sánchez' },
  { codigo: '17', nombre: 'Monseñor Nouel' },
  { codigo: '18', nombre: 'Monte Cristi' },
  { codigo: '19', nombre: 'Monte Plata' },
  { codigo: '20', nombre: 'Pedernales' },
  { codigo: '21', nombre: 'Peravia' },
  { codigo: '22', nombre: 'Puerto Plata' },
  { codigo: '23', nombre: 'Samaná' },
  { codigo: '24', nombre: 'San Cristóbal' },
  { codigo: '25', nombre: 'San José de Ocoa' },
  { codigo: '26', nombre: 'San Juan' },
  { codigo: '27', nombre: 'San Pedro de Macorís' },
  { codigo: '28', nombre: 'Sánchez Ramírez' },
  { codigo: '29', nombre: 'Santiago' },
  { codigo: '30', nombre: 'Santiago Rodríguez' },
  { codigo: '31', nombre: 'Santo Domingo' },
  { codigo: '32', nombre: 'Valverde' },
];

// Tipos de Comprobantes Fiscales (NCF)
export const TIPOS_NCF = [
  { codigo: 'B01', nombre: 'Crédito Fiscal' },
  { codigo: 'B02', nombre: 'Consumidor Final' },
  { codigo: 'B14', nombre: 'Régimen Especial' },
  { codigo: 'B15', nombre: 'Gubernamental' },
  { codigo: 'B11', nombre: 'Comprobante de Compras' },
];

// Roles del sistema
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN_NEGOCIO: 'ADMIN_NEGOCIO',
  GERENTE: 'GERENTE',
  CONTADOR: 'CONTADOR',
  CAJERO: 'CAJERO',
  VENDEDOR: 'VENDEDOR',
  ALMACEN: 'ALMACEN',
  AUDITOR: 'AUDITOR',
  INVENTARIO: 'INVENTARIO',
} as const;

// Roles con acceso al POS
export const ROLES_POS_ACCESS = [
  ROLES.CAJERO,
  ROLES.VENDEDOR,
  ROLES.GERENTE,
  ROLES.ADMIN_NEGOCIO,
  ROLES.SUPER_ADMIN,
];

// Roles administrativos
export const ROLES_ADMIN = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_NEGOCIO,
];

// Roles que pueden editar crédito
export const ROLES_CREDIT_EDIT = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_NEGOCIO,
  ROLES.GERENTE,
];

// Tasas de ITBIS
export const TASAS_ITBIS = [
  { valor: 0, label: 'Exento (0%)' },
  { valor: 16, label: '16%' },
  { valor: 18, label: '18%' },
];

// Tipos de documento de identidad
export const TIPOS_DOCUMENTO = ['CEDULA', 'RNC', 'PASAPORTE', 'OTRO'] as const;

// Tipos de cliente
export const TIPOS_CLIENTE = ['FINAL', 'CREDITO', 'GUBERNAMENTAL', 'ESPECIAL'] as const;

// Tipos de pago
export const TIPOS_PAGO = ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO', 'CREDITO'] as const;

// Formato de moneda dominicana (DOP)
export const MONEDA_FORMAT = new Intl.NumberFormat('es-DO', {
  style: 'currency',
  currency: 'DOP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Formatear número como moneda RD$
export function formatCurrency(n: number): string {
  return MONEDA_FORMAT.format(n);
}

// Formatear fecha ISO a formato legible
export function formatDate(d: string): string {
  if (!d) return '';
  const fecha = new Date(d);
  return fecha.toLocaleDateString('es-DO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Denominaciones de billetes y monedas de RD
export const DENOMINACIONES_RD = [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];
