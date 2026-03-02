from abc import ABC, abstractmethod
from datetime import datetime
from decimal import Decimal
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
        pass

    @abstractmethod
    def generar_reporte_compras(self, year, month):
        pass

    @abstractmethod
    def exportar_archivo(self, tipo_reporte, year, month):
        pass


class DGIIDominicanaStrategy(FiscalStrategy):
    """
    Estrategia Fiscal para República Dominicana (DGII).
    Formatos: 606, 607, 608.
    """

    def generar_reporte_ventas(self, year, month):
        """Reporte 607 - Ventas de Bienes y Servicios"""
        ventas = Venta.objects.filter(
            negocio=self.negocio,
            fecha__year=year,
            fecha__month=month,
            estado__in=['COMPLETADA', 'ANULADA'],
        ).select_related('cliente', 'venta_referencia')

        reporte = []
        for v in ventas:
            rnc_cedula = v.cliente.numero_documento if v.cliente else "000000000"
            tipo_id = "1" if v.cliente and v.cliente.tipo_documento == 'RNC' else "2"

            # NCF Modificado para notas de crédito/débito
            ncf_modificado = ""
            if v.tipo_comprobante == 'B04' and v.venta_referencia:
                ncf_modificado = v.venta_referencia.ncf

            # Tipo anulación para ventas anuladas
            tipo_anulacion = ""
            if v.estado == 'ANULADA':
                tipo_anulacion = "02"  # 02 = Anulación de NCF

            # Retenciones según tipo de cliente
            itbis_retenido = Decimal('0')
            retencion_renta = Decimal('0')
            if v.cliente and v.cliente.tipo_cliente == 'CREDITO':
                # Grandes contribuyentes retienen 30% ITBIS
                itbis_retenido = v.total_impuestos * Decimal('0.30')

            linea = {
                "RNC_Cedula": rnc_cedula.replace('-', ''),
                "Tipo_Id": tipo_id,
                "NCF": v.ncf,
                "NCF_Modificado": ncf_modificado,
                "Tipo_Ingreso": "01",
                "Fecha_Comprobante": v.fecha.strftime('%Y%m%d'),
                "Fecha_Retencion": v.fecha.strftime('%Y%m%d') if itbis_retenido > 0 else "",
                "Monto_Facturado": float(v.subtotal + v.total_impuestos),
                "ITBIS_Facturado": float(v.total_impuestos),
                "ITBIS_Retenido": float(itbis_retenido),
                "ITBIS_Percibido": 0.0,
                "Retencion_Renta": float(retencion_renta),
                "ISR_Percibido": 0.0,
                "Impuesto_Selectivo": 0.0,
                "Otros_Impuestos": 0.0,
                "Propina_Legal": 0.0,
                "Efectivo": float(v.monto_pagado) if v.tipo_pago == 'EFECTIVO' else 0.0,
                "Cheque_Transferencia": float(v.monto_pagado) if v.tipo_pago in ['CHEQUE', 'TRANSFERENCIA'] else 0.0,
                "Tarjeta": float(v.monto_pagado) if v.tipo_pago == 'TARJETA' else 0.0,
                "Venta_Credito": float(v.monto_pagado) if v.tipo_pago == 'CREDITO' else 0.0,
                "Bonos": 0.0,
                "Permutas": 0.0,
                "Otras_Formas_Ventas": float(v.monto_pagado) if v.tipo_pago == 'MIXTO' else 0.0,
                "Tipo_Anulacion": tipo_anulacion,
            }
            reporte.append(linea)
        return reporte

    def generar_reporte_compras(self, year, month):
        """Reporte 606 - Compras de Bienes y Servicios"""
        compras = Compra.objects.filter(
            negocio=self.negocio,
            fecha__year=year,
            fecha__month=month,
            estado='RECIBIDA',
        ).select_related('proveedor')

        reporte = []
        for c in compras:
            tipo_bienes = c.tipo_bienes_servicios or '02'

            # Forma de pago real
            forma_pago_map = {
                'EFECTIVO': '01',
                'CHEQUE': '02',
                'TRANSFERENCIA': '03',
                'TARJETA': '04',
                'CREDITO': '05',
            }
            forma_pago = forma_pago_map.get(c.forma_pago, '01')

            # Fecha de pago real
            fecha_pago = c.fecha_pago.strftime('%Y%m%d') if c.fecha_pago else c.fecha.strftime('%Y%m%d')

            # Desglose Monto_Servicios vs Monto_Bienes
            monto_servicios = Decimal('0')
            monto_bienes = Decimal('0')
            for detalle in c.detalles.all():
                if detalle.producto.tipo == 'SERVICIO':
                    monto_servicios += detalle.subtotal
                else:
                    monto_bienes += detalle.subtotal

            # Retenciones reales
            itbis_retenido = float(c.itbis_retenido or 0)
            retencion_renta = float(c.retencion_renta or 0)
            tipo_retencion = c.tipo_retencion or ''

            linea = {
                "RNC_Cedula": c.proveedor.identificacion_fiscal.replace('-', ''),
                "Tipo_Id": "1",
                "Tipo_Bienes_Servicios": tipo_bienes,
                "NCF": c.ncf_proveedor,
                "NCF_Modificado": "",
                "Fecha_Comprobante": c.fecha.strftime('%Y%m%d'),
                "Fecha_Pago": fecha_pago,
                "Monto_Servicios": float(monto_servicios),
                "Monto_Bienes": float(monto_bienes),
                "Total_Facturado": float(c.total),
                "ITBIS_Facturado": float(c.total_impuestos),
                "ITBIS_Retenido": itbis_retenido,
                "ITBIS_Sujeto_Proporcionalidad": 0.0,
                "ITBIS_Llevado_Costo": 0.0,
                "ITBIS_Por_Adelantar": float(c.total_impuestos) - itbis_retenido,
                "ISR_Percibido": 0.0,
                "Tipo_Retencion": tipo_retencion,
                "Monto_Retencion_Renta": retencion_renta,
                "ISR_Retencion": retencion_renta,
                "Impuesto_Selectivo": 0.0,
                "Otros_Impuestos": 0.0,
                "Propina_Legal": 0.0,
                "Forma_Pago": forma_pago,
            }
            reporte.append(linea)
        return reporte

    def generar_reporte_anulaciones(self, year, month):
        """Reporte 608 - NCFs anulados del periodo."""
        ventas_anuladas = Venta.objects.filter(
            negocio=self.negocio,
            fecha__year=year,
            fecha__month=month,
            estado='ANULADA',
        ).exclude(ncf='')

        reporte = []
        for v in ventas_anuladas:
            tipo_anulacion = "02"  # 02 = Deterioro
            if v.venta_referencia:
                tipo_anulacion = "04"  # 04 = Reemplazo por NC

            linea = {
                "NCF": v.ncf,
                "Fecha_Comprobante": v.fecha.strftime('%Y%m%d'),
                "Tipo_Anulacion": tipo_anulacion,
            }
            reporte.append(linea)
        return reporte

    def exportar_archivo(self, tipo_reporte, year, month):
        """Genera el archivo TXT delimitado por pipes (|) formato DGII."""
        rnc = self.negocio.identificacion_fiscal.replace('-', '')
        periodo = f"{year}{month:02d}"

        if tipo_reporte == '607':
            data = self.generar_reporte_ventas(year, month)
            filename = f"DGII_F_607_{rnc}_{periodo}.txt"
            header = f"607|{rnc}|{periodo}|{len(data)}"

            content = [header]
            for row in data:
                line = "|".join([
                    str(row["RNC_Cedula"]), str(row["Tipo_Id"]),
                    str(row["NCF"]), str(row["NCF_Modificado"]),
                    str(row["Tipo_Ingreso"]), str(row["Fecha_Comprobante"]),
                    str(row["Fecha_Retencion"]),
                    f"{row['Monto_Facturado']:.2f}", f"{row['ITBIS_Facturado']:.2f}",
                    f"{row['ITBIS_Retenido']:.2f}", f"{row['ITBIS_Percibido']:.2f}",
                    f"{row['Retencion_Renta']:.2f}", f"{row['ISR_Percibido']:.2f}",
                    f"{row['Impuesto_Selectivo']:.2f}", f"{row['Otros_Impuestos']:.2f}",
                    f"{row['Propina_Legal']:.2f}", f"{row['Efectivo']:.2f}",
                    f"{row['Cheque_Transferencia']:.2f}", f"{row['Tarjeta']:.2f}",
                    f"{row['Venta_Credito']:.2f}", f"{row['Bonos']:.2f}",
                    f"{row['Permutas']:.2f}", f"{row['Otras_Formas_Ventas']:.2f}",
                ])
                content.append(line)

            return "\n".join(content), filename, "text/plain"

        elif tipo_reporte == '606':
            data = self.generar_reporte_compras(year, month)
            filename = f"DGII_F_606_{rnc}_{periodo}.txt"
            header = f"606|{rnc}|{periodo}|{len(data)}"

            content = [header]
            for row in data:
                line = "|".join([
                    str(row["RNC_Cedula"]), str(row["Tipo_Id"]),
                    str(row["Tipo_Bienes_Servicios"]),
                    str(row["NCF"]), str(row["NCF_Modificado"]),
                    str(row["Fecha_Comprobante"]), str(row["Fecha_Pago"]),
                    f"{row['Monto_Servicios']:.2f}", f"{row['Monto_Bienes']:.2f}",
                    f"{row['Total_Facturado']:.2f}", f"{row['ITBIS_Facturado']:.2f}",
                    f"{row['ITBIS_Retenido']:.2f}",
                    f"{row['ITBIS_Sujeto_Proporcionalidad']:.2f}",
                    f"{row['ITBIS_Llevado_Costo']:.2f}",
                    f"{row['ITBIS_Por_Adelantar']:.2f}",
                    f"{row['ISR_Percibido']:.2f}", str(row["Tipo_Retencion"]),
                    f"{row['Monto_Retencion_Renta']:.2f}",
                    f"{row['ISR_Retencion']:.2f}",
                    f"{row['Impuesto_Selectivo']:.2f}",
                    f"{row['Otros_Impuestos']:.2f}",
                    f"{row['Propina_Legal']:.2f}", str(row["Forma_Pago"]),
                ])
                content.append(line)

            return "\n".join(content), filename, "text/plain"

        elif tipo_reporte == '608':
            data = self.generar_reporte_anulaciones(year, month)
            filename = f"DGII_F_608_{rnc}_{periodo}.txt"
            header = f"608|{rnc}|{periodo}|{len(data)}"

            content = [header]
            for row in data:
                line = "|".join([
                    str(row["NCF"]),
                    str(row["Fecha_Comprobante"]),
                    str(row["Tipo_Anulacion"]),
                ])
                content.append(line)

            return "\n".join(content), filename, "text/plain"

        else:
            raise ValueError(f"Reporte {tipo_reporte} no soportado para DGII")


class FiscalStrategyFactory:
    """Factory para obtener la estrategia correcta según el país del negocio."""

    @staticmethod
    def get_strategy(negocio):
        pais_codigo = negocio.pais.codigo
        if pais_codigo == 'DOM':
            return DGIIDominicanaStrategy(negocio)
        else:
            raise NotImplementedError(
                f"Estrategia fiscal no implementada para el país: {pais_codigo}"
            )
