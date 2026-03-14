import { z } from 'zod';

export const productoSchema = z.object({
  nombre: z.string()
    .min(2, 'Nombre debe tener al menos 2 caracteres')
    .max(200, 'Nombre muy largo (max 200)'),
  codigo_interno: z.string()
    .max(50, 'Codigo interno muy largo (max 50)')
    .optional()
    .or(z.literal('')),
  sku: z.string()
    .max(50, 'SKU muy largo (max 50)')
    .optional()
    .or(z.literal('')),
  precio_venta: z.coerce.number({
    message: 'Precio de venta debe ser un numero',
  }).positive('Precio de venta debe ser mayor a 0'),
  precio_costo: z.coerce.number({
    message: 'Precio de costo debe ser un numero',
  }).positive('Precio de costo debe ser mayor a 0'),
  stock_minimo: z.coerce.number()
    .min(0, 'Stock minimo debe ser mayor o igual a 0')
    .default(0),
  stock_maximo: z.coerce.number()
    .min(0, 'Stock maximo debe ser mayor o igual a 0')
    .default(0),
  tasa_impuesto: z.coerce.number().refine(
    (val) => [0, 16, 18].includes(val),
    { message: 'Tasa de impuesto debe ser 0%, 16% o 18%' }
  ),
  unidad_medida: z.string().min(1, 'Unidad de medida requerida'),
}).superRefine((data, ctx) => {
  if (data.precio_costo > data.precio_venta) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Precio de costo no puede ser mayor al precio de venta',
      path: ['precio_costo'],
    });
  }
  if (data.stock_maximo > 0 && data.stock_maximo < data.stock_minimo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Stock maximo debe ser mayor o igual al stock minimo',
      path: ['stock_maximo'],
    });
  }
});

export type ProductoFormData = z.infer<typeof productoSchema>;
