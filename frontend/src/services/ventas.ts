import api from "@/lib/axios";

export const ventaService = {
  getAll: () => api.get('/ventas/'),
  getById: (id: string) => api.get(`/ventas/${id}/`),
};
