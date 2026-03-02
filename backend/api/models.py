from django.db import models
from django.contrib.auth.models import AbstractUser
from django.core.validators import MinValueValidator
from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Sum, Q, F
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
    # SECURITY NOTE: Store encrypted or in Vault. Never plain text.
    certificado_digital_path = models.CharField(max_length=255, blank=True, help_text="Ruta segura al .p12")
    certificado_pass_env = models.CharField(max_length=100, blank=True, help_text="Nombre de ENV VAR con la clave")
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

    @property
    def api_fiscal_clave_decrypted(self):
        """Descifra la clave fiscal al leer."""
        if not self.api_fiscal_clave:
            return ''
        try:
            from .utils.crypto import decrypt_value
            return decrypt_value(self.api_fiscal_clave)
        except Exception:
            return self.api_fiscal_clave

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
# CONTABILIDAD - MOTOR CONTABLE REAL (Task 3 & 4)
# =============================================================================

class CuentaContableManager(models.Manager):
    """Manager para consultas avanzadas de contabilidad"""
    def get_balance(self, cuenta_id, fecha_inicio=None, fecha_fin=None):
        """Calcula el balance de una cuenta en un rango de fechas"""
        qs = LineaAsiento.objects.filter(
            cuenta_id=cuenta_id,
            asiento__estado='CONTABILIZADO'
        )
        if fecha_inicio:
            qs = qs.filter(asiento__fecha__gte=fecha_inicio)
        if fecha_fin:
            qs = qs.filter(asiento__fecha__lte=fecha_fin)
            
        res = qs.aggregate(
            total_debe=Sum('debe'),
            total_haber=Sum('haber')
        )
        debe = res['total_debe'] or Decimal(0)
        haber = res['total_haber'] or Decimal(0)
        
        # El balance depende de la naturaleza
        cuenta = self.get(id=cuenta_id)
        if cuenta.naturaleza == 'DEUDORA':
            return debe - haber
        else:
            return haber - debe

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
    
    objects = CuentaContableManager()
    
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
    """Asientos contables - ACID Compliant"""
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
    periodo = models.ForeignKey(PeriodoContable, on_delete=models.PROTECT, null=True, blank=True)
    
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
        indexes = [
            models.Index(fields=['negocio', 'fecha']),
            models.Index(fields=['negocio', 'estado']),
        ]
        
    def clean(self):
        """Validación estricta de partida doble"""
        if self.estado == 'CONTABILIZADO':
            if abs(self.total_debe - self.total_haber) > Decimal('0.01'):
                raise ValidationError("El asiento no está balanceado (Debe != Haber).")
            if not self.lineas.exists():
                raise ValidationError("Un asiento contabilizado debe tener líneas.")

    @transaction.atomic
    def contabilizar(self):
        """Método seguro para contabilizar el asiento"""
        # Recalcular totales reales desde líneas
        totales = self.lineas.aggregate(d=Sum('debe'), h=Sum('haber'))
        self.total_debe = totales['d'] or 0
        self.total_haber = totales['h'] or 0
        
        self.clean() # Validar balance
        
        self.estado = 'CONTABILIZADO'
        self.save()
        
        # Actualizar saldos de cuentas (opcional si se usa cálculo al vuelo)
        for linea in self.lineas.all():
            cuenta = linea.cuenta
            if cuenta.naturaleza == 'DEUDORA':
                cuenta.saldo_actual += (linea.debe - linea.haber)
            else:
                cuenta.saldo_actual += (linea.haber - linea.debe)
            cuenta.save()


