from lxml import etree
from datetime import datetime
from decimal import Decimal

class ECFGenerator:
    """
    Generador de XML para Factura Electrónica (e-CF) República Dominicana.
    Cumple con la estructura de la Norma 06-2018 DGII.
    """
    
    def __init__(self, venta):
        self.venta = venta
        self.negocio = venta.negocio
        self.cliente = venta.cliente
        self.nsmap = {
            "ecf": "http://www.dgii.gov.do/xml/ecf",
            "xsi": "http://www.w3.org/2001/XMLSchema-instance"
        }

    def _format_date(self, dt):
        return dt.strftime('%d-%m-%Y')

    def _format_decimal(self, amount, precision=2):
        return f"{amount:.{precision}f}"

    def generate_xml(self):
        # Raíz
        root = etree.Element("ECF", nsmap=self.nsmap)
        
        # Encabezado
        encabezado = etree.SubElement(root, "Encabezado")
        
        # 1. IdDoc
        self._build_id_doc(encabezado)
        
        # 2. Emisor
        self._build_emisor(encabezado)
        
        # 3. Comprador
        self._build_comprador(encabezado)
        
        # 4. Totales
        self._build_totales(encabezado)
        
        # DetallesItems
        self._build_detalles(root)
        
        return etree.tostring(root, pretty_print=True, encoding="UTF-8", xml_declaration=True).decode("utf-8")

    def _build_id_doc(self, parent):
        id_doc = etree.SubElement(parent, "IdDoc")
        
        # Mapeo de Tipo de Ingreso
        tipo_ingreso = "01" # 01: Ingresos por operaciones (Default)
        
        etree.SubElement(id_doc, "TipoeCF").text = self.venta.ecf_data.ecf_tipo # 31, 32, etc.
        etree.SubElement(id_doc, "eNCF").text = self.venta.ncf
        etree.SubElement(id_doc, "FechaVencimientoSecuencia").text = self._format_date(self.venta.fecha_vencimiento)
        etree.SubElement(id_doc, "IndicadorMontoGravado").text = "1" if self.venta.total_impuestos > 0 else "0"
        etree.SubElement(id_doc, "TipoIngresos").text = tipo_ingreso
        
        # Tipo de Pago
        tipo_pago_map = {
            'EFECTIVO': '01',
            'CHEQUE': '02',
            'TARJETA': '03',
            'TRANSFERENCIA': '04',
            'CREDITO': '05',
            'MIXTO': '07'
        }
        etree.SubElement(id_doc, "TipoPago").text = tipo_pago_map.get(self.venta.tipo_pago, '01')
        etree.SubElement(id_doc, "FechaLimitePago").text = self._format_date(self.venta.fecha) # Ajustar según lógica de crédito

    def _build_emisor(self, parent):
        emisor = etree.SubElement(parent, "Emisor")
        etree.SubElement(emisor, "RNCEmisor").text = self.negocio.identificacion_fiscal.replace('-', '')
        etree.SubElement(emisor, "RazonSocialEmisor").text = self.negocio.razon_social
        etree.SubElement(emisor, "NombreComercial").text = self.negocio.nombre_comercial
        etree.SubElement(emisor, "Sucursal").text = self.venta.sucursal.codigo if self.venta.sucursal else "001"
        etree.SubElement(emisor, "DireccionEmisor").text = self.negocio.direccion
        etree.SubElement(emisor, "FechaEmision").text = self._format_date(self.venta.fecha)

    def _build_comprador(self, parent):
        comprador = etree.SubElement(parent, "Comprador")
        if self.cliente:
            etree.SubElement(comprador, "RNCComprador").text = self.cliente.numero_documento.replace('-', '')
            etree.SubElement(comprador, "RazonSocialComprador").text = self.cliente.nombre
        else:
            # Consumidor Final Genérico
            etree.SubElement(comprador, "RNCComprador").text = "000000000"
            etree.SubElement(comprador, "RazonSocialComprador").text = "CLIENTE AL CONTADO"

    def _build_totales(self, parent):
        totales = etree.SubElement(parent, "Totales")
        
        # Calcular montos gravados y exentos
        # Nota: En una implementación real, esto debe venir desagregado del modelo Venta
        # Aquí asumimos simplificación para el ejemplo
        monto_gravado = self.venta.subtotal # Asumiendo todo gravado
        monto_itbis = self.venta.total_impuestos
        
        etree.SubElement(totales, "MontoGravadoTotal").text = self._format_decimal(monto_gravado)
        etree.SubElement(totales, "MontoExentoTotal").text = "0.00"
        etree.SubElement(totales, "TotalITBIS").text = self._format_decimal(monto_itbis)
        etree.SubElement(totales, "MontoTotal").text = self._format_decimal(self.venta.total)

    def _build_detalles(self, parent):
        detalles = etree.SubElement(parent, "DetallesItems")
        
        for index, detalle in enumerate(self.venta.detalles.all(), start=1):
            item = etree.SubElement(detalles, "Item")
            etree.SubElement(item, "NumeroLinea").text = str(index)
            
            # Tabla códigos DGII (Ej. 01 para bienes, 02 servicios)
            indicador_facturacion = "01" if detalle.producto.tipo == 'PRODUCTO' else "02"
            etree.SubElement(item, "IndicadorFacturacion").text = indicador_facturacion
            
            etree.SubElement(item, "NombreItem").text = detalle.producto.nombre[:80]
            etree.SubElement(item, "CantidadItem").text = self._format_decimal(detalle.cantidad)
            etree.SubElement(item, "PrecioUnitarioItem").text = self._format_decimal(detalle.precio_unitario)
            etree.SubElement(item, "DescuentoMonto").text = self._format_decimal(detalle.descuento)
            etree.SubElement(item, "MontoItem").text = self._format_decimal(detalle.subtotal)
