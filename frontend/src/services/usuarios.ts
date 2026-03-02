import api from "@/lib/axios";

export const usuarioService = {
  getAll: () => api.get('/usuarios/'),
  getById: (id: string) => api.get(`/usuarios/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/usuarios/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/usuarios/${id}/`, data),
  eliminar: (id: string) => api.delete(`/usuarios/${id}/`),
};
