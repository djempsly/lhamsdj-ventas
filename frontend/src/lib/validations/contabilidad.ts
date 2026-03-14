import { z } from 'zod';

const lineaAsientoSchema = z.object({
  cuenta: z.string().min(1, 'Cuenta requerida'),
  debe: z.coerce.number()
    .min(0, 'Monto debe ser mayor o igual a 0')
    .default(0),
  haber: z.coerce.number()
    .min(0, 'Monto haber debe ser mayor o igual a 0')
    .default(0),
});

export const asientoSchema = z.object({
  descripcion: z.string().min(1, 'Descripcion requerida'),
  fecha: z.string().min(1, 'Fecha requerida'),
  tipo: z.enum(['DIARIO', 'AJUSTE', 'CIERRE', 'APERTURA'], {
    message: 'Seleccione tipo de asiento',
  }),
  lineas: z.array(lineaAsientoSchema).min(2, 'Debe tener al menos 2 lineas contables'),
}).superRefine((data, ctx) => {
  const totalDebe = data.lineas.reduce((sum, linea) => sum + linea.debe, 0);
  const totalHaber = data.lineas.reduce((sum, linea) => sum + linea.haber, 0);

  if (Math.abs(totalDebe - totalHaber) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `El asiento no esta cuadrado. Total debe (${totalDebe.toFixed(2)}) no es igual al total haber (${totalHaber.toFixed(2)})`,
      path: ['lineas'],
    });
  }
});

export type AsientoFormData = z.infer<typeof asientoSchema>;
