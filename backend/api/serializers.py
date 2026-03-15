from decimal import Decimal
from rest_framework import serializers
from django.contrib.auth.password_validation import validate_password
from .models import (
    Pais, Moneda, Impuesto, Negocio, Sucursal, Usuario, AuditLog,
    CuentaContable, PeriodoContable, AsientoContable, LineaAsiento,
    Categoria, Producto, Almacen, StockAlmacen, MovimientoInventario,
    Cliente, Proveedor, SecuenciaNCF, Venta, DetalleVenta,
    Compra, DetalleCompra, CuentaBancaria, CuadreCaja, AnalisisAI,
    MovimientoBancario, Conciliacion,
    Cotizacion, DetalleCotizacion, OrdenCompra, DetalleOrdenCompra,
    CuentaPorCobrar, CuentaPorPagar, Pago,
    Departamento, Empleado, Nomina, DetalleNomina, Vacacion,
    EtapaCRM, Oportunidad, ActividadCRM, TasaCambio,
    SesionActiva, ApiKey, IPBloqueada, AlertaSeguridad,
    ConfirmacionTransaccion, TokenPago, LicenciaSistema, BackupRegistro,
    CategoriaActivo, ActivoFijo, DepreciacionMensual, BajaActivo,
    WorkflowConfig, WorkflowStep, SolicitudAprobacion, DecisionAprobacion,
    Presupuesto, LineaPresupuesto,
    ArchivoImportacionBancaria, TransaccionBancaria,
)


class PaisSerializer(serializers.ModelSerializer):
    class Meta:
        model = Pais
        fields = '__all__'


class ImpuestoSerializer(serializers.ModelSerializer):
    pais_nombre = serializers.CharField(source='pais.nombre', read_only=True)

    class Meta:
        model = Impuesto
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


# =============================================================================
# SEGURIDAD EMPRESARIAL
# =============================================================================

class ChangePasswordSerializer(serializers.Serializer):
    """Cambio de contrasena con validacion de politicas."""
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True)

    def validate_new_password(self, value):
        validate_password(value)
        return value


class Setup2FASerializer(serializers.Serializer):
    """Respuesta de configuracion 2FA."""
    secret = serializers.CharField(read_only=True)
    qr_code = serializers.CharField(read_only=True)
    uri = serializers.CharField(read_only=True)


class Verify2FASerializer(serializers.Serializer):
    """Verificacion de token TOTP."""
    token = serializers.CharField(required=True, min_length=6, max_length=6)


class MFALoginSerializer(serializers.Serializer):
    """Segundo paso del login con MFA."""
    mfa_token = serializers.CharField(required=True, min_length=6, max_length=6)
    session_token = serializers.CharField(required=True)


class SesionActivaSerializer(serializers.ModelSerializer):
    class Meta:
        model = SesionActiva
        fields = ['id', 'ip_address', 'user_agent', 'creado_en', 'ultimo_uso']
        read_only_fields = fields


class ApiKeyCreateSerializer(serializers.Serializer):
    """Creacion de API key."""
    nombre = serializers.CharField(max_length=100)
    scopes = serializers.ListField(child=serializers.CharField(), required=True)
    expira_en = serializers.DateTimeField(required=False, allow_null=True)


class ApiKeySerializer(serializers.ModelSerializer):
    creado_por_nombre = serializers.CharField(source='creado_por.get_full_name', read_only=True)

    class Meta:
        model = ApiKey
        fields = [
            'id', 'nombre', 'key_prefix', 'scopes', 'activa',
            'ultimo_uso', 'expira_en', 'creado_por', 'creado_por_nombre', 'creado_en',
        ]
        read_only_fields = fields


class IPBloqueadaSerializer(serializers.ModelSerializer):
    class Meta:
        model = IPBloqueada
        fields = ['id', 'ip_address', 'razon', 'intentos', 'bloqueado_hasta',
                  'permanente', 'creado_en']
        read_only_fields = ['intentos', 'creado_en']


class AlertaSeguridadSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.get_full_name', read_only=True)

    class Meta:
        model = AlertaSeguridad
        fields = [
            'id', 'tipo', 'severidad', 'titulo', 'descripcion',
            'usuario', 'usuario_nombre', 'ip_address', 'datos',
            'leida', 'resuelta', 'creado_en',
        ]
        read_only_fields = ['id', 'tipo', 'severidad', 'titulo', 'descripcion',
                            'usuario', 'ip_address', 'datos', 'creado_en']


