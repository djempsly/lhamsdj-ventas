from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from decimal import Decimal
import uuid
from datetime import datetime
from django.utils import timezone


# =============================================================================
# CONFIGURACIÓN GLOBAL Y MULTI-PAÍS
# =============================================================================

class Pais(models.Model):
    """Configuración fiscal por país - ESCALABLE INTERNACIONALMENTE"""
    codigo = models.CharField(max_length=3, primary_key=True)  # ISO 3166-1 alfa-3
    nombre = models.CharField(max_length=100)
    moneda_codigo = models.CharField(max_length=3)  # ISO 4217
    moneda_simbolo = models.CharField(max_length=5)
    tasa_impuesto_defecto = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)
    nombre_impuesto = models.CharField(max_length=20, default='ITBIS')  # ITBIS, IVA, VAT, etc.
    formato_factura = models.CharField(max_length=50, default='e-CF')
    activo = models.BooleanField(default=True)
    
    class Meta:
        verbose_name_plural = "Países"
    
    def __str__(self):
        return f"{self.nombre} ({self.codigo})"


class Moneda(models.Model):
    """Soporte multi-moneda"""
    codigo = models.CharField(max_length=3, primary_key=True)  # USD, DOP, EUR
    nombre = models.CharField(max_length=50)
    simbolo = models.CharField(max_length=5)
    tasa_cambio = models.DecimalField(max_digits=12, decimal_places=4, default=1.0000)
    fecha_actualizacion = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


# =============================================================================
# NEGOCIO Y USUARIOS
# =============================================================================

