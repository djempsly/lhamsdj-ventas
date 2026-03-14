import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Campo requerido'),
  password: z.string().min(8, 'Contrasena debe tener al menos 8 caracteres'),
});

export type LoginFormData = z.infer<typeof loginSchema>;
