from abc import ABC, abstractmethod
import csv
import io
from datetime import datetime
from django.db.models import Sum, Q
from ...models import Venta, Compra, Negocio, Pais

class FiscalStrategy(ABC):
    """
    Estrategia Base para la generación de reportes fiscales internacionales.
    Cada país debe implementar esta clase.
    """
    
    def __init__(self, negocio):
        self.negocio = negocio

    @abstractmethod
    def generar_reporte_ventas(self, year, month):
        """Devuelve una lista de diccionarios con las ventas del mes."""
        pass

    @abstractmethod
    def generar_reporte_compras(self, year, month):
        """Devuelve una lista de diccionarios con las compras del mes."""
        pass
        
    @abstractmethod
    def exportar_archivo(self, tipo_reporte, year, month):
        """Devuelve un tuple (contenido_bytes, nombre_archivo, content_type)"""
        pass

class DGIIDominicanaStrategy(FiscalStrategy):
    """
    Estrategia Fiscal para República Dominicana (DGII).
    Formatos: 606, 607, 608.
    """
    
    def generar_reporte_ventas(self, year, month):
        # Reporte 607 - Ventas de Bienes y Servicios
        ventas = Venta.objects.filter(
            negocio=self.negocio,
            fecha__year=year,
            fecha__month=month,
            estado='COMPLETADA'
        ).select_related('cliente')

        reporte = []
        for v in ventas:
            rnc_cedula = v.cliente.numero_documento if v.cliente else "000000000"
            tipo_id = "1" if v.cliente and v.cliente.tipo_documento == 'RNC' else "2"
            
            # Lógica de NCF Modificado (Notas de Crédito)
            ncf_modificado = ""
            if v.tipo_comprobante == 'B04' and v.asiento and v.asiento.referencia:
                 ncf_modificado = v.asiento.referencia # Asumiendo referencia guarda el NCF original
            
            linea = {
                "RNC_Cedula": rnc_cedula.replace('-', ''),
                "Tipo_Id": tipo_id,
                "NCF": v.ncf,
                "NCF_Modificado": ncf_modificado,
                "Tipo_Ingreso": "01", # 01: Operaciones (Default)
                "Fecha_Comprobante": v.fecha.strftime('%Y%m%d'),
                "Fecha_Retencion": "", # Pendiente: Lógica de retenciones
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
                # Bonos y Regalos (Permutas)
                "Bonos": 0.0,
                "Permutas": 0.0,
                "Otras_Formas_Ventas": float(v.monto_pagado) if v.tipo_pago == 'MIXTO' else 0.0
            }
            reporte.append(linea)
        return reporte

    def generar_reporte_compras(self, year, month):
        # Reporte 606 - Compras de Bienes y Servicios
        compras = Compra.objects.filter(
            negocio=self.negocio,
            fecha__year=year,
            fecha__month=month,
            estado='RECIBIDA'
        ).select_related('proveedor')

        reporte = []
        for c in compras:
            # Determinamos si es gasto (02) o compra (01/08/09)
            # Simplificación: Todo es Gasto de Personal (01) o Gastos Generales (02)
            # En un sistema real, esto viene del Catálogo de Cuentas o de la categoría del gasto
            tipo_bienes = "02" 
            
            linea = {
                "RNC_Cedula": c.proveedor.identificacion_fiscal.replace('-', ''),
                "Tipo_Id": "1", # Asumimos RNC por defecto
                "Tipo_Bienes_Servicios": tipo_bienes,
                "NCF": c.ncf_proveedor,
                "NCF_Modificado": "",
                "Fecha_Comprobante": c.fecha.strftime('%Y%m%d'),
                "Fecha_Pago": c.fecha.strftime('%Y%m%d'),
                "Monto_Servicios": 0.0, # Desglose pendiente
                "Monto_Bienes": float(c.subtotal),
                "Total_Facturado": float(c.total),
                "ITBIS_Facturado": float(c.total_impuestos),
                "ITBIS_Retenido": 0.0,
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
                "Forma_Pago": "01" # 01-Efectivo
            }
            reporte.append(linea)
        return reporte

    def exportar_archivo(self, tipo_reporte, year, month):
        """
        Genera el archivo TXT delimitado por pipes (|) formato DGII.
        """
        if tipo_reporte == '607':
            data = self.generar_reporte_ventas(year, month)
            filename = f"DGII_F_607_{self.negocio.identificacion_fiscal.replace('-','')}_{year}{month:02d}.txt"
            
            # Estructura del Header DGII 607:
            # 607 | RNC | Periodo | CantidadRegistros
            periodo = f"{year}{month:02d}"
            header = f"607|{self.negocio.identificacion_fiscal.replace('-','')}|{periodo}|{len(data)}"
            
            content = [header]
            for row in data:
                # Orden estricto 607
                line = "|".join([
                    str(row["RNC_Cedula"]), str(row["Tipo_Id"]), str(row["NCF"]), str(row["NCF_Modificado"]),
                    str(row["Tipo_Ingreso"]), str(row["Fecha_Comprobante"]), str(row["Fecha_Retencion"]),
                    f"{row['Monto_Facturado']:.2f}", f"{row['ITBIS_Facturado']:.2f}",
                    f"{row['ITBIS_Retenido']:.2f}", f"{row['ITBIS_Percibido']:.2f}",
                    f"{row['Retencion_Renta']:.2f}", f"{row['ISR_Percibido']:.2f}",
                    f"{row['Impuesto_Selectivo']:.2f}", f"{row['Otros_Impuestos']:.2f}",
                    f"{row['Propina_Legal']:.2f}", f"{row['Efectivo']:.2f}",
                    f"{row['Cheque_Transferencia']:.2f}", f"{row['Tarjeta']:.2f}",
                    f"{row['Venta_Credito']:.2f}", f"{row['Bonos']:.2f}",
                    f"{row['Permutas']:.2f}", f"{row['Otras_Formas_Ventas']:.2f}"
                ])
                content.append(line)
            
            return "
