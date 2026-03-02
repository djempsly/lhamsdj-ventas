from rest_framework import serializers
from .models import (
    Pais, Moneda, Negocio, Sucursal, Usuario, AuditLog,
    CuentaContable, PeriodoContable, AsientoContable, LineaAsiento,
    Categoria, Producto, Almacen, StockAlmacen, MovimientoInventario,
    Cliente, Proveedor, SecuenciaNCF, Venta, DetalleVenta,
    Compra, DetalleCompra, CuentaBancaria, CuadreCaja, AnalisisAI,
    MovimientoBancario, Conciliacion,
    Cotizacion, DetalleCotizacion, OrdenCompra, DetalleOrdenCompra,
    CuentaPorCobrar, CuentaPorPagar, Pago,
    Departamento, Empleado, Nomina, DetalleNomina, Vacacion,
    EtapaCRM, Oportunidad, ActividadCRM, TasaCambio,
)


class PaisSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pais
        fields = '__all__'


class MonedaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Moneda
        fields = '__all__'


class NegocioSerializer(serializers.ModelSerializer):
    pais_nombre = serializers.CharField(source='pais.nombre', read_only=True)
    
    class Meta:
        model = Negocio
        fields = '__all__'
        read_only_fields = ['codigo_licencia', 'fecha_activacion', 'creado_en']


class SucursalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sucursal
        fields = '__all__'


class UsuarioSerializer(serializers.ModelSerializer):
    negocio_nombre = serializers.CharField(source='negocio.nombre_comercial', read_only=True)
    sucursal_nombre = serializers.CharField(source='sucursal.nombre', read_only=True)
    
    class Meta:
        model = Usuario
        fields = ['id', 'username', 'email', 'first_name', 'last_name', 'rol', 
                  'telefono', 'negocio', 'negocio_nombre', 'sucursal', 'sucursal_nombre',
                  'puede_crear_productos', 'puede_editar_precios', 'puede_ver_costos',
                  'puede_hacer_descuentos', 'puede_anular_ventas', 'puede_ver_reportes',
                  'two_factor_enabled', 'ultimo_acceso']
        extra_kwargs = {'password': {'write_only': True}}
    
    def create(self, validated_data):
        password = validated_data.pop('password', None)
        usuario = Usuario(**validated_data)
        if password:
            usuario.set_password(password)
        usuario.save()
        return usuario


class CuentaContableSerializer(serializers.ModelSerializer):
    cuenta_padre_nombre = serializers.CharField(source='cuenta_padre.nombre', read_only=True)
    subcuentas = serializers.SerializerMethodField()
    
    class Meta:
        model = CuentaContable
        fields = ['id', 'codigo', 'nombre', 'tipo', 'naturaleza', 'nivel', 
                  'es_cuenta_detalle', 'saldo_actual', 'activa', 'cuenta_padre', 
                  'cuenta_padre_nombre', 'subcuentas']
        
    def get_subcuentas(self, obj):
        if obj.subcuentas.exists():
            return CuentaContableSerializer(obj.subcuentas.all(), many=True).data
        return []


class CategoriaSerializer(serializers.ModelSerializer):
    class Meta:
        model = Categoria
        fields = ['id', 'nombre', 'descripcion', 'codigo', 'activa']


class ProductoSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)
    ganancia = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    margen = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    
    class Meta:
        model = Producto
        fields = ['id', 'codigo_barras', 'codigo_interno', 'nombre', 'descripcion',
                  'tipo', 'categoria', 'categoria_nombre', 'precio_costo', 'precio_venta',
                  'precio_mayorista', 'ganancia', 'margen', 'stock_actual', 'stock_minimo',
                  'stock_maximo', 'unidad_medida', 'aplica_impuesto', 'tasa_impuesto', 'activo']


class ClienteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Cliente
        fields = ['id', 'tipo_documento', 'numero_documento', 'nombre', 'telefono',
                  'email', 'direccion', 'tipo_cliente', 'limite_credito', 'balance', 'activo']


class ProveedorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Proveedor
        fields = ['id', 'identificacion_fiscal', 'nombre', 'nombre_comercial',
                  'telefono', 'email', 'direccion', 'tipo_retencion', 'dias_credito', 'balance', 'activo']


class DetalleVentaSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)
    
    class Meta:
        model = DetalleVenta
        fields = ['id', 'producto', 'producto_nombre', 'cantidad', 'precio_unitario',
                  'precio_costo', 'descuento', 'subtotal', 'impuesto', 'total']


class DetalleVentaWriteSerializer(serializers.Serializer):
    """Serializer ligero para recibir detalles al crear una venta."""
    producto = serializers.UUIDField()
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2)
    descuento = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)


class VentaSerializer(serializers.ModelSerializer):
    detalles = DetalleVentaSerializer(many=True, read_only=True)
    detalles_input = DetalleVentaWriteSerializer(many=True, write_only=True, required=False)
    cajero_nombre = serializers.CharField(source='cajero.get_full_name', read_only=True)
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)

    class Meta:
        model = Venta
        fields = ['id', 'numero', 'tipo_comprobante', 'ncf', 'cliente', 'cliente_nombre',
                  'cajero', 'cajero_nombre', 'fecha', 'subtotal', 'descuento',
                  'total_impuestos', 'total', 'costo_total', 'ganancia', 'tipo_pago',
                  'monto_pagado', 'cambio', 'estado', 'estado_fiscal', 'notas',
                  'detalles', 'detalles_input']
        read_only_fields = ['numero', 'cajero', 'estado_fiscal']

    def create(self, validated_data):
        detalles_data = validated_data.pop('detalles_input', [])
        venta = Venta.objects.create(**validated_data)

        costo_total = 0
        for item in detalles_data:
            producto = Producto.objects.get(pk=item['producto'])
            cantidad = item['cantidad']
            precio_unitario = item['precio_unitario']
            desc = item.get('descuento', 0)
            precio_costo = producto.precio_costo
            subtotal = cantidad * precio_unitario - desc
            impuesto = subtotal * (producto.tasa_impuesto / 100) if producto.aplica_impuesto else 0
            total_linea = subtotal + impuesto

            DetalleVenta.objects.create(
                venta=venta, producto=producto, cantidad=cantidad,
                precio_unitario=precio_unitario, precio_costo=precio_costo,
                descuento=desc, subtotal=subtotal, impuesto=impuesto, total=total_linea,
            )
            producto.stock_actual -= cantidad
            producto.save(update_fields=['stock_actual'])
            costo_total += precio_costo * cantidad

        if detalles_data:
            venta.costo_total = costo_total
            venta.ganancia = venta.total - costo_total
            venta.save(update_fields=['costo_total', 'ganancia'])

        return venta


class CuadreCajaSerializer(serializers.ModelSerializer):
    cajero_nombre = serializers.CharField(source='cajero.get_full_name', read_only=True)
    
    class Meta:
        model = CuadreCaja
        fields = ['id', 'fecha', 'cajero', 'cajero_nombre', 'efectivo_inicial',
                  'ventas_efectivo', 'ventas_tarjeta', 'ventas_transferencia',
                  'total_ventas', 'efectivo_esperado', 'efectivo_contado',
                  'diferencia', 'estado', 'notas']


class AnalisisAISerializer(serializers.ModelSerializer):
    class Meta:
        model = AnalisisAI
        fields = '__all__'


# =============================================================================
# COMPRAS
# =============================================================================

class DetalleCompraSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)

    class Meta:
        model = DetalleCompra
        fields = ['id', 'producto', 'producto_nombre', 'cantidad',
                  'precio_unitario', 'subtotal', 'impuesto', 'total']


class DetalleCompraWriteSerializer(serializers.Serializer):
    producto = serializers.UUIDField()
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2)


