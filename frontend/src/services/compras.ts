import api from "@/lib/axios";

export const comprasService = {
  getAll: () => api.get("/compras/"),
  getById: (id: string) => api.get(`/compras/${id}/`),
  create: (data: any) => api.post("/compras/", data),
  update: (id: string, data: any) => api.put(`/compras/${id}/`, data),
  delete: (id: string) => api.delete(`/compras/${id}/`),
  recibir: (id: string) => api.post(`/compras/${id}/recibir/`),
};
