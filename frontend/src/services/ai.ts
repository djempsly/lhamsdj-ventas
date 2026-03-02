import api from "@/lib/axios";

export const analisisAIService = {
  getAll: () => api.get('/analisis-ai/'),
  getById: (id: string) => api.get(`/analisis-ai/${id}/`),
};