".join(content), filename, "text/plain"

        elif tipo_reporte == '606':
            data = self.generar_reporte_compras(year, month)
            filename = f"DGII_F_606_{self.negocio.identificacion_fiscal.replace('-','')}_{year}{month:02d}.txt"
            
            periodo = f"{year}{month:02d}"
            header = f"606|{self.negocio.identificacion_fiscal.replace('-','')}|{periodo}|{len(data)}"
            
            content = [header]
            for row in data:
                line = "|".join([
                    str(row["RNC_Cedula"]), str(row["Tipo_Id"]), str(row["Tipo_Bienes_Servicios"]),
                    str(row["NCF"]), str(row["NCF_Modificado"]), str(row["Fecha_Comprobante"]),
                    str(row["Fecha_Pago"]), f"{row['Monto_Servicios']:.2f}", f"{row['Monto_Bienes']:.2f}",
                    f"{row['Total_Facturado']:.2f}", f"{row['ITBIS_Facturado']:.2f}",
                    f"{row['ITBIS_Retenido']:.2f}", f"{row['ITBIS_Sujeto_Proporcionalidad']:.2f}",
                    f"{row['ITBIS_Llevado_Costo']:.2f}", f"{row['ITBIS_Por_Adelantar']:.2f}",
                    f"{row['ISR_Percibido']:.2f}", str(row["Tipo_Retencion"]),
                    f"{row['Monto_Retencion_Renta']:.2f}", f"{row['ISR_Retencion']:.2f}",
                    f"{row['Impuesto_Selectivo']:.2f}", f"{row['Otros_Impuestos']:.2f}",
                    f"{row['Propina_Legal']:.2f}", str(row["Forma_Pago"])
                ])
                content.append(line)

            return "
".join(content), filename, "text/plain"
        
        else:
            raise ValueError(f"Reporte {tipo_reporte} no soportado para DGII")


class FiscalStrategyFactory:
    """
    Factory para obtener la estrategia correcta según el país del negocio.
    """
    @staticmethod
    def get_strategy(negocio):
        pais_codigo = negocio.pais.codigo
        if pais_codigo == 'DOM':
            return DGIIDominicanaStrategy(negocio)
        # elif pais_codigo == 'COL': return DIANColombiaStrategy(negocio)
        # elif pais_codigo == 'MEX': return SATMexicoStrategy(negocio)
        else:
            # Default o error
            raise NotImplementedError(f"Estrategia fiscal no implementada para el país: {pais_codigo}")
