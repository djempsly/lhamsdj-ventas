from rest_framework import serializers
from .models import (
    Pais, Moneda, Negocio, Sucursal, Usuario, AuditLog,
    CuentaContable, PeriodoContable, AsientoContable, LineaAsiento,
    Categoria, Producto, Almacen, StockAlmacen, MovimientoInventario,
    Cliente, Proveedor, SecuenciaNCF, Venta, DetalleVenta,
    Compra, DetalleCompra, CuentaBancaria, CuadreCaja, AnalisisAI
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
