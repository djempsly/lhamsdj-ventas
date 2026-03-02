import api from "@/lib/axios";

export const ventaService = {
  getAll: (params?: Record<string, string>) => api.get('/ventas/', { params }),
  getById: (id: string) => api.get(`/ventas/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/ventas/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/ventas/${id}/`, data),
  dashboard: () => api.get('/ventas/dashboard/'),
  emitirECF: (id: string) => api.post(`/ventas/${id}/emitir-ecf/`),
  anular: (id: string) => api.post(`/ventas/${id}/anular/`),
};

export const exportService = {
  ventasExcel: (desde?: string, hasta?: string) =>
    api.get('/export/ventas-excel/', { params: { desde, hasta }, responseType: 'blob' }),
  comprasExcel: () =>
    api.get('/export/compras-excel/', { responseType: 'blob' }),
};