class ConfirmacionTransaccionSerializer(serializers.ModelSerializer):
    solicitado_por_nombre = serializers.CharField(
        source='solicitado_por.get_full_name', read_only=True
    )
    confirmado_por_nombre = serializers.CharField(
        source='confirmado_por.get_full_name', read_only=True
    )

    class Meta:
        model = ConfirmacionTransaccion
        fields = [
            'id', 'tipo', 'objeto_id', 'monto',
            'solicitado_por', 'solicitado_por_nombre',
            'confirmado_por', 'confirmado_por_nombre',
            'estado', 'expira_en', 'creado_en',
        ]
        read_only_fields = fields


class AuditLogSerializer(serializers.ModelSerializer):
    usuario_nombre = serializers.CharField(source='usuario.get_full_name', read_only=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'usuario', 'usuario_nombre', 'accion', 'modelo',
            'objeto_id', 'descripcion', 'datos_anteriores', 'datos_nuevos',
            'ip_address', 'user_agent', 'sesion_id', 'duracion_ms',
            'resultado', 'fecha',
        ]
        read_only_fields = fields


class LicenciaSistemaSerializer(serializers.ModelSerializer):
    class Meta:
        model = LicenciaSistema
        fields = [
            'id', 'clave_licencia', 'tipo', 'max_usuarios', 'max_sucursales',
            'modulos', 'fecha_inicio', 'fecha_fin', 'ultima_verificacion',
            'activa', 'creado_en',
        ]
        read_only_fields = ['clave_licencia', 'firma_hmac', 'ultima_verificacion', 'creado_en']


class BackupRegistroSerializer(serializers.ModelSerializer):
    class Meta:
        model = BackupRegistro
        fields = [
            'id', 'tipo', 'archivo', 'tamano_bytes', 'checksum_sha256',
            'encriptado', 'estado', 'test_restauracion', 'creado_en', 'expira_en',
        ]
        read_only_fields = fields


class DetalleVentaSecureWriteSerializer(serializers.Serializer):
    """Detalle de venta con validacion server-side de precios."""
    producto = serializers.UUIDField()
    cantidad = serializers.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = serializers.DecimalField(max_digits=12, decimal_places=2)
    descuento = serializers.DecimalField(max_digits=12, decimal_places=2, default=0)

    def validate(self, attrs):
        from .models import Producto
        try:
            producto = Producto.objects.get(pk=attrs['producto'])
        except Producto.DoesNotExist:
            raise serializers.ValidationError({'producto': 'Producto no encontrado.'})

        # Server-side price validation (anti-MITM)
        precio = attrs['precio_unitario']
        if precio != producto.precio_venta and precio != producto.precio_mayorista:
            request = self.context.get('request')
            if request and not request.user.puede_editar_precios:
                raise serializers.ValidationError({
                    'precio_unitario': (
                        f'Precio ${precio} no coincide con precio del producto '
                        f'${producto.precio_venta}. No tiene permiso para editar precios.'
                    )
                })

        # Validate discount limits by role
        descuento_pct = Decimal('0')
        subtotal = attrs['cantidad'] * precio
        if subtotal > 0 and attrs.get('descuento', 0) > 0:
            descuento_pct = (attrs['descuento'] / subtotal) * 100

        if descuento_pct > 0:
            request = self.context.get('request')
            if request:
                from api.security.anomaly_detector import get_max_discount_for_role
                max_discount = get_max_discount_for_role(request.user.rol)
                user_override = request.user.max_descuento
                if user_override is not None:
                    max_discount = user_override
                if descuento_pct > max_discount:
                    raise serializers.ValidationError({
                        'descuento': (
                            f'Descuento de {descuento_pct:.1f}% excede el limite '
                            f'de {max_discount}% para su rol.'
                        )
                    })

        return attrs


# =============================================================================
# ACTIVOS FIJOS
# =============================================================================

class CategoriaActivoSerializer(serializers.ModelSerializer):
    cuenta_activo_nombre = serializers.CharField(source='cuenta_activo_default.nombre', read_only=True)
    cuenta_depreciacion_nombre = serializers.CharField(source='cuenta_depreciacion_default.nombre', read_only=True)
    cuenta_gasto_nombre = serializers.CharField(source='cuenta_gasto_default.nombre', read_only=True)

    class Meta:
        model = CategoriaActivo
        fields = [
            'id', 'nombre', 'vida_util_default', 'metodo_default',
            'cuenta_activo_default', 'cuenta_activo_nombre',
            'cuenta_depreciacion_default', 'cuenta_depreciacion_nombre',
            'cuenta_gasto_default', 'cuenta_gasto_nombre',
        ]


