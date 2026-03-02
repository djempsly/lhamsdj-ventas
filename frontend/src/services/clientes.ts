import api from "@/lib/axios";

export const clienteService = {
  getAll: () => api.get('/clientes/'),
  getById: (id: string) => api.get(`/clientes/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/clientes/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/clientes/${id}/`, data),
  desactivar: (id: string) => api.patch(`/clientes/${id}/`, { activo: false }),
  eliminar: (id: string) => api.delete(`/clientes/${id}/`),
};
