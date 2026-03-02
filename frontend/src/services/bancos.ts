import api from "@/lib/axios";

export const bancosService = {
  getCuentas: () => api.get("/cuentas-bancarias/"),
  getCuenta: (id: string) => api.get(`/cuentas-bancarias/${id}/`),
  createCuenta: (data: any) => api.post("/cuentas-bancarias/", data),
  updateCuenta: (id: string, data: any) => api.put(`/cuentas-bancarias/${id}/`, data),
  getMovimientos: (cuentaId: string) => api.get(`/cuentas-bancarias/${cuentaId}/movimientos/`),
  importarMovimientos: (cuentaId: string, formData: FormData) =>
    api.post(`/cuentas-bancarias/${cuentaId}/importar-movimientos/`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  conciliar: (cuentaId: string, data: any) =>
    api.post(`/cuentas-bancarias/${cuentaId}/conciliar/`, data),
};

export const contabilidadService = {
  getPeriodos: () => api.get("/periodos-contables/"),
  createPeriodo: (data: any) => api.post("/periodos-contables/", data),
  cerrarPeriodo: (id: string) => api.post(`/periodos-contables/${id}/cerrar/`),
  getBalanceGeneral: (fecha?: string) =>
    api.get("/cuentas-contables/balance-general/", { params: fecha ? { fecha } : {} }),
  getEstadoResultados: (desde: string, hasta: string) =>
    api.get("/cuentas-contables/estado-resultados/", { params: { desde, hasta } }),
};
