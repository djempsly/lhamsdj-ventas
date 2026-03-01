from django.db.models import Sum, Value, F, CharField
from django.db.models.functions import Concat, Cast
from ..models import Venta, Compra, Negocio

class ReporteFiscalGenerator:
    """
    Generador de datos para reportes fiscales DGII (606, 607).
    """
    
    def __init__(self, negocio_id):
        self.negocio_id = negocio_id

    def generar_607(self, year, month):
        """
        Reporte de Ventas de Bienes y Servicios (607).
        """
        ventas = Venta.objects.filter(
            negocio_id=self.negocio_id,
            fecha__year=year,
            fecha__month=month,
            estado='COMPLETADA'
        ).select_related('cliente')

        reporte = []
        for v in ventas:
            rnc_cedula = v.cliente.numero_documento if v.cliente else "000000000"
            tipo_id = "1" if v.cliente and v.cliente.tipo_documento == 'RNC' else "2"
            
            linea = {
                "RNC_Cedula": rnc_cedula.replace('-', ''),
                "Tipo_Id": tipo_id,
                "NCF": v.ncf,
                "NCF_Modificado": "", # Para notas de crédito
                "Tipo_Ingreso": "01", # Operaciones
                "Fecha_Comprobante": v.fecha.strftime('%Y%m%d'),
                "Fecha_Retencion": "",
                "Monto_Facturado": float(v.subtotal + v.total_impuestos),
                "ITBIS_Facturado": float(v.total_impuestos),
                "ITBIS_Retenido": 0.0,
                "ITBIS_Percibido": 0.0,
                "Retencion_Renta": 0.0,
                "ISR_Percibido": 0.0,
                "Impuesto_Selectivo": 0.0,
                "Otros_Impuestos": 0.0,
                "Propina_Legal": 0.0,
                "Efectivo": float(v.monto_pagado) if v.tipo_pago == 'EFECTIVO' else 0.0,
                "Cheque_Transferencia": float(v.monto_pagado) if v.tipo_pago in ['CHEQUE', 'TRANSFERENCIA'] else 0.0,
                "Tarjeta": float(v.monto_pagado) if v.tipo_pago == 'TARJETA' else 0.0,
                "Venta_Credito": float(v.monto_pagado) if v.tipo_pago == 'CREDITO' else 0.0,
            }
            reporte.append(linea)
            
        return reporte

    def generar_606(self, year, month):
        """
        Reporte de Compras de Bienes y Servicios (606).
        """
        compras = Compra.objects.filter(
            negocio_id=self.negocio_id,
            fecha__year=year,
            fecha__month=month,
            estado='RECIBIDA' # Solo compras confirmadas
        ).select_related('proveedor')

        reporte = []
        for c in compras:
            linea = {
                "RNC_Cedula": c.proveedor.identificacion_fiscal.replace('-', ''),
                "Tipo_Id": "1", # Asumimos RNC por defecto para proveedores
                "Tipo_Bienes_Servicios": "02", # Gastos por trabajo, suministros y servicios (Default)
                "NCF": c.ncf_proveedor,
                "NCF_Modificado": "",
                "Fecha_Comprobante": c.fecha.strftime('%Y%m%d'),
                "Fecha_Pago": c.fecha.strftime('%Y%m%d'), # Simplificado
                "Monto_Servicios": 0.0,
                "Monto_Bienes": float(c.subtotal), # Asumiendo bienes por defecto
                "Total_Facturado": float(c.total),
                "ITBIS_Facturado": float(c.total_impuestos),
                "ITBIS_Retenido": 0.0, # Lógica pendiente según Configuración Proveedor
                "ITBIS_Sujeto_Proporcionalidad": 0.0,
                "ITBIS_Llevado_Costo": 0.0,
                "ITBIS_Por_Adelantar": float(c.total_impuestos),
                "ISR_Percibido": 0.0,
                "Tipo_Retencion": "",
                "Monto_Retencion_Renta": 0.0,
                "ISR_Retencion": 0.0,
                "Impuesto_Selectivo": 0.0,
                "Otros_Impuestos": 0.0,
                "Propina_Legal": 0.0,
                "Forma_Pago": "01" # 01: Efectivo, ajustar según modelo Compra (si tuviera)
            }
            reporte.append(linea)
            
        return reporte