class LineaAsiento(models.Model):
    """Líneas de asiento contable"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asiento = models.ForeignKey(AsientoContable, on_delete=models.CASCADE, related_name='lineas')
    cuenta = models.ForeignKey(CuentaContable, on_delete=models.PROTECT)
    
    descripcion = models.CharField(max_length=200, blank=True)
    debe = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    haber = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=Q(debe__gte=0) & Q(haber__gte=0),
                name='monto_positivo'
            )
        ]


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
# VENTAS Y FACTURACIÓN (e-CF Enhanced)
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
        ('NO_FISCAL', 'No Fiscal'),
        ('PENDIENTE', 'Pendiente de Envío'),
        ('ENVIADO', 'Enviado a DGII'),
        ('ACEPTADO', 'Aceptado'),
        ('RECHAZADO', 'Rechazado'),
        ('EN_CONTINGENCIA', 'En Contingencia'),
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
    estado_fiscal = models.CharField(max_length=20, choices=ESTADO_FISCAL, default='NO_FISCAL')
    codigo_seguridad_dgii = models.CharField(max_length=6, blank=True, help_text="Código de 6 dígitos del e-CF")
    
    # Contabilidad
    asiento = models.ForeignKey(AsientoContable, on_delete=models.SET_NULL, null=True, blank=True)

    # Referencia para notas de crédito/débito
    venta_referencia = models.ForeignKey(
        'self', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='notas_credito_debito',
        help_text="Venta original referenciada por nota de crédito/débito"
    )

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


class FacturaElectronica(models.Model):
    """Extension de Venta para e-CF DGII (Task 1: Invoice Model)"""
    venta = models.OneToOneField(Venta, on_delete=models.CASCADE, related_name='ecf_data', primary_key=True)
    
    track_id = models.CharField(max_length=50, unique=True, null=True, blank=True)
    ecf_tipo = models.CharField(max_length=3, default='31') # 31: Factura Crédito Fiscal, 32: Consumo, etc.
    fecha_firma = models.DateTimeField(null=True, blank=True)
    
    xml_firmado = models.TextField(blank=True, help_text="XML completo firmado (XMLDSig)")
    respuesta_dgii = models.JSONField(null=True, blank=True, help_text="Respuesta cruda de la DGII")
    
    qr_code_url = models.URLField(max_length=500, blank=True)
    
    def __str__(self):
        return f"eCF: {self.venta.ncf}"


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
    TIPO_BIENES_SERVICIOS = [
        ('01', '01 - Gastos de Personal'),
        ('02', '02 - Gastos por Trabajos, Suministros y Servicios'),
        ('03', '03 - Arrendamientos'),
        ('04', '04 - Gastos de Activos Fijos'),
        ('05', '05 - Gastos de Representación'),
        ('06', '06 - Otras Deducciones Admitidas'),
        ('07', '07 - Gastos Financieros'),
        ('08', '08 - Gastos Extraordinarios'),
        ('09', '09 - Compras y Gastos que forman parte del Costo de Venta'),
        ('10', '10 - Adquisiciones de Activos'),
        ('11', '11 - Gastos de Seguros'),
        ('12', '12 - Otros Gastos'),
        ('13', '13 - Compra de bienes'),
    ]
    FORMA_PAGO_CHOICES = [
        ('EFECTIVO', 'Efectivo'),
        ('CHEQUE', 'Cheque/Transferencia'),
        ('TRANSFERENCIA', 'Transferencia'),
        ('TARJETA', 'Tarjeta'),
        ('CREDITO', 'A Crédito'),
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
    fecha_pago = models.DateField(null=True, blank=True)

    # Clasificación DGII
    tipo_bienes_servicios = models.CharField(
        max_length=2, choices=TIPO_BIENES_SERVICIOS, default='02',
    )
    forma_pago = models.CharField(
        max_length=15, choices=FORMA_PAGO_CHOICES, default='CREDITO',
    )

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_impuestos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Retenciones
    itbis_retenido = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    retencion_renta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    tipo_retencion = models.CharField(max_length=20, blank=True, help_text="Según norma 07-2007")

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


# =============================================================================
# RECONCILIACIÓN BANCARIA
# =============================================================================

class MovimientoBancario(models.Model):
    """Movimientos importados de extractos bancarios"""
    TIPO = [
        ('DEBITO', 'Débito'),
        ('CREDITO', 'Crédito'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cuenta = models.ForeignKey(CuentaBancaria, on_delete=models.CASCADE, related_name='movimientos')

    fecha = models.DateField()
    descripcion = models.CharField(max_length=300)
    referencia = models.CharField(max_length=100, blank=True)
    monto = models.DecimalField(max_digits=15, decimal_places=2)
    tipo = models.CharField(max_length=7, choices=TIPO)
    saldo_posterior = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    conciliado = models.BooleanField(default=False)
    asiento_contable = models.ForeignKey(
        AsientoContable, on_delete=models.SET_NULL, null=True, blank=True,
    )
    importado_de = models.CharField(max_length=100, blank=True, help_text="Fuente del extracto")

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha', '-creado_en']
        indexes = [
            models.Index(fields=['cuenta', 'fecha']),
            models.Index(fields=['cuenta', 'conciliado']),
        ]

    def __str__(self):
        return f"{self.fecha} - {self.descripcion} - {self.monto}"


class Conciliacion(models.Model):
    """Registro de conciliaciones bancarias"""
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('COMPLETADA', 'Completada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cuenta_bancaria = models.ForeignKey(CuentaBancaria, on_delete=models.CASCADE, related_name='conciliaciones')

    fecha_desde = models.DateField()
    fecha_hasta = models.DateField()
    saldo_extracto = models.DecimalField(max_digits=15, decimal_places=2)
    saldo_libros = models.DecimalField(max_digits=15, decimal_places=2)
    diferencia = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    estado = models.CharField(max_length=12, choices=ESTADO, default='BORRADOR')
    creado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']

    def __str__(self):
        return f"Conciliación {self.cuenta_bancaria} ({self.fecha_desde} - {self.fecha_hasta})"