class DepreciacionMensualSerializer(serializers.ModelSerializer):
    periodo_nombre = serializers.CharField(source='periodo.nombre', read_only=True)

    class Meta:
        model = DepreciacionMensual
        fields = [
            'id', 'activo', 'periodo', 'periodo_nombre', 'fecha',
            'monto_depreciacion', 'depreciacion_acumulada', 'valor_en_libros',
            'asiento_contable', 'creado_en',
        ]
        read_only_fields = ['id', 'creado_en']


class BajaActivoSerializer(serializers.ModelSerializer):
    autorizado_por_nombre = serializers.CharField(source='autorizado_por.get_full_name', read_only=True)

    class Meta:
        model = BajaActivo
        fields = [
            'id', 'activo', 'fecha_baja', 'motivo', 'valor_venta',
            'ganancia_perdida', 'asiento_contable', 'autorizado_por',
            'autorizado_por_nombre', 'notas', 'creado_en',
        ]
        read_only_fields = ['id', 'ganancia_perdida', 'asiento_contable', 'creado_en']


class ActivoFijoSerializer(serializers.ModelSerializer):
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)
    ubicacion_nombre = serializers.CharField(source='ubicacion.nombre', read_only=True, default=None)
    responsable_nombre = serializers.CharField(source='responsable.get_full_name', read_only=True, default=None)
    proveedor_nombre = serializers.CharField(source='proveedor.nombre', read_only=True, default=None)
    depreciacion_acumulada = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    valor_en_libros = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    base_depreciable = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    depreciaciones = DepreciacionMensualSerializer(many=True, read_only=True)

    class Meta:
        model = ActivoFijo
        fields = [
            'id', 'codigo', 'nombre', 'descripcion', 'categoria', 'categoria_nombre',
            'cuenta_contable', 'cuenta_depreciacion', 'cuenta_gasto',
            'fecha_adquisicion', 'fecha_inicio_depreciacion',
            'costo_adquisicion', 'valor_residual', 'vida_util_meses',
            'metodo_depreciacion', 'estado',
            'ubicacion', 'ubicacion_nombre', 'responsable', 'responsable_nombre',
            'numero_serie', 'proveedor', 'proveedor_nombre', 'factura_compra', 'foto',
            'base_depreciable', 'depreciacion_acumulada', 'valor_en_libros',
            'depreciaciones', 'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'codigo', 'creado_en', 'actualizado_en']

    def validate(self, attrs):
        if attrs.get('valor_residual', 0) >= attrs.get('costo_adquisicion', 0):
            raise serializers.ValidationError({
                'valor_residual': 'El valor residual debe ser menor al costo de adquisición.',
            })
        return attrs


class ActivoFijoListSerializer(serializers.ModelSerializer):
    """Serializer ligero para listados"""
    categoria_nombre = serializers.CharField(source='categoria.nombre', read_only=True)
    ubicacion_nombre = serializers.CharField(source='ubicacion.nombre', read_only=True, default=None)
    depreciacion_acumulada = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    valor_en_libros = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = ActivoFijo
        fields = [
            'id', 'codigo', 'nombre', 'categoria', 'categoria_nombre',
            'costo_adquisicion', 'estado', 'ubicacion_nombre',
            'depreciacion_acumulada', 'valor_en_libros', 'creado_en',
        ]


# =============================================================================
# WORKFLOW DE APROBACIONES
# =============================================================================

class WorkflowStepSerializer(serializers.ModelSerializer):
    usuario_especifico_nombre = serializers.CharField(
        source='usuario_especifico.get_full_name', read_only=True, default=None,
    )

    class Meta:
        model = WorkflowStep
        fields = [
            'id', 'orden', 'nombre', 'rol_aprobador',
            'usuario_especifico', 'usuario_especifico_nombre',
            'monto_minimo', 'monto_maximo', 'auto_aprobar_bajo_monto',
            'timeout_horas', 'notificar_por',
        ]


class WorkflowConfigSerializer(serializers.ModelSerializer):
    pasos = WorkflowStepSerializer(many=True, read_only=True)

    class Meta:
        model = WorkflowConfig
        fields = [
            'id', 'nombre', 'entidad', 'activo', 'pasos',
            'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'creado_en', 'actualizado_en']


class DecisionAprobacionSerializer(serializers.ModelSerializer):
    aprobador_nombre = serializers.CharField(source='aprobador.get_full_name', read_only=True)
    paso_nombre = serializers.CharField(source='paso.nombre', read_only=True)

    class Meta:
        model = DecisionAprobacion
        fields = [
            'id', 'paso', 'paso_nombre', 'aprobador', 'aprobador_nombre',
            'decision', 'comentario', 'fecha_decision',
        ]
        read_only_fields = ['id', 'fecha_decision']


class SolicitudAprobacionSerializer(serializers.ModelSerializer):
    workflow_nombre = serializers.CharField(source='workflow.nombre', read_only=True)
    solicitante_nombre = serializers.CharField(source='solicitante.get_full_name', read_only=True)
    paso_actual_nombre = serializers.CharField(source='paso_actual.nombre', read_only=True, default=None)
    decisiones = DecisionAprobacionSerializer(many=True, read_only=True)

    class Meta:
        model = SolicitudAprobacion
        fields = [
            'id', 'workflow', 'workflow_nombre',
            'content_type', 'object_id',
            'solicitante', 'solicitante_nombre',
            'paso_actual', 'paso_actual_nombre',
            'estado', 'monto', 'decisiones',
            'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'estado', 'creado_en', 'actualizado_en']


# =============================================================================
# PRESUPUESTOS
# =============================================================================

class LineaPresupuestoSerializer(serializers.ModelSerializer):
    cuenta_nombre = serializers.CharField(source='cuenta_contable.nombre', read_only=True)
    cuenta_codigo = serializers.CharField(source='cuenta_contable.codigo', read_only=True)

    class Meta:
        model = LineaPresupuesto
        fields = [
            'id', 'cuenta_contable', 'cuenta_nombre', 'cuenta_codigo',
            'mes_01', 'mes_02', 'mes_03', 'mes_04', 'mes_05', 'mes_06',
            'mes_07', 'mes_08', 'mes_09', 'mes_10', 'mes_11', 'mes_12',
            'total_anual', 'notas',
        ]
        read_only_fields = ['id', 'total_anual']


class PresupuestoSerializer(serializers.ModelSerializer):
    lineas = LineaPresupuestoSerializer(many=True, read_only=True)
    total_presupuestado = serializers.DecimalField(
        max_digits=14, decimal_places=2, read_only=True,
    )
    departamento_nombre = serializers.CharField(
        source='departamento.nombre', read_only=True, default=None,
    )
    periodo_nombre = serializers.CharField(source='periodo.nombre', read_only=True)

    class Meta:
        model = Presupuesto
        fields = [
            'id', 'nombre', 'periodo', 'periodo_nombre',
            'departamento', 'departamento_nombre',
            'estado', 'created_by', 'aprobado_por', 'fecha_aprobacion',
            'notas', 'total_presupuestado', 'lineas',
            'creado_en', 'actualizado_en',
        ]
        read_only_fields = ['id', 'created_by', 'aprobado_por', 'fecha_aprobacion', 'creado_en', 'actualizado_en']


# =============================================================================
# CONCILIACIÓN BANCARIA
# =============================================================================

class TransaccionBancariaSerializer(serializers.ModelSerializer):
    movimiento_match_desc = serializers.CharField(
        source='movimiento_match.descripcion', read_only=True, default=None,
    )

    class Meta:
        model = TransaccionBancaria
        fields = [
            'id', 'cuenta_bancaria', 'importacion', 'fecha', 'descripcion',
            'referencia', 'monto', 'saldo', 'estado',
            'movimiento_match', 'movimiento_match_desc', 'confianza_match',
            'conciliada_por', 'fecha_conciliacion', 'notas', 'creado_en',
        ]
        read_only_fields = ['id', 'creado_en']


class ArchivoImportacionBancariaSerializer(serializers.ModelSerializer):
    importado_por_nombre = serializers.CharField(
        source='importado_por.get_full_name', read_only=True, default=None,
    )

    class Meta:
        model = ArchivoImportacionBancaria
        fields = [
            'id', 'cuenta_bancaria', 'archivo_nombre', 'formato',
            'fecha_importacion', 'registros_importados', 'registros_conciliados',
            'importado_por', 'importado_por_nombre',
        ]
        read_only_fields = ['id', 'fecha_importacion', 'registros_importados', 'registros_conciliados']
