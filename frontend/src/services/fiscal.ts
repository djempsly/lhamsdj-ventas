import api from "@/lib/axios";

export const fiscalService = {
  // Reportes
  getPreview: (tipo: '606' | '607', year: number, month: number) => 
    api.get(`/reportes-fiscales/preview/?tipo=${tipo}&year=${year}&month=${month}`),
    
  exportar: (tipo: '606' | '607', year: number, month: number) => 
    api.get(`/reportes-fiscales/export/?tipo=${tipo}&year=${year}&month=${month}`, { responseType: 'blob' }),

  // e-CF
  emitirECF: (ventaId: string) => 
    api.post(`/ventas/${ventaId}/emitir-ecf/`),
};

export const posService = {
  buscarProducto: (query: string) => api.get(`/productos/buscar/?q=${query}`),
  crearVenta: (ventaData: any) => api.post('/ventas/', ventaData),
  getDashboard: () => api.get('/ventas/dashboard/'),
};

export const inventoryService = {
  getProductos: () => api.get('/productos/'),
  getStockBajo: () => api.get('/productos/stock_bajo/'),
};
