import api from "@/lib/axios";

export const monedasService = {
  getAll: () => api.get('/monedas/'),
};

export const tasasCambioService = {
  getAll: (params?: Record<string, string>) => api.get('/tasas-cambio/', { params }),
  create: (data: Record<string, unknown>) => api.post('/tasas-cambio/', data),
  actual: () => api.get('/tasas-cambio/actual/'),
};
