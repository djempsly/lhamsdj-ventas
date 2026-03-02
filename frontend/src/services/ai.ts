import api from "@/lib/axios";

export const analisisAIService = {
  getAll: () => api.get('/analisis-ai/'),
  getById: (id: string) => api.get(`/analisis-ai/${id}/`),
  generar: (data: { tipo: string; dias?: number }) => api.post('/analisis-ai/generar/', data),
};
