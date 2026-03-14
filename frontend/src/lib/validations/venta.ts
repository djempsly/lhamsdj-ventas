import { z } from 'zod';

const detalleVentaSchema = z.object({
  producto: z.string().min(1, 'Producto requerido'),
  cantidad: z.coerce.number({
    message: 'Cantidad debe ser un numero',
  }).positive('Cantidad debe ser mayor a 0'),
  precio_unitario: z.coerce.number({
    message: 'Precio unitario debe ser un numero',
  }).positive('Precio unitario debe ser mayor a 0'),
  descuento: z.coerce.number()
    .min(0, 'Descuento no puede ser negativo')
    .default(0),
});

export const ventaSchema = z.object({
  tipo_pago: z.enum(['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'MIXTO', 'CREDITO'], {
    message: 'Seleccione tipo de pago',
  }),
  tipo_ncf: z.enum(['B01', 'B02', 'B14', 'B15']).optional().default('B02'),
  cliente: z.string().optional().or(z.literal('')),
  detalles: z.array(detalleVentaSchema).min(1, 'Debe agregar al menos un producto'),
  monto_pagado: z.coerce.number()
    .min(0, 'Monto pagado no puede ser negativo')
    .default(0),
  descuento_global: z.coerce.number()
    .min(0, 'Descuento global no puede ser negativo')
    .default(0),
  notas: z.string()
    .max(500, 'Notas muy largas (max 500)')
    .optional()
    .or(z.literal('')),
}).superRefine((data, ctx) => {
  if (data.tipo_ncf && data.tipo_ncf !== 'B02') {
    if (!data.cliente || data.cliente.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Cliente requerido para comprobantes fiscales tipo ' + data.tipo_ncf,
        path: ['cliente'],
      });
    }
  }
});

export type VentaFormData = z.infer<typeof ventaSchema>;