class CompraSerializer(serializers.ModelSerializer):
    detalles = DetalleCompraSerializer(many=True, read_only=True)
    detalles_input = DetalleCompraWriteSerializer(many=True, write_only=True, required=False)
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True)

    class Meta:
        model = Compra
        fields = [
            'id', 'numero', 'proveedor', 'proveedor_nombre', 'almacen',
            'ncf_proveedor', 'factura_proveedor', 'fecha', 'fecha_recepcion',
            'fecha_pago', 'tipo_bienes_servicios', 'forma_pago',
            'subtotal', 'total_impuestos', 'total',
            'itbis_retenido', 'retencion_renta', 'tipo_retencion',
            'estado', 'notas', 'detalles', 'detalles_input',
        ]
        read_only_fields = ['numero']

    def create(self, validated_data):
        detalles_data = validated_data.pop('detalles_input', [])
        compra = Compra.objects.create(**validated_data)

        subtotal_total = 0
        impuestos_total = 0
        for item in detalles_data:
            producto = Producto.objects.get(pk=item['producto'])
            cantidad = item['cantidad']
            precio_unitario = item['precio_unitario']
            subtotal = cantidad * precio_unitario
            impuesto = subtotal * (producto.tasa_impuesto / 100) if producto.aplica_impuesto else 0
            total_linea = subtotal + impuesto

            DetalleCompra.objects.create(
                compra=compra, producto=producto, cantidad=cantidad,
                precio_unitario=precio_unitario, subtotal=subtotal,
                impuesto=impuesto, total=total_linea,
            )
            subtotal_total += subtotal
            impuestos_total += impuesto

        if detalles_data:
            compra.subtotal = subtotal_total
            compra.total_impuestos = impuestos_total
            compra.total = subtotal_total + impuestos_total
            compra.save(update_fields=['subtotal', 'total_impuestos', 'total'])

        return compra


# =============================================================================
# CONTABILIDAD - Período
# =============================================================================

class PeriodoContableSerializer(serializers.ModelSerializer):
    class Meta:
        model = PeriodoContable
        fields = ['id', 'nombre', 'fecha_inicio', 'fecha_fin', 'estado',
                  'cerrado_por', 'fecha_cierre']
        read_only_fields = ['cerrado_por', 'fecha_cierre']


# =============================================================================
# RECONCILIACIÓN BANCARIA
# =============================================================================

class MovimientoBancarioSerializer(serializers.ModelSerializer):
    class Meta:
        model = MovimientoBancario
        fields = ['id', 'cuenta', 'fecha', 'descripcion', 'referencia',
                  'monto', 'tipo', 'saldo_posterior', 'conciliado',
                  'asiento_contable', 'importado_de', 'creado_en']
        read_only_fields = ['creado_en']


class ConciliacionSerializer(serializers.ModelSerializer):
    creado_por_nombre = serializers.CharField(source='creado_por.get_full_name', read_only=True)

    class Meta:
        model = Conciliacion
        fields = ['id', 'cuenta_bancaria', 'fecha_desde', 'fecha_hasta',
                  'saldo_extracto', 'saldo_libros', 'diferencia',
                  'estado', 'creado_por', 'creado_por_nombre', 'fecha']
        read_only_fields = ['creado_por', 'diferencia']


class CuentaBancariaSerializer(serializers.ModelSerializer):
    class Meta:
        model = CuentaBancaria
        fields = ['id', 'banco', 'tipo', 'numero', 'moneda', 'saldo',
                  'cuenta_contable', 'activa']


# =============================================================================
# COTIZACIONES (Fase 3A)
# =============================================================================

class DetalleCotizacionSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)

    class Meta:
        model = DetalleCotizacion
        fields = ['id', 'producto', 'producto_nombre', 'cantidad', 'precio_unitario',
                  'descuento', 'subtotal', 'impuesto', 'total']


class DetalleCotizacionWriteSerializer(serializers.Serializer):
    producto = serializers.UUIDField()
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2)
    descuento = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)


class CotizacionSerializer(serializers.ModelSerializer):
    detalles = DetalleCotizacionSerializer(many=True, read_only=True)
    detalles_input = DetalleCotizacionWriteSerializer(many=True, write_only=True, required=False)
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    vendedor_nombre = serializers.CharField(source='vendedor.get_full_name', read_only=True)

    class Meta:
        model = Cotizacion
        fields = ['id', 'numero', 'cliente', 'cliente_nombre', 'vendedor', 'vendedor_nombre',
                  'fecha', 'fecha_validez', 'subtotal', 'descuento', 'total_impuestos', 'total',
                  'condiciones', 'notas', 'estado', 'venta', 'detalles', 'detalles_input']
        read_only_fields = ['numero', 'vendedor']

    def create(self, validated_data):
        detalles_data = validated_data.pop('detalles_input', [])
        cotizacion = Cotizacion.objects.create(**validated_data)

        subtotal_total = 0
        impuestos_total = 0
        descuento_total = 0
        for item in detalles_data:
            producto = Producto.objects.get(pk=item['producto'])
            cantidad = item['cantidad']
            precio = item['precio_unitario']
            desc = item.get('descuento', 0)
            subtotal = cantidad * precio - desc
            impuesto = subtotal * (producto.tasa_impuesto / 100) if producto.aplica_impuesto else 0
            total_linea = subtotal + impuesto

            DetalleCotizacion.objects.create(
                cotizacion=cotizacion, producto=producto, cantidad=cantidad,
                precio_unitario=precio, descuento=desc, subtotal=subtotal,
                impuesto=impuesto, total=total_linea,
            )
            subtotal_total += subtotal
            impuestos_total += impuesto
            descuento_total += desc

        if detalles_data:
            cotizacion.subtotal = subtotal_total + descuento_total
            cotizacion.descuento = descuento_total
            cotizacion.total_impuestos = impuestos_total
            cotizacion.total = subtotal_total + impuestos_total
            cotizacion.save(update_fields=['subtotal', 'descuento', 'total_impuestos', 'total'])

        return cotizacion


