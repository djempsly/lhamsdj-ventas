import { z } from 'zod';

// RNC digit verifier algorithm (DGII Dominican Republic)
// For 9-digit RNC (empresa) and 11-digit cedula
function validarDigitoVerificadorRNC(rnc: string): boolean {
  const digits = rnc.replace(/[-\s]/g, '');
  if (digits.length === 9) {
    // RNC empresa: weights [7,9,8,6,5,4,3,2]
    const weights = [7, 9, 8, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 8; i++) sum += parseInt(digits[i]) * weights[i];
    const remainder = sum % 11;
    const checkDigit = remainder === 0 ? 2 : remainder === 1 ? 1 : 11 - remainder;
    return parseInt(digits[8]) === checkDigit;
  }
  if (digits.length === 11) {
    // Cedula: weights [1,2,1,2,1,2,1,2,1,2]
    const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let product = parseInt(digits[i]) * weights[i];
      if (product >= 10) product = Math.floor(product / 10) + (product % 10);
      sum += product;
    }
    const checkDigit = (10 - (sum % 10)) % 10;
    return parseInt(digits[10]) === checkDigit;
  }
  return false;
}

export { validarDigitoVerificadorRNC };

export const clienteSchema = z.object({
  nombre: z.string().min(2, 'Nombre debe tener al menos 2 caracteres').max(200, 'Nombre muy largo (max 200)'),
  tipo_documento: z.enum(['CEDULA', 'RNC', 'PASAPORTE', 'OTRO'], { message: 'Seleccione tipo de documento' }),
  numero_documento: z.string().min(1, 'Numero de documento requerido').max(20, 'Documento muy largo'),
  telefono: z.string().max(20, 'Telefono muy largo').optional().or(z.literal('')),
  email: z.string().email('Email invalido').optional().or(z.literal('')),
  direccion: z.string().max(500, 'Direccion muy larga').optional().or(z.literal('')),
  tipo_cliente: z.enum(['FINAL', 'CREDITO', 'GUBERNAMENTAL', 'ESPECIAL']),
  limite_credito: z.coerce.number().min(0, 'Limite debe ser positivo').default(0),
  provincia: z.string().optional(),
}).superRefine((data, ctx) => {
  const doc = data.numero_documento.replace(/[-\s]/g, '');
  if (data.tipo_documento === 'RNC') {
    if (doc.length !== 9) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RNC debe tener 9 digitos', path: ['numero_documento'] });
    } else if (!validarDigitoVerificadorRNC(doc)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'RNC invalido (digito verificador incorrecto)', path: ['numero_documento'] });
    }
  }
  if (data.tipo_documento === 'CEDULA') {
    if (doc.length !== 11) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cedula debe tener 11 digitos', path: ['numero_documento'] });
    } else if (!validarDigitoVerificadorRNC(doc)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Cedula invalida (digito verificador incorrecto)', path: ['numero_documento'] });
    }
  }
  if (data.telefono) {
    const phoneClean = data.telefono.replace(/[-\s()]/g, '');
    if (phoneClean.length > 0 && !/^(\+?1)?(809|829|849)\d{7}$/.test(phoneClean) && !/^\d{10,15}$/.test(phoneClean)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Formato de telefono invalido', path: ['telefono'] });
    }
  }
});

export type ClienteFormData = z.infer<typeof clienteSchema>;