class Negocio(models.Model):
    """Empresa/Negocio - Multi-tenant"""
    TIPO_LICENCIA = [
        ('TRIAL', 'Prueba'),
        ('MENSUAL', 'Mensual'),
        ('ANUAL', 'Anual'),
        ('PERPETUA', 'Perpetua'),
    ]
    ESTADO_LICENCIA = [
        ('ACTIVA', 'Activa'),
        ('SUSPENDIDA', 'Suspendida'),
        ('VENCIDA', 'Vencida'),
        ('CANCELADA', 'Cancelada'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    codigo_licencia = models.CharField(max_length=50, unique=True, blank=True)
    
    # Información básica
    nombre_comercial = models.CharField(max_length=200)
    razon_social = models.CharField(max_length=200)
    identificacion_fiscal = models.CharField(max_length=20)  # RNC, NIT, RFC, etc.
    telefono = models.CharField(max_length=20)
    email = models.EmailField()
    direccion = models.TextField()
    ciudad = models.CharField(max_length=100)
    
    # Configuración internacional
    pais = models.ForeignKey(Pais, on_delete=models.PROTECT, default='DOM')
    moneda_principal = models.ForeignKey(Moneda, on_delete=models.PROTECT, default='DOP')
    zona_horaria = models.CharField(max_length=50, default='America/Santo_Domingo')
    
    # Licencia
    tipo_licencia = models.CharField(max_length=10, choices=TIPO_LICENCIA, default='TRIAL')
    fecha_activacion = models.DateTimeField(auto_now_add=True)
    fecha_vencimiento = models.DateTimeField()
    estado_licencia = models.CharField(max_length=15, choices=ESTADO_LICENCIA, default='ACTIVA')
    max_usuarios = models.IntegerField(default=5)
    max_sucursales = models.IntegerField(default=1)
    
    # Configuración fiscal
    regimen_fiscal = models.CharField(max_length=50, blank=True)
    certificado_digital = models.TextField(blank=True)  # Encriptado
    api_fiscal_usuario = models.CharField(max_length=100, blank=True)
    api_fiscal_clave = models.CharField(max_length=255, blank=True)  # Encriptado
    ambiente_fiscal = models.CharField(max_length=10, choices=[('TEST', 'Pruebas'), ('PROD', 'Producción')], default='TEST')
    
    # Configuración contable
    plan_cuentas_activo = models.BooleanField(default=True)
    cierre_automatico = models.BooleanField(default=False)
    
    # Metadatos
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    
    def save(self, *args, **kwargs):
        if not self.codigo_licencia:
            self.codigo_licencia = f"POS-{datetime.now().year}-{str(uuid.uuid4())[:8].upper()}"
        super().save(*args, **kwargs)
    
    def __str__(self):
        return self.nombre_comercial


class Sucursal(models.Model):
    """Múltiples sucursales por negocio"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE, related_name='sucursales')
    nombre = models.CharField(max_length=100)
    codigo = models.CharField(max_length=20)
    direccion = models.TextField()
    telefono = models.CharField(max_length=20, blank=True)
    es_principal = models.BooleanField(default=False)
    activa = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ['negocio', 'codigo']
    
    def __str__(self):
        return f"{self.nombre} - {self.negocio.nombre_comercial}"


class Usuario(AbstractUser):
    """Usuario con roles y permisos avanzados"""
    ROL_CHOICES = [
        ('SUPER_ADMIN', 'Super Administrador'),
        ('ADMIN_NEGOCIO', 'Administrador del Negocio'),
        ('GERENTE', 'Gerente'),
        ('CONTADOR', 'Contador'),
        ('CAJERO', 'Cajero'),
        ('VENDEDOR', 'Vendedor'),
        ('ALMACEN', 'Encargado de Almacén'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE, null=True, blank=True)
    sucursal = models.ForeignKey(Sucursal, on_delete=models.SET_NULL, null=True, blank=True)
    rol = models.CharField(max_length=15, choices=ROL_CHOICES, default='CAJERO')
    telefono = models.CharField(max_length=20, blank=True)
    foto = models.ImageField(upload_to='usuarios/', blank=True, null=True)
    
    # Permisos granulares
    puede_crear_productos = models.BooleanField(default=False)
    puede_editar_precios = models.BooleanField(default=False)
    puede_ver_costos = models.BooleanField(default=False)
    puede_hacer_descuentos = models.BooleanField(default=False)
    puede_anular_ventas = models.BooleanField(default=False)
    puede_ver_reportes = models.BooleanField(default=False)
    puede_exportar_datos = models.BooleanField(default=False)
    
    # Seguridad
    two_factor_enabled = models.BooleanField(default=False)
    two_factor_secret = models.CharField(max_length=32, blank=True)
    intentos_fallidos = models.IntegerField(default=0)
    cuenta_bloqueada_hasta = models.DateTimeField(null=True, blank=True)
    ultimo_cambio_password = models.DateTimeField(auto_now_add=True)
    forzar_cambio_password = models.BooleanField(default=False)
    
    # Metadatos
    creado_en = models.DateTimeField(auto_now_add=True)
    ultimo_acceso = models.DateTimeField(null=True, blank=True)
    
    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_rol_display()})"


# =============================================================================
# AUDITORÍA Y SEGURIDAD
# =============================================================================

class AuditLog(models.Model):
    """Registro de auditoría de TODAS las acciones"""
    ACCION_CHOICES = [
        ('LOGIN', 'Inicio de Sesión'),
        ('LOGOUT', 'Cierre de Sesión'),
        ('LOGIN_FALLIDO', 'Intento Fallido'),
        ('CREATE', 'Crear'),
        ('UPDATE', 'Actualizar'),
        ('DELETE', 'Eliminar'),
        ('VIEW', 'Ver'),
        ('EXPORT', 'Exportar'),
        ('PRINT', 'Imprimir'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    
    accion = models.CharField(max_length=20, choices=ACCION_CHOICES)
    modelo = models.CharField(max_length=100)
    objeto_id = models.CharField(max_length=100, blank=True)
    descripcion = models.TextField()
    
    datos_anteriores = models.JSONField(null=True, blank=True)
    datos_nuevos = models.JSONField(null=True, blank=True)
    
    ip_address = models.GenericIPAddressField(null=True)
    user_agent = models.TextField(blank=True)
    
    fecha = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['negocio', 'fecha']),
            models.Index(fields=['usuario', 'accion']),
            models.Index(fields=['modelo', 'objeto_id']),
        ]


# =============================================================================
# CONTABILIDAD - MOTOR CONTABLE REAL
# =============================================================================

class CuentaContable(models.Model):
    """Plan de cuentas contable completo"""
    TIPO_CUENTA = [
        ('ACTIVO', 'Activo'),
        ('PASIVO', 'Pasivo'),
        ('PATRIMONIO', 'Patrimonio'),
        ('INGRESO', 'Ingreso'),
        ('COSTO', 'Costo'),
        ('GASTO', 'Gasto'),
    ]
    NATURALEZA = [
        ('DEUDORA', 'Deudora'),
        ('ACREEDORA', 'Acreedora'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    codigo = models.CharField(max_length=20)
    nombre = models.CharField(max_length=200)
    tipo = models.CharField(max_length=15, choices=TIPO_CUENTA)
    naturaleza = models.CharField(max_length=10, choices=NATURALEZA)
    
    cuenta_padre = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='subcuentas')
    nivel = models.IntegerField(default=1)
    es_cuenta_detalle = models.BooleanField(default=True)
    
    saldo_actual = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    activa = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ['negocio', 'codigo']
        ordering = ['codigo']
    
    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


class PeriodoContable(models.Model):
    """Períodos contables (meses, años)"""
    ESTADO = [
        ('ABIERTO', 'Abierto'),
        ('CERRADO', 'Cerrado'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    nombre = models.CharField(max_length=50)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    estado = models.CharField(max_length=10, choices=ESTADO, default='ABIERTO')
    cerrado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
    fecha_cierre = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        ordering = ['-fecha_inicio']


class AsientoContable(models.Model):
    """Asientos contables"""
    TIPO = [
        ('MANUAL', 'Manual'),
        ('VENTA', 'Venta'),
        ('COMPRA', 'Compra'),
        ('PAGO', 'Pago'),
        ('COBRO', 'Cobro'),
        ('AJUSTE', 'Ajuste'),
        ('CIERRE', 'Cierre'),
    ]
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('CONTABILIZADO', 'Contabilizado'),
        ('ANULADO', 'Anulado'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    periodo = models.ForeignKey(PeriodoContable, on_delete=models.PROTECT)
    
    numero = models.CharField(max_length=20)
    fecha = models.DateField()
    tipo = models.CharField(max_length=15, choices=TIPO, default='MANUAL')
    descripcion = models.TextField()
    referencia = models.CharField(max_length=100, blank=True)
    
    total_debe = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_haber = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    estado = models.CharField(max_length=15, choices=ESTADO, default='BORRADOR')
    creado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['negocio', 'numero']
        ordering = ['-fecha', '-numero']


class LineaAsiento(models.Model):
    """Líneas de asiento contable"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asiento = models.ForeignKey(AsientoContable, on_delete=models.CASCADE, related_name='lineas')
    cuenta = models.ForeignKey(CuentaContable, on_delete=models.PROTECT)
    
    descripcion = models.CharField(max_length=200, blank=True)
    debe = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    haber = models.DecimalField(max_digits=15, decimal_places=2, default=0)


# =============================================================================
# INVENTARIO Y PRODUCTOS
# =============================================================================

class Categoria(models.Model):
    """Categorías de productos"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    nombre = models.CharField(max_length=100)
    descripcion = models.TextField(blank=True)
    codigo = models.CharField(max_length=10, blank=True)
    cuenta_ingreso = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True, related_name='categorias_ingreso')
    cuenta_costo = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True, related_name='categorias_costo')
    activa = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ['negocio', 'nombre']
    
    def __str__(self):
        return self.nombre


class Producto(models.Model):
    """Productos con soporte completo de inventario"""
    TIPO_PRODUCTO = [
        ('PRODUCTO', 'Producto'),
        ('SERVICIO', 'Servicio'),
        ('COMBO', 'Combo'),
    ]
    METODO_COSTEO = [
        ('PROMEDIO', 'Costo Promedio'),
        ('FIFO', 'FIFO'),
        ('LIFO', 'LIFO'),
        ('ESPECIFICO', 'Específico'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    categoria = models.ForeignKey(Categoria, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Identificación
    codigo_barras = models.CharField(max_length=50, db_index=True)
    codigo_interno = models.CharField(max_length=20, blank=True)
    nombre = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)
    
    tipo = models.CharField(max_length=10, choices=TIPO_PRODUCTO, default='PRODUCTO')
    
    # Precios
    precio_costo = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0'))])
    precio_venta = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal('0.01'))])
    precio_mayorista = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # Inventario
    metodo_costeo = models.CharField(max_length=10, choices=METODO_COSTEO, default='PROMEDIO')
    stock_actual = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    stock_minimo = models.DecimalField(max_digits=12, decimal_places=2, default=5)
    stock_maximo = models.DecimalField(max_digits=12, decimal_places=2, default=1000)
    unidad_medida = models.CharField(max_length=20, default='UNIDAD')
    
    # Impuestos
    aplica_impuesto = models.BooleanField(default=True)
    tasa_impuesto = models.DecimalField(max_digits=5, decimal_places=2, default=18.00)
    
    # Contabilidad
    cuenta_ingreso = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True, related_name='productos_ingreso')
    cuenta_costo = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True, related_name='productos_costo')
    cuenta_inventario = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True, related_name='productos_inventario')
    
    # Estado
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['negocio', 'codigo_barras']
        indexes = [
            models.Index(fields=['negocio', 'activo']),
            models.Index(fields=['negocio', 'categoria']),
        ]
    
    def save(self, *args, **kwargs):
        if not self.codigo_barras:
            prefijo = self.categoria.codigo if self.categoria and self.categoria.codigo else 'GEN'
            count = Producto.objects.filter(negocio=self.negocio).count()
            self.codigo_barras = f"POS-{prefijo}-{count + 1:05d}"
        super().save(*args, **kwargs)
    
    @property
    def ganancia(self):
        return self.precio_venta - self.precio_costo
    
    @property
    def margen(self):
        if self.precio_costo > 0:
            return ((self.precio_venta - self.precio_costo) / self.precio_costo) * 100
        return 0
    
    def __str__(self):
        return f"{self.codigo_barras} - {self.nombre}"


class Almacen(models.Model):
    """Múltiples almacenes por negocio"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    sucursal = models.ForeignKey(Sucursal, on_delete=models.CASCADE)
    
    nombre = models.CharField(max_length=100)
    codigo = models.CharField(max_length=20)
    direccion = models.TextField(blank=True)
    es_principal = models.BooleanField(default=False)
    activo = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ['negocio', 'codigo']


class StockAlmacen(models.Model):
    """Stock por producto y almacén"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    producto = models.ForeignKey(Producto, on_delete=models.CASCADE, related_name='stocks')
    almacen = models.ForeignKey(Almacen, on_delete=models.CASCADE)
    
    cantidad = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    costo_promedio = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    class Meta:
        unique_together = ['producto', 'almacen']


class MovimientoInventario(models.Model):
    """Movimientos de inventario - Kardex"""
    TIPO = [
        ('ENTRADA', 'Entrada'),
        ('SALIDA', 'Salida'),
        ('AJUSTE_POS', 'Ajuste Positivo'),
        ('AJUSTE_NEG', 'Ajuste Negativo'),
        ('TRANSFERENCIA', 'Transferencia'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    producto = models.ForeignKey(Producto, on_delete=models.CASCADE)
    almacen = models.ForeignKey(Almacen, on_delete=models.CASCADE)
    
    tipo = models.CharField(max_length=15, choices=TIPO)
    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    costo_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    costo_total = models.DecimalField(max_digits=12, decimal_places=2)
    
    stock_anterior = models.DecimalField(max_digits=12, decimal_places=2)
    stock_nuevo = models.DecimalField(max_digits=12, decimal_places=2)
    
    referencia_tipo = models.CharField(max_length=50, blank=True)  # Venta, Compra, etc.
    referencia_id = models.UUIDField(null=True, blank=True)
    
    notas = models.TextField(blank=True)
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    fecha = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-fecha']


# =============================================================================
# CLIENTES Y PROVEEDORES
# =============================================================================

class Cliente(models.Model):
    """Clientes del negocio"""
    TIPO_DOC = [
        ('CEDULA', 'Cédula'),
        ('RNC', 'RNC'),
        ('PASAPORTE', 'Pasaporte'),
        ('OTRO', 'Otro'),
    ]
    TIPO_CLIENTE = [
        ('FINAL', 'Consumidor Final'),
        ('CREDITO', 'Crédito Fiscal'),
        ('GUBERNAMENTAL', 'Gubernamental'),
        ('ESPECIAL', 'Régimen Especial'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    tipo_documento = models.CharField(max_length=10, choices=TIPO_DOC, default='CEDULA')
    numero_documento = models.CharField(max_length=20)
    nombre = models.CharField(max_length=200)
    telefono = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.TextField(blank=True)
    
    tipo_cliente = models.CharField(max_length=15, choices=TIPO_CLIENTE, default='FINAL')
    limite_credito = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    cuenta_cobrar = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True)
    
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['negocio', 'numero_documento']
    
    def __str__(self):
        return f"{self.nombre} ({self.numero_documento})"


class Proveedor(models.Model):
    """Proveedores"""
    TIPO_RETENCION = [
        ('NINGUNA', 'Ninguna'),
        ('ISR', 'ISR'),
        ('ITBIS', 'ITBIS'),
        ('AMBAS', 'Ambas'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    identificacion_fiscal = models.CharField(max_length=20)
    nombre = models.CharField(max_length=200)
    nombre_comercial = models.CharField(max_length=200, blank=True)
    telefono = models.CharField(max_length=20)
    email = models.EmailField(blank=True)
    direccion = models.TextField(blank=True)
    
    tipo_retencion = models.CharField(max_length=10, choices=TIPO_RETENCION, default='NINGUNA')
    dias_credito = models.IntegerField(default=0)
    balance = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    cuenta_pagar = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True)
    
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['negocio', 'identificacion_fiscal']
    
    def __str__(self):
        return f"{self.nombre} ({self.identificacion_fiscal})"


# =============================================================================
# VENTAS Y FACTURACIÓN
# =============================================================================

class SecuenciaNCF(models.Model):
    """Control de secuencias de NCF por tipo"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    tipo_comprobante = models.CharField(max_length=10)  # B01, B02, B14, B15, etc.
    serie = models.CharField(max_length=1)
    numero_desde = models.BigIntegerField()
    numero_hasta = models.BigIntegerField()
    numero_actual = models.BigIntegerField()
    fecha_vencimiento = models.DateField()
    activa = models.BooleanField(default=True)
    
    class Meta:
        unique_together = ['negocio', 'tipo_comprobante', 'serie']


class Venta(models.Model):
    """Ventas con soporte de facturación electrónica"""
    TIPO_PAGO = [
        ('EFECTIVO', 'Efectivo'),
        ('TARJETA', 'Tarjeta'),
        ('TRANSFERENCIA', 'Transferencia'),
        ('CHEQUE', 'Cheque'),
        ('CREDITO', 'Crédito'),
        ('MIXTO', 'Mixto'),
    ]
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('COMPLETADA', 'Completada'),
        ('ANULADA', 'Anulada'),
    ]
    ESTADO_FISCAL = [
        ('PENDIENTE', 'Pendiente'),
        ('ENVIADO', 'Enviado'),
        ('APROBADO', 'Aprobado'),
        ('RECHAZADO', 'Rechazado'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    sucursal = models.ForeignKey(Sucursal, on_delete=models.PROTECT, null=True, blank=True)
    
    # Numeración
    numero = models.CharField(max_length=20)
    tipo_comprobante = models.CharField(max_length=10, blank=True)  # B01, B02, etc.
    ncf = models.CharField(max_length=19, blank=True)
    
    # Partes
    cliente = models.ForeignKey(Cliente, on_delete=models.SET_NULL, null=True, blank=True)
    cajero = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    
    # Fechas
    fecha = models.DateTimeField(auto_now_add=True)
    fecha_vencimiento = models.DateField(null=True, blank=True)
    
    # Montos
    moneda = models.ForeignKey(Moneda, on_delete=models.PROTECT, null=True)
    tasa_cambio = models.DecimalField(max_digits=12, decimal_places=4, default=1)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    subtotal_con_descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_impuestos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Costos y ganancias
    costo_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ganancia = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Pago
    tipo_pago = models.CharField(max_length=15, choices=TIPO_PAGO, default='EFECTIVO')
    monto_pagado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cambio = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Estado
    estado = models.CharField(max_length=15, choices=ESTADO, default='BORRADOR')
    estado_fiscal = models.CharField(max_length=15, choices=ESTADO_FISCAL, default='PENDIENTE')
    codigo_seguridad_dgii = models.CharField(max_length=50, blank=True)
    
    # Contabilidad
    asiento = models.ForeignKey(AsientoContable, on_delete=models.SET_NULL, null=True, blank=True)
    
    notas = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['negocio', 'fecha']),
            models.Index(fields=['negocio', 'ncf']),
            models.Index(fields=['negocio', 'cliente']),
        ]
    
    def __str__(self):
        return f"{self.numero} - RD${self.total}"


class DetalleVenta(models.Model):
    """Detalle de productos vendidos"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    venta = models.ForeignKey(Venta, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT)
    almacen = models.ForeignKey(Almacen, on_delete=models.PROTECT, null=True, blank=True)
    
    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    precio_costo = models.DecimalField(max_digits=12, decimal_places=2)
    descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    impuesto = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)


# =============================================================================
# COMPRAS
# =============================================================================

class Compra(models.Model):
    """Compras a proveedores"""
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('RECIBIDA', 'Recibida'),
        ('ANULADA', 'Anulada'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.PROTECT)
    almacen = models.ForeignKey(Almacen, on_delete=models.PROTECT)
    
    numero = models.CharField(max_length=20)
    ncf_proveedor = models.CharField(max_length=19, blank=True)
    factura_proveedor = models.CharField(max_length=50, blank=True)
    
    fecha = models.DateField()
    fecha_recepcion = models.DateField(null=True, blank=True)
    
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_impuestos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    estado = models.CharField(max_length=15, choices=ESTADO, default='BORRADOR')
    asiento = models.ForeignKey(AsientoContable, on_delete=models.SET_NULL, null=True, blank=True)
    
    notas = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)


class DetalleCompra(models.Model):
    """Detalle de productos comprados"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    compra = models.ForeignKey(Compra, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT)
    
    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    impuesto = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)


