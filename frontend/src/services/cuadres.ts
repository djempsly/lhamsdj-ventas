import api from "@/lib/axios";

export const cuadreService = {
  getAll: () => api.get('/cuadres/'),
  getById: (id: string) => api.get(`/cuadres/${id}/`),
  crear: (data: Record<string, unknown>) => api.post('/cuadres/', data),
  actualizar: (id: string, data: Record<string, unknown>) => api.put(`/cuadres/${id}/`, data),
};
