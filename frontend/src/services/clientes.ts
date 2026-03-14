import api from "@/lib/axios";

export const clienteService = {
  getAll: (params?: Record<string, string | number>) => api.get('/clientes/', { params }),
  getById: (id: string | number) => api.get(`/clientes/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/clientes/', data),
  actualizar: (id: string | number, data: Record<string, unknown>) => api.put(`/clientes/${id}/`, data),
  desactivar: (id: string | number) => api.patch(`/clientes/${id}/`, { activo: false }),
  eliminar: (id: string | number) => api.delete(`/clientes/${id}/`),
  exportCSV: (params?: Record<string, string>) => api.get('/clientes/export/', { params, responseType: 'blob' }),
};
