import api from "@/lib/axios";

export const etapasCRMService = {
  getAll: () => api.get('/crm/etapas/'),
  create: (data: Record<string, unknown>) => api.post('/crm/etapas/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/crm/etapas/${id}/`, data),
};

export const oportunidadesService = {
  getAll: (params?: Record<string, string>) => api.get('/crm/oportunidades/', { params }),
  getById: (id: string) => api.get(`/crm/oportunidades/${id}/`),
  create: (data: Record<string, unknown>) => api.post('/crm/oportunidades/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/crm/oportunidades/${id}/`, data),
  pipeline: () => api.get('/crm/oportunidades/pipeline/'),
  moverEtapa: (id: string, etapaId: string) => api.post(`/crm/oportunidades/${id}/mover-etapa/`, { etapa_id: etapaId }),
  ganar: (id: string) => api.post(`/crm/oportunidades/${id}/ganar/`),
  perder: (id: string, razon: string) => api.post(`/crm/oportunidades/${id}/perder/`, { razon }),
};

export const actividadesCRMService = {
  getAll: (oportunidad?: string) => api.get('/crm/actividades/', { params: { oportunidad } }),
  create: (data: Record<string, unknown>) => api.post('/crm/actividades/', data),
  update: (id: string, data: Record<string, unknown>) => api.patch(`/crm/actividades/${id}/`, data),
};
