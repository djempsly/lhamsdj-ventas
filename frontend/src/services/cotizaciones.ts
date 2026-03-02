import api from "@/lib/axios";

export const cotizacionesService = {
  getAll: (estado?: string) => api.get('/cotizaciones/', { params: { estado } }),
  getById: (id: string) => api.get(`/cotizaciones/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/cotizaciones/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/cotizaciones/${id}/`, data),
  delete: (id: string) => api.delete(`/cotizaciones/${id}/`),
  enviar: (id: string) => api.post(`/cotizaciones/${id}/enviar/`),
  aceptar: (id: string) => api.post(`/cotizaciones/${id}/aceptar/`),
  facturar: (id: string) => api.post(`/cotizaciones/${id}/facturar/`),
};

export const ordenesCompraService = {
  getAll: (estado?: string) => api.get('/ordenes-compra/', { params: { estado } }),
  getById: (id: string) => api.get(`/ordenes-compra/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/ordenes-compra/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/ordenes-compra/${id}/`, data),
  aprobar: (id: string) => api.post(`/ordenes-compra/${id}/aprobar/`),
  enviar: (id: string) => api.post(`/ordenes-compra/${id}/enviar/`),
  convertirCompra: (id: string) => api.post(`/ordenes-compra/${id}/convertir-compra/`),
};
