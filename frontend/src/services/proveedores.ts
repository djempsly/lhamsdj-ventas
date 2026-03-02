import api from "@/lib/axios";

export const proveedorService = {
  getAll: () => api.get('/proveedores/'),
  getById: (id: string) => api.get(`/proveedores/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/proveedores/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/proveedores/${id}/`, data),
  desactivar: (id: string) => api.patch(`/proveedores/${id}/`, { activo: false }),
  eliminar: (id: string) => api.delete(`/proveedores/${id}/`),
};
