import api from "@/lib/axios";

export const cuentaContableService = {
  getAll: () => api.get('/cuentas-contables/'),
  getById: (id: string) => api.get(`/cuentas-contables/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/cuentas-contables/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/cuentas-contables/${id}/`, data),
  eliminar: (id: string) => api.delete(`/cuentas-contables/${id}/`),
};
