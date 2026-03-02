import api from "@/lib/axios";

export const negocioService = {
  getAll: () => api.get('/negocios/'),
  getById: (id: string) => api.get(`/negocios/${id}/`),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/negocios/${id}/`, data),
};

export const sucursalService = {
  getAll: () => api.get('/sucursales/'),
  getById: (id: string) => api.get(`/sucursales/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/sucursales/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/sucursales/${id}/`, data),
  eliminar: (id: string) => api.delete(`/sucursales/${id}/`),
};

export const categoriaService = {
  getAll: () => api.get('/categorias/'),
  crear: (data: Record<string, unknown>) => api.post('/categorias/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/categorias/${id}/`, data),
  eliminar: (id: string) => api.delete(`/categorias/${id}/`),
};
