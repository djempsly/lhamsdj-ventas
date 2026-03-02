from lxml import etree
from datetime import datetime
from decimal import Decimal


class ECFGenerator:
    """
    Generador de XML para Factura Electrónica (e-CF) República Dominicana.
    Cumple con la estructura de la Norma 06-2018 DGII.
    Soporte multi-tipo: 31, 32, 33, 34, 41, 43, 44, 45.
    """

    # Tipos e-CF soportados
    TIPO_CREDITO_FISCAL = '31'
    TIPO_CONSUMO = '32'
    TIPO_NOTA_DEBITO = '33'
    TIPO_NOTA_CREDITO = '34'
    TIPO_COMPRAS = '41'
    TIPO_GASTOS_MENORES = '43'
    TIPO_REGIMENES_ESPECIALES = '44'
    TIPO_GUBERNAMENTAL = '45'

    def __init__(self, venta):
        self.venta = venta
        self.negocio = venta.negocio
        self.cliente = venta.cliente
        self.nsmap = {
            "ecf": "http://www.dgii.gov.do/xml/ecf",
            "xsi": "http://www.w3.org/2001/XMLSchema-instance",
        }

    def _format_date(self, dt):
        if hasattr(dt, 'strftime'):
            return dt.strftime('%d-%m-%Y')
        return str(dt)

    def _format_decimal(self, amount, precision=2):
        return f"{Decimal(str(amount)):.{precision}f}"

    def _get_ecf_tipo(self):
        if hasattr(self.venta, 'ecf_data') and self.venta.ecf_data:
            return self.venta.ecf_data.ecf_tipo
        tipo_map = {
            'B01': '31', 'B02': '32', 'B03': '33', 'B04': '34',
            'B11': '41', 'B13': '43', 'B14': '44', 'B15': '45',
        }
        return tipo_map.get(self.venta.tipo_comprobante, '32')

    def generate_xml(self):
        root = etree.Element("ECF", nsmap=self.nsmap)

        encabezado = etree.SubElement(root, "Encabezado")

        self._build_id_doc(encabezado)
        self._build_emisor(encabezado)
        self._build_comprador(encabezado)
        self._build_totales(encabezado)
        self._build_detalles(root)

        # Referencia para notas de crédito/débito
        ecf_tipo = self._get_ecf_tipo()
        if ecf_tipo in (self.TIPO_NOTA_CREDITO, self.TIPO_NOTA_DEBITO):
            self._build_referencia_informacion(root)

        return etree.tostring(
            root, pretty_print=True, encoding="UTF-8", xml_declaration=True,
        ).decode("utf-8")

    def _build_id_doc(self, parent):
        id_doc = etree.SubElement(parent, "IdDoc")

        ecf_tipo = self._get_ecf_tipo()
        etree.SubElement(id_doc, "TipoeCF").text = ecf_tipo
        etree.SubElement(id_doc, "eNCF").text = self.venta.ncf

        # Fecha vencimiento secuencia
        if self.venta.fecha_vencimiento:
            etree.SubElement(id_doc, "FechaVencimientoSecuencia").text = (
                self._format_date(self.venta.fecha_vencimiento)
            )

        # Indicador monto gravado
        etree.SubElement(id_doc, "IndicadorMontoGravado").text = (
            "1" if self.venta.total_impuestos > 0 else "0"
        )

        # Tipo de ingreso
        etree.SubElement(id_doc, "TipoIngresos").text = "01"

        # Tipo de pago
        tipo_pago_map = {
            'EFECTIVO': '01', 'CHEQUE': '02', 'TARJETA': '03',
            'TRANSFERENCIA': '04', 'CREDITO': '05', 'MIXTO': '07',
        }
        etree.SubElement(id_doc, "TipoPago").text = tipo_pago_map.get(
            self.venta.tipo_pago, '01'
        )

        # Fecha límite pago
        etree.SubElement(id_doc, "FechaLimitePago").text = self._format_date(self.venta.fecha)

        # Código de seguridad e-CF (6 dígitos)
        if self.venta.codigo_seguridad_dgii:
            etree.SubElement(id_doc, "CodigoSeguridadeNCF").text = (
                self.venta.codigo_seguridad_dgii
            )

    def _build_emisor(self, parent):
        emisor = etree.SubElement(parent, "Emisor")
        etree.SubElement(emisor, "RNCEmisor").text = (
            self.negocio.identificacion_fiscal.replace('-', '')
        )
        etree.SubElement(emisor, "RazonSocialEmisor").text = self.negocio.razon_social
        etree.SubElement(emisor, "NombreComercial").text = self.negocio.nombre_comercial
        etree.SubElement(emisor, "Sucursal").text = (
            self.venta.sucursal.codigo if self.venta.sucursal else "001"
        )
        etree.SubElement(emisor, "DireccionEmisor").text = self.negocio.direccion
        etree.SubElement(emisor, "FechaEmision").text = self._format_date(self.venta.fecha)

    def _build_comprador(self, parent):
        comprador = etree.SubElement(parent, "Comprador")
        if self.cliente:
            etree.SubElement(comprador, "RNCComprador").text = (
                self.cliente.numero_documento.replace('-', '')
            )
            etree.SubElement(comprador, "RazonSocialComprador").text = self.cliente.nombre
        else:
            etree.SubElement(comprador, "RNCComprador").text = "000000000"
            etree.SubElement(comprador, "RazonSocialComprador").text = "CLIENTE AL CONTADO"

    def _build_totales(self, parent):
        totales = etree.SubElement(parent, "Totales")

        # Desglosar montos gravados por tasa ITBIS real
        monto_gravado_18 = Decimal('0')
        monto_gravado_16 = Decimal('0')
        monto_exento = Decimal('0')
        total_itbis_18 = Decimal('0')
        total_itbis_16 = Decimal('0')

        for detalle in self.venta.detalles.all():
            if not detalle.producto.aplica_impuesto:
                monto_exento += detalle.subtotal
            elif detalle.producto.tasa_impuesto == Decimal('16.00'):
                monto_gravado_16 += detalle.subtotal
                total_itbis_16 += detalle.impuesto
            else:
                monto_gravado_18 += detalle.subtotal
                total_itbis_18 += detalle.impuesto

        monto_gravado_total = monto_gravado_18 + monto_gravado_16

        etree.SubElement(totales, "MontoGravadoTotal").text = (
            self._format_decimal(monto_gravado_total)
        )
        if monto_gravado_18 > 0:
            etree.SubElement(totales, "MontoGravado18").text = (
                self._format_decimal(monto_gravado_18)
            )
            etree.SubElement(totales, "ITBIS18").text = (
                self._format_decimal(total_itbis_18)
            )
        if monto_gravado_16 > 0:
            etree.SubElement(totales, "MontoGravado16").text = (
                self._format_decimal(monto_gravado_16)
            )
            etree.SubElement(totales, "ITBIS16").text = (
                self._format_decimal(total_itbis_16)
            )

        etree.SubElement(totales, "MontoExentoTotal").text = (
            self._format_decimal(monto_exento)
        )
        etree.SubElement(totales, "TotalITBIS").text = (
            self._format_decimal(self.venta.total_impuestos)
        )
        etree.SubElement(totales, "MontoTotal").text = (
            self._format_decimal(self.venta.total)
        )

    def _build_detalles(self, parent):
        detalles = etree.SubElement(parent, "DetallesItems")

        for index, detalle in enumerate(self.venta.detalles.all(), start=1):
            item = etree.SubElement(detalles, "Item")
            etree.SubElement(item, "NumeroLinea").text = str(index)

            # Indicador Bien/Servicio: 1=Bien, 2=Servicio
            indicador = "1" if detalle.producto.tipo == 'PRODUCTO' else "2"
            etree.SubElement(item, "IndicadorBienServicio").text = indicador

            # Indicador de facturación: 01=bienes, 02=servicios
            etree.SubElement(item, "IndicadorFacturacion").text = (
                "01" if detalle.producto.tipo == 'PRODUCTO' else "02"
            )

            etree.SubElement(item, "NombreItem").text = detalle.producto.nombre[:80]
            etree.SubElement(item, "CantidadItem").text = (
                self._format_decimal(detalle.cantidad)
            )
            etree.SubElement(item, "PrecioUnitarioItem").text = (
                self._format_decimal(detalle.precio_unitario)
            )
            etree.SubElement(item, "DescuentoMonto").text = (
                self._format_decimal(detalle.descuento)
            )
            etree.SubElement(item, "MontoItem").text = (
                self._format_decimal(detalle.subtotal)
            )

            # ITBIS por item
            if detalle.impuesto > 0:
                etree.SubElement(item, "MontoITBIS").text = (
                    self._format_decimal(detalle.impuesto)
                )

    def _build_referencia_informacion(self, parent):
        """Construye InformacionReferencia para notas de crédito/débito (tipos 33/34)."""
        ref = etree.SubElement(parent, "InformacionReferencia")

        venta_original = self.venta.venta_referencia
        if venta_original:
            etree.SubElement(ref, "NCFModificado").text = venta_original.ncf
            etree.SubElement(ref, "FechaNCFModificado").text = (
                self._format_date(venta_original.fecha)
            )
            # Código de modificación: 01=Descuento, 02=Devolución, 03=Anulación, 04=Corrección
            etree.SubElement(ref, "CodigoModificacion").text = "03"
