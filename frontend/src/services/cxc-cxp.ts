import api from "@/lib/axios";

export const cxcService = {
  getAll: (estado?: string) => api.get('/cuentas-por-cobrar/', { params: { estado } }),
  getById: (id: string) => api.get(`/cuentas-por-cobrar/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/cuentas-por-cobrar/', data),
  aging: () => api.get('/cuentas-por-cobrar/aging/'),
};

export const cxpService = {
  getAll: (estado?: string) => api.get('/cuentas-por-pagar/', { params: { estado } }),
  getById: (id: string) => api.get(`/cuentas-por-pagar/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/cuentas-por-pagar/', data),
  aging: () => api.get('/cuentas-por-pagar/aging/'),
};

export const pagosService = {
  getAll: () => api.get('/pagos/'),
  create: (data: Record<string, unknown>) => api.post('/pagos/', data),
};