# =============================================================================
# CAJA Y BANCOS
# =============================================================================

class CuentaBancaria(models.Model):
    """Cuentas bancarias"""
    TIPO = [
        ('CORRIENTE', 'Corriente'),
        ('AHORRO', 'Ahorro'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    banco = models.CharField(max_length=100)
    tipo = models.CharField(max_length=10, choices=TIPO)
    numero = models.CharField(max_length=30)
    moneda = models.ForeignKey(Moneda, on_delete=models.PROTECT)
    saldo = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    
    cuenta_contable = models.ForeignKey(CuentaContable, on_delete=models.SET_NULL, null=True, blank=True)
    activa = models.BooleanField(default=True)


class CuadreCaja(models.Model):
    """Cuadre de caja diario"""
    ESTADO = [
        ('ABIERTO', 'Abierto'),
        ('CERRADO', 'Cerrado'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    sucursal = models.ForeignKey(Sucursal, on_delete=models.CASCADE, null=True, blank=True)
    
    fecha = models.DateField()
    cajero = models.ForeignKey(Usuario, on_delete=models.PROTECT, related_name='cuadres_cajero')
    supervisor = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name='cuadres_supervisor')
    
    efectivo_inicial = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    # Totales calculados
    ventas_efectivo = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ventas_tarjeta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ventas_transferencia = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    ventas_credito = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_ventas = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    efectivo_esperado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    efectivo_contado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    diferencia = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    
    estado = models.CharField(max_length=10, choices=ESTADO, default='ABIERTO')
    notas = models.TextField(blank=True)
    
    abierto_en = models.DateTimeField(auto_now_add=True)
    cerrado_en = models.DateTimeField(null=True, blank=True)


# =============================================================================
# AI AGENT - PREPARACIÓN
# =============================================================================

class AnalisisAI(models.Model):
    """Almacena análisis y predicciones del AI Agent"""
    TIPO = [
        ('CLASIFICACION', 'Clasificación'),
        ('PREDICCION', 'Predicción'),
        ('ANOMALIA', 'Detección de Anomalía'),
        ('INSIGHT', 'Insight'),
        ('RECOMENDACION', 'Recomendación'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    
    tipo = models.CharField(max_length=20, choices=TIPO)
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField()
    datos = models.JSONField(null=True, blank=True)
    
    confianza = models.DecimalField(max_digits=5, decimal_places=2, null=True)  # 0-100
    accionable = models.BooleanField(default=False)
    leido = models.BooleanField(default=False)
    
    fecha = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-fecha']