# =============================================================================
# ÓRDENES DE COMPRA (Fase 3A)
# =============================================================================

class DetalleOrdenCompraSerializer(serializers.ModelSerializer):
    producto_nombre = serializers.CharField(source='producto.nombre', read_only=True)

    class Meta:
        model = DetalleOrdenCompra
        fields = ['id', 'producto', 'producto_nombre', 'cantidad', 'cantidad_recibida',
                  'precio_unitario', 'subtotal', 'impuesto', 'total']


class DetalleOrdenCompraWriteSerializer(serializers.Serializer):
    producto = serializers.UUIDField()
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2)


class OrdenCompraSerializer(serializers.ModelSerializer):
    detalles = DetalleOrdenCompraSerializer(many=True, read_only=True)
    detalles_input = DetalleOrdenCompraWriteSerializer(many=True, write_only=True, required=False)
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True)

    class Meta:
        model = OrdenCompra
        fields = ['id', 'numero', 'proveedor', 'proveedor_nombre', 'almacen',
                  'fecha', 'fecha_entrega_esperada', 'subtotal', 'total_impuestos', 'total',
                  'estado', 'solicitado_por', 'aprobado_por', 'fecha_aprobacion',
                  'compra', 'condiciones', 'notas', 'detalles', 'detalles_input']
        read_only_fields = ['numero', 'solicitado_por', 'aprobado_por', 'fecha_aprobacion']

    def create(self, validated_data):
        detalles_data = validated_data.pop('detalles_input', [])
        orden = OrdenCompra.objects.create(**validated_data)

        subtotal_total = 0
        impuestos_total = 0
        for item in detalles_data:
            producto = Producto.objects.get(pk=item['producto'])
            cantidad = item['cantidad']
            precio = item['precio_unitario']
            subtotal = cantidad * precio
            impuesto = subtotal * (producto.tasa_impuesto / 100) if producto.aplica_impuesto else 0
            total_linea = subtotal + impuesto

            DetalleOrdenCompra.objects.create(
                orden=orden, producto=producto, cantidad=cantidad,
                precio_unitario=precio, subtotal=subtotal,
                impuesto=impuesto, total=total_linea,
            )
            subtotal_total += subtotal
            impuestos_total += impuesto

        if detalles_data:
            orden.subtotal = subtotal_total
            orden.total_impuestos = impuestos_total
            orden.total = subtotal_total + impuestos_total
            orden.save(update_fields=['subtotal', 'total_impuestos', 'total'])

        return orden


# =============================================================================
# CUENTAS POR COBRAR / PAGAR (Fase 3B)
# =============================================================================

class CuentaPorCobrarSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    dias_vencida = serializers.IntegerField(read_only=True)

    class Meta:
        model = CuentaPorCobrar
        fields = ['id', 'numero', 'cliente', 'cliente_nombre', 'venta',
                  'fecha_emision', 'fecha_vencimiento', 'monto_original',
                  'monto_pagado', 'saldo_pendiente', 'estado', 'dias_vencida', 'notas']
        read_only_fields = ['numero']


class CuentaPorPagarSerializer(serializers.ModelSerializer):
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True)
    dias_vencida = serializers.IntegerField(read_only=True)

    class Meta:
        model = CuentaPorPagar
        fields = ['id', 'numero', 'proveedor', 'proveedor_nombre', 'compra',
                  'fecha_emision', 'fecha_vencimiento', 'monto_original',
                  'monto_pagado', 'saldo_pendiente', 'estado', 'dias_vencida', 'notas']
        read_only_fields = ['numero']


class PagoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pago
        fields = ['id', 'tipo', 'metodo_pago', 'fecha', 'monto', 'referencia',
                  'cuenta_por_cobrar', 'cuenta_por_pagar', 'cuenta_bancaria', 'notas']
        read_only_fields = ['creado_por']


# =============================================================================
# HR / NÓMINA (Fase 5A)
# =============================================================================

class DepartamentoSerializer(serializers.ModelSerializer):
    class Meta:
        model = Departamento
        fields = ['id', 'nombre', 'codigo', 'responsable', 'activo']


class EmpleadoSerializer(serializers.ModelSerializer):
    departamento_nombre = serializers.CharField(source='departamento.nombre', read_only=True)

    class Meta:
        model = Empleado
        fields = ['id', 'codigo', 'nombre', 'cedula', 'fecha_nacimiento', 'genero',
                  'telefono', 'email', 'direccion', 'cargo', 'tipo_contrato',
                  'fecha_ingreso', 'fecha_salida', 'salario_bruto', 'nss',
                  'departamento', 'departamento_nombre', 'sucursal', 'estado']
        read_only_fields = ['codigo']


class DetalleNominaSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)

    class Meta:
        model = DetalleNomina
        fields = ['id', 'empleado', 'empleado_nombre', 'salario_bruto',
                  'horas_extra', 'monto_horas_extra', 'comisiones', 'bonificaciones',
                  'otros_ingresos', 'total_ingresos',
                  'sfs_empleado', 'afp_empleado', 'isr', 'otras_deducciones', 'total_deducciones',
                  'sfs_patronal', 'afp_patronal', 'srl', 'infotep', 'total_aportes_patronales',
                  'salario_neto']


class NominaSerializer(serializers.ModelSerializer):
    detalles = DetalleNominaSerializer(many=True, read_only=True)

    class Meta:
        model = Nomina
        fields = ['id', 'nombre', 'tipo', 'periodo_desde', 'periodo_hasta',
                  'total_bruto', 'total_deducciones', 'total_aportes_patronales',
                  'total_neto', 'estado', 'detalles']
        read_only_fields = ['total_bruto', 'total_deducciones', 'total_aportes_patronales', 'total_neto']


class VacacionSerializer(serializers.ModelSerializer):
    empleado_nombre = serializers.CharField(source='empleado.nombre', read_only=True)

    class Meta:
        model = Vacacion
        fields = ['id', 'empleado', 'empleado_nombre', 'fecha_desde', 'fecha_hasta',
                  'dias', 'estado', 'notas']


# =============================================================================
# CRM (Fase 5B)
# =============================================================================

class EtapaCRMSerializer(serializers.ModelSerializer):
    class Meta:
        model = EtapaCRM
        fields = ['id', 'nombre', 'orden', 'probabilidad', 'color', 'activa']


class ActividadCRMSerializer(serializers.ModelSerializer):
    asignado_nombre = serializers.CharField(source='asignado_a.get_full_name', read_only=True)

    class Meta:
        model = ActividadCRM
        fields = ['id', 'oportunidad', 'tipo', 'titulo', 'descripcion',
                  'fecha_programada', 'fecha_completada', 'asignado_a', 'asignado_nombre', 'estado']


class OportunidadSerializer(serializers.ModelSerializer):
    cliente_nombre = serializers.CharField(source='cliente.nombre', read_only=True)
    etapa_nombre = serializers.CharField(source='etapa.nombre', read_only=True)
    asignado_nombre = serializers.CharField(source='asignado_a.get_full_name', read_only=True)
    actividades = ActividadCRMSerializer(many=True, read_only=True)

    class Meta:
        model = Oportunidad
        fields = ['id', 'titulo', 'cliente', 'cliente_nombre', 'etapa', 'etapa_nombre',
                  'valor_estimado', 'fecha_cierre_esperada', 'prioridad', 'estado',
                  'asignado_a', 'asignado_nombre', 'descripcion',
                  'cotizacion', 'venta', 'razon_perdida', 'actividades',
                  'creado_en', 'actualizado_en']


# =============================================================================
# MULTI-MONEDA (Fase 4A)
# =============================================================================

class TasaCambioSerializer(serializers.ModelSerializer):
    class Meta:
        model = TasaCambio
        fields = ['id', 'moneda_origen', 'moneda_destino', 'tasa', 'fecha', 'fuente']
