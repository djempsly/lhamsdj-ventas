import api from "@/lib/axios";

export const departamentosService = {
  getAll: () => api.get('/departamentos/'),
  create: (data: Record<string, unknown>) => api.post('/departamentos/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/departamentos/${id}/`, data),
};

export const empleadosService = {
  getAll: (estado?: string) => api.get('/empleados/', { params: { estado } }),
  getById: (id: string) => api.get(`/empleados/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/empleados/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/empleados/${id}/`, data),
};

export const nominasService = {
  getAll: () => api.get('/nominas/'),
  getById: (id: string) => api.get(`/nominas/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/nominas/', data),
  calcular: (id: string) => api.post(`/nominas/${id}/calcular/`),
  aprobar: (id: string) => api.post(`/nominas/${id}/aprobar/`),
};

export const vacacionesService = {
  getAll: () => api.get('/vacaciones/'),
  create: (data: Record<string, unknown>) => api.post('/vacaciones/', data),
  aprobar: (id: string) => api.post(`/vacaciones/${id}/aprobar/`),
};
