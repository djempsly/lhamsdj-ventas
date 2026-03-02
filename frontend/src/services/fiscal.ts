import api from "@/lib/axios";

export const fiscalService = {
  getPreview: (tipo: '606' | '607', year: number, month: number) =>
    api.get(`/reportes-fiscales/preview/?tipo=${tipo}&year=${year}&month=${month}`),

  exportar: (tipo: '606' | '607', year: number, month: number) =>
    api.get(`/reportes-fiscales/export/?tipo=${tipo}&year=${year}&month=${month}`, { responseType: 'blob' }),

  emitirECF: (ventaId: string) =>
    api.post(`/ventas/${ventaId}/emitir-ecf/`),
};

export const posService = {
  buscarProducto: (query: string) => {
    const q = encodeURIComponent(query.trim().substring(0, 100));
    return api.get(`/productos/buscar/?q=${q}`);
  },
  crearVenta: (ventaData: Record<string, unknown>) => api.post('/ventas/', ventaData),
  getDashboard: () => api.get('/ventas/dashboard/'),
};

export const inventoryService = {
  getProductos: () => api.get('/productos/'),
  getStockBajo: () => api.get('/productos/stock_bajo/'),
};
