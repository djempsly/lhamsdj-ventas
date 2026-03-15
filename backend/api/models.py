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


class Impuesto(models.Model):
    """Impuestos flexibles por país - No hardcodea ITBIS"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    pais = models.ForeignKey(Pais, on_delete=models.CASCADE, related_name='impuestos')
    nombre = models.CharField(max_length=50)  # ITBIS, IVA, ISC, Propina Legal, etc.
    codigo = models.CharField(max_length=10)  # ITBIS18, IVA16, ISC, etc.
    tasa = models.DecimalField(max_digits=5, decimal_places=2)
    tipo = models.CharField(max_length=20, choices=[
        ('GENERAL', 'Impuesto General'),
        ('REDUCIDO', 'Tasa Reducida'),
        ('EXENTO', 'Exento'),
        ('ESPECIAL', 'Impuesto Especial'),
    ], default='GENERAL')
    aplica_a = models.CharField(max_length=20, choices=[
        ('PRODUCTOS', 'Productos'),
        ('SERVICIOS', 'Servicios'),
        ('AMBOS', 'Productos y Servicios'),
    ], default='AMBOS')
    activo = models.BooleanField(default=True)

    class Meta:
        unique_together = ['pais', 'codigo']
        ordering = ['pais', 'nombre']

    def __str__(self):
        return f"{self.nombre} ({self.tasa}%) - {self.pais.nombre}"


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
    
    # Configuracion contable
    plan_cuentas_activo = models.BooleanField(default=True)
    cierre_automatico = models.BooleanField(default=False)

    # Seguridad del negocio
    umbral_confirmacion = models.DecimalField(
        max_digits=12, decimal_places=2, default=1000,
        help_text="Monto a partir del cual se requiere doble confirmacion"
    )
    paises_permitidos = models.JSONField(
        default=list, blank=True,
        help_text="ISO 3166-1 alfa-2 codes permitidos para acceso (vacio = sin restriccion)"
    )
    horario_acceso_inicio = models.TimeField(null=True, blank=True)
    horario_acceso_fin = models.TimeField(null=True, blank=True)

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
        ('ALMACEN', 'Encargado de Almacen'),
        ('AUDITOR', 'Auditor'),
        ('INVENTARIO', 'Encargado de Inventario'),
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
    two_factor_secret = models.CharField(max_length=512, blank=True)
    backup_codes = models.JSONField(default=list, blank=True, help_text="Hashed backup codes for 2FA recovery")
    intentos_fallidos = models.IntegerField(default=0)
    cuenta_bloqueada_hasta = models.DateTimeField(null=True, blank=True)
    ultimo_cambio_password = models.DateTimeField(auto_now_add=True)
    forzar_cambio_password = models.BooleanField(default=False)
    max_descuento = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Override del limite de descuento por rol"
    )
    ips_conocidas = models.JSONField(default=list, blank=True)
    horario_acceso_inicio = models.TimeField(null=True, blank=True)
    horario_acceso_fin = models.TimeField(null=True, blank=True)

    # Metadatos
    creado_en = models.DateTimeField(auto_now_add=True)
    ultimo_acceso = models.DateTimeField(null=True, blank=True)

    @property
    def esta_bloqueado(self):
        if self.cuenta_bloqueada_hasta and self.cuenta_bloqueada_hasta > timezone.now():
            return True
        return False

    @property
    def password_expirado(self):
        from django.conf import settings
        if not self.ultimo_cambio_password:
            return True
        days = getattr(settings, 'PASSWORD_EXPIRY_DAYS', 90)
        from datetime import timedelta
        return timezone.now() > self.ultimo_cambio_password + timedelta(days=days)

    def __str__(self):
        return f"{self.get_full_name() or self.username} ({self.get_rol_display()})"


# =============================================================================
# AUDITORÍA Y SEGURIDAD
# =============================================================================

class AuditLog(models.Model):
    """Registro de auditoria INMUTABLE de TODAS las acciones"""
    ACCION_CHOICES = [
        ('LOGIN', 'Inicio de Sesion'),
        ('LOGOUT', 'Cierre de Sesion'),
        ('LOGIN_FALLIDO', 'Intento Fallido'),
        ('CREATE', 'Crear'),
        ('UPDATE', 'Actualizar'),
        ('DELETE', 'Eliminar'),
        ('VIEW', 'Ver'),
        ('EXPORT', 'Exportar'),
        ('PRINT', 'Imprimir'),
        ('MFA_SETUP', 'Configuracion MFA'),
        ('MFA_VERIFY', 'Verificacion MFA'),
        ('PASSWORD_CHANGE', 'Cambio de Password'),
        ('ROLE_CHANGE', 'Cambio de Rol'),
        ('PERMISSION_CHANGE', 'Cambio de Permisos'),
        ('SESSION_INVALIDATE', 'Invalidacion de Sesion'),
        ('API_KEY_CREATE', 'Creacion de API Key'),
        ('SENSITIVE_ACCESS', 'Acceso a Datos Sensibles'),
    ]
    RESULTADO_CHOICES = [
        ('SUCCESS', 'Exitoso'),
        ('FAILED', 'Fallido'),
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
    sesion_id = models.CharField(max_length=255, blank=True)
    duracion_ms = models.IntegerField(null=True, blank=True)
    resultado = models.CharField(max_length=10, choices=RESULTADO_CHOICES, default='SUCCESS')

    fecha = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['negocio', 'fecha']),
            models.Index(fields=['usuario', 'accion']),
            models.Index(fields=['modelo', 'objeto_id']),
            models.Index(fields=['resultado']),
        ]

    def save(self, *args, **kwargs):
        # Inmutable: solo permitir inserts, no updates
        if self.pk:
            try:
                AuditLog.objects.get(pk=self.pk)
                raise ValidationError("Los registros de auditoria son inmutables.")
            except AuditLog.DoesNotExist:
                pass
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Los registros de auditoria no se pueden eliminar.")


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

        # Set estado before clean so validation can run
        self.estado = 'CONTABILIZADO'
        self.clean()
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
        if self.precio_venta > 0:
            return ((self.precio_venta - self.precio_costo) / self.precio_venta) * 100
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

    # GDPR / Proteccion de datos
    consentimiento_datos = models.BooleanField(default=False)
    fecha_consentimiento = models.DateTimeField(null=True, blank=True)

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


# =============================================================================
# COTIZACIONES Y ÓRDENES DE COMPRA (Fase 3A)
# =============================================================================

class Cotizacion(models.Model):
    """Cotizaciones / Presupuestos"""
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('ENVIADA', 'Enviada'),
        ('ACEPTADA', 'Aceptada'),
        ('RECHAZADA', 'Rechazada'),
        ('FACTURADA', 'Facturada'),
        ('VENCIDA', 'Vencida'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    sucursal = models.ForeignKey(Sucursal, on_delete=models.PROTECT, null=True, blank=True)

    numero = models.CharField(max_length=20)
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT)
    vendedor = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)

    fecha = models.DateTimeField(auto_now_add=True)
    fecha_validez = models.DateField(help_text="Válida hasta esta fecha")

    moneda = models.ForeignKey(Moneda, on_delete=models.PROTECT, null=True)
    tasa_cambio = models.DecimalField(max_digits=12, decimal_places=4, default=1)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_impuestos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    condiciones = models.TextField(blank=True, help_text="Términos y condiciones")
    notas = models.TextField(blank=True)

    estado = models.CharField(max_length=12, choices=ESTADO, default='BORRADOR')

    # Referencia a la venta generada (cuando se factura)
    venta = models.ForeignKey(Venta, on_delete=models.SET_NULL, null=True, blank=True, related_name='cotizacion_origen')

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['negocio', 'estado']),
            models.Index(fields=['negocio', 'cliente']),
        ]

    def __str__(self):
        return f"COT-{self.numero}"


class DetalleCotizacion(models.Model):
    """Detalle de productos en cotización"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT)

    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    descuento = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    impuesto = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)


class OrdenCompra(models.Model):
    """Órdenes de compra con flujo de aprobación"""
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('PENDIENTE_APROBACION', 'Pendiente de Aprobación'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
        ('ENVIADA', 'Enviada al Proveedor'),
        ('RECIBIDA_PARCIAL', 'Recibida Parcialmente'),
        ('RECIBIDA', 'Recibida'),
        ('CANCELADA', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.PROTECT)
    almacen = models.ForeignKey(Almacen, on_delete=models.PROTECT, null=True, blank=True)

    numero = models.CharField(max_length=20)
    fecha = models.DateTimeField(auto_now_add=True)
    fecha_entrega_esperada = models.DateField(null=True, blank=True)

    moneda = models.ForeignKey(Moneda, on_delete=models.PROTECT, null=True)
    tasa_cambio = models.DecimalField(max_digits=12, decimal_places=4, default=1)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_impuestos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    estado = models.CharField(max_length=25, choices=ESTADO, default='BORRADOR')
    solicitado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name='ordenes_solicitadas')
    aprobado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name='ordenes_aprobadas')
    fecha_aprobacion = models.DateTimeField(null=True, blank=True)

    # Referencia a la compra generada
    compra = models.ForeignKey(Compra, on_delete=models.SET_NULL, null=True, blank=True, related_name='orden_origen')

    condiciones = models.TextField(blank=True)
    notas = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']
        indexes = [
            models.Index(fields=['negocio', 'estado']),
        ]

    def __str__(self):
        return f"OC-{self.numero}"


class DetalleOrdenCompra(models.Model):
    """Detalle de productos en orden de compra"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    orden = models.ForeignKey(OrdenCompra, on_delete=models.CASCADE, related_name='detalles')
    producto = models.ForeignKey(Producto, on_delete=models.PROTECT)

    cantidad = models.DecimalField(max_digits=12, decimal_places=2)
    cantidad_recibida = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    precio_unitario = models.DecimalField(max_digits=12, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    impuesto = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2)


# =============================================================================
# CUENTAS POR COBRAR / PAGAR (Fase 3B)
# =============================================================================

class CuentaPorCobrar(models.Model):
    """Cuentas por cobrar a clientes"""
    ESTADO = [
        ('PENDIENTE', 'Pendiente'),
        ('PARCIAL', 'Pago Parcial'),
        ('PAGADA', 'Pagada'),
        ('VENCIDA', 'Vencida'),
        ('CANCELADA', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT)
    venta = models.ForeignKey(Venta, on_delete=models.SET_NULL, null=True, blank=True)

    numero = models.CharField(max_length=20)
    fecha_emision = models.DateField()
    fecha_vencimiento = models.DateField()

    monto_original = models.DecimalField(max_digits=12, decimal_places=2)
    monto_pagado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    saldo_pendiente = models.DecimalField(max_digits=12, decimal_places=2)

    estado = models.CharField(max_length=12, choices=ESTADO, default='PENDIENTE')
    notas = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_emision']
        indexes = [
            models.Index(fields=['negocio', 'estado']),
            models.Index(fields=['negocio', 'cliente']),
            models.Index(fields=['negocio', 'fecha_vencimiento']),
        ]

    def __str__(self):
        return f"CxC-{self.numero} ({self.cliente.nombre})"

    @property
    def dias_vencida(self):
        if self.estado in ('PAGADA', 'CANCELADA'):
            return 0
        dias = (timezone.now().date() - self.fecha_vencimiento).days
        return max(0, dias)


class CuentaPorPagar(models.Model):
    """Cuentas por pagar a proveedores"""
    ESTADO = [
        ('PENDIENTE', 'Pendiente'),
        ('PARCIAL', 'Pago Parcial'),
        ('PAGADA', 'Pagada'),
        ('VENCIDA', 'Vencida'),
        ('CANCELADA', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    proveedor = models.ForeignKey(Proveedor, on_delete=models.PROTECT)
    compra = models.ForeignKey(Compra, on_delete=models.SET_NULL, null=True, blank=True)

    numero = models.CharField(max_length=20)
    fecha_emision = models.DateField()
    fecha_vencimiento = models.DateField()

    monto_original = models.DecimalField(max_digits=12, decimal_places=2)
    monto_pagado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    saldo_pendiente = models.DecimalField(max_digits=12, decimal_places=2)

    estado = models.CharField(max_length=12, choices=ESTADO, default='PENDIENTE')
    notas = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_emision']
        indexes = [
            models.Index(fields=['negocio', 'estado']),
            models.Index(fields=['negocio', 'proveedor']),
            models.Index(fields=['negocio', 'fecha_vencimiento']),
        ]

    def __str__(self):
        return f"CxP-{self.numero} ({self.proveedor.nombre})"

    @property
    def dias_vencida(self):
        if self.estado in ('PAGADA', 'CANCELADA'):
            return 0
        dias = (timezone.now().date() - self.fecha_vencimiento).days
        return max(0, dias)


class Pago(models.Model):
    """Pagos aplicados a CxC o CxP"""
    TIPO = [
        ('COBRO', 'Cobro a Cliente'),
        ('PAGO', 'Pago a Proveedor'),
    ]
    METODO = [
        ('EFECTIVO', 'Efectivo'),
        ('CHEQUE', 'Cheque'),
        ('TRANSFERENCIA', 'Transferencia'),
        ('TARJETA', 'Tarjeta'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)

    tipo = models.CharField(max_length=6, choices=TIPO)
    metodo_pago = models.CharField(max_length=15, choices=METODO)
    fecha = models.DateField()
    monto = models.DecimalField(max_digits=12, decimal_places=2)
    referencia = models.CharField(max_length=50, blank=True, help_text="Nro. cheque, transferencia, etc.")

    # Vinculaciones (una de las dos)
    cuenta_por_cobrar = models.ForeignKey(CuentaPorCobrar, on_delete=models.SET_NULL, null=True, blank=True, related_name='pagos')
    cuenta_por_pagar = models.ForeignKey(CuentaPorPagar, on_delete=models.SET_NULL, null=True, blank=True, related_name='pagos')

    cuenta_bancaria = models.ForeignKey(CuentaBancaria, on_delete=models.SET_NULL, null=True, blank=True)
    asiento = models.ForeignKey(AsientoContable, on_delete=models.SET_NULL, null=True, blank=True)

    notas = models.TextField(blank=True)
    creado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha']

    def __str__(self):
        return f"Pago {self.tipo} - {self.monto}"


# =============================================================================
# RECURSOS HUMANOS / NÓMINA (Fase 5A)
# =============================================================================

class Departamento(models.Model):
    """Departamentos de la empresa"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    nombre = models.CharField(max_length=100)
    codigo = models.CharField(max_length=10)
    responsable = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
    activo = models.BooleanField(default=True)

    class Meta:
        unique_together = ['negocio', 'codigo']

    def __str__(self):
        return self.nombre


class Empleado(models.Model):
    """Empleados del negocio"""
    TIPO_CONTRATO = [
        ('INDEFINIDO', 'Indefinido'),
        ('TEMPORAL', 'Temporal'),
        ('PRUEBA', 'Período de Prueba'),
        ('PASANTIA', 'Pasantía'),
    ]
    ESTADO = [
        ('ACTIVO', 'Activo'),
        ('VACACIONES', 'En Vacaciones'),
        ('LICENCIA', 'En Licencia'),
        ('SUSPENDIDO', 'Suspendido'),
        ('DESVINCULADO', 'Desvinculado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    usuario = models.OneToOneField(Usuario, on_delete=models.SET_NULL, null=True, blank=True, related_name='empleado')
    departamento = models.ForeignKey(Departamento, on_delete=models.SET_NULL, null=True, blank=True)
    sucursal = models.ForeignKey(Sucursal, on_delete=models.SET_NULL, null=True, blank=True)

    # Datos personales
    codigo = models.CharField(max_length=20)
    nombre = models.CharField(max_length=200)
    cedula = models.CharField(max_length=15)
    fecha_nacimiento = models.DateField(null=True, blank=True)
    genero = models.CharField(max_length=1, choices=[('M', 'Masculino'), ('F', 'Femenino')], blank=True)
    telefono = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    direccion = models.TextField(blank=True)

    # Datos laborales
    cargo = models.CharField(max_length=100)
    tipo_contrato = models.CharField(max_length=12, choices=TIPO_CONTRATO, default='INDEFINIDO')
    fecha_ingreso = models.DateField()
    fecha_salida = models.DateField(null=True, blank=True)

    # Salario
    salario_bruto = models.DecimalField(max_digits=12, decimal_places=2)
    moneda = models.ForeignKey(Moneda, on_delete=models.PROTECT, null=True)

    # TSS (Tesorería de la Seguridad Social - RD)
    nss = models.CharField(max_length=20, blank=True, help_text="Número de Seguridad Social")

    estado = models.CharField(max_length=15, choices=ESTADO, default='ACTIVO')
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['negocio', 'codigo']
        indexes = [
            models.Index(fields=['negocio', 'estado']),
        ]

    def __str__(self):
        return f"{self.codigo} - {self.nombre}"


class Nomina(models.Model):
    """Nómina de pagos"""
    TIPO = [
        ('QUINCENAL', 'Quincenal'),
        ('MENSUAL', 'Mensual'),
        ('SEMANAL', 'Semanal'),
        ('ESPECIAL', 'Especial'),
    ]
    ESTADO = [
        ('BORRADOR', 'Borrador'),
        ('CALCULADA', 'Calculada'),
        ('APROBADA', 'Aprobada'),
        ('PAGADA', 'Pagada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)

    nombre = models.CharField(max_length=100)
    tipo = models.CharField(max_length=12, choices=TIPO, default='MENSUAL')
    periodo_desde = models.DateField()
    periodo_hasta = models.DateField()

    total_bruto = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_deducciones = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_aportes_patronales = models.DecimalField(max_digits=15, decimal_places=2, default=0)
    total_neto = models.DecimalField(max_digits=15, decimal_places=2, default=0)

    estado = models.CharField(max_length=12, choices=ESTADO, default='BORRADOR')
    aprobado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
    asiento = models.ForeignKey(AsientoContable, on_delete=models.SET_NULL, null=True, blank=True)

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-periodo_desde']

    def __str__(self):
        return f"{self.nombre} ({self.periodo_desde} - {self.periodo_hasta})"


class DetalleNomina(models.Model):
    """Detalle de nómina por empleado"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    nomina = models.ForeignKey(Nomina, on_delete=models.CASCADE, related_name='detalles')
    empleado = models.ForeignKey(Empleado, on_delete=models.PROTECT)

    salario_bruto = models.DecimalField(max_digits=12, decimal_places=2)
    horas_extra = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    monto_horas_extra = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    comisiones = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    bonificaciones = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    otros_ingresos = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_ingresos = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Deducciones empleado (TSS RD)
    sfs_empleado = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Seguro Familiar de Salud 3.04%")
    afp_empleado = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Fondo de Pensiones 2.87%")
    isr = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Impuesto Sobre la Renta")
    otras_deducciones = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_deducciones = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    # Aportes patronales
    sfs_patronal = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="SFS Patronal 7.09%")
    afp_patronal = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="AFP Patronal 7.10%")
    srl = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="Seguro de Riesgos Laborales 1.10%")
    infotep = models.DecimalField(max_digits=12, decimal_places=2, default=0, help_text="INFOTEP 1.00%")
    total_aportes_patronales = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    salario_neto = models.DecimalField(max_digits=12, decimal_places=2, default=0)


class Vacacion(models.Model):
    """Control de vacaciones"""
    ESTADO = [
        ('SOLICITADA', 'Solicitada'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
        ('EN_CURSO', 'En Curso'),
        ('COMPLETADA', 'Completada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    empleado = models.ForeignKey(Empleado, on_delete=models.CASCADE, related_name='vacaciones')

    fecha_desde = models.DateField()
    fecha_hasta = models.DateField()
    dias = models.IntegerField()

    estado = models.CharField(max_length=12, choices=ESTADO, default='SOLICITADA')
    aprobado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
    notas = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_desde']


# =============================================================================
# CRM (Fase 5B)
# =============================================================================

class EtapaCRM(models.Model):
    """Etapas del pipeline de ventas"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)

    nombre = models.CharField(max_length=50)
    orden = models.IntegerField(default=0)
    probabilidad = models.IntegerField(default=0, help_text="Probabilidad de cierre 0-100")
    color = models.CharField(max_length=7, default='#0ea5e9')
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ['orden']
        unique_together = ['negocio', 'nombre']

    def __str__(self):
        return self.nombre


class Oportunidad(models.Model):
    """Oportunidades de venta (CRM)"""
    PRIORIDAD = [
        ('BAJA', 'Baja'),
        ('MEDIA', 'Media'),
        ('ALTA', 'Alta'),
        ('URGENTE', 'Urgente'),
    ]
    ESTADO = [
        ('ABIERTA', 'Abierta'),
        ('GANADA', 'Ganada'),
        ('PERDIDA', 'Perdida'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)

    titulo = models.CharField(max_length=200)
    cliente = models.ForeignKey(Cliente, on_delete=models.PROTECT)
    etapa = models.ForeignKey(EtapaCRM, on_delete=models.PROTECT)

    valor_estimado = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    moneda = models.ForeignKey(Moneda, on_delete=models.PROTECT, null=True)

    fecha_cierre_esperada = models.DateField(null=True, blank=True)
    prioridad = models.CharField(max_length=7, choices=PRIORIDAD, default='MEDIA')
    estado = models.CharField(max_length=7, choices=ESTADO, default='ABIERTA')

    asignado_a = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, related_name='oportunidades')
    descripcion = models.TextField(blank=True)

    # Referencias a documentos
    cotizacion = models.ForeignKey(Cotizacion, on_delete=models.SET_NULL, null=True, blank=True)
    venta = models.ForeignKey(Venta, on_delete=models.SET_NULL, null=True, blank=True)

    razon_perdida = models.TextField(blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    actualizado_en = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-creado_en']
        indexes = [
            models.Index(fields=['negocio', 'estado']),
            models.Index(fields=['negocio', 'etapa']),
        ]

    def __str__(self):
        return self.titulo


class ActividadCRM(models.Model):
    """Actividades y seguimiento de oportunidades"""
    TIPO = [
        ('LLAMADA', 'Llamada'),
        ('EMAIL', 'Email'),
        ('REUNION', 'Reunión'),
        ('NOTA', 'Nota'),
        ('TAREA', 'Tarea'),
        ('SEGUIMIENTO', 'Seguimiento'),
    ]
    ESTADO = [
        ('PENDIENTE', 'Pendiente'),
        ('COMPLETADA', 'Completada'),
        ('CANCELADA', 'Cancelada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    oportunidad = models.ForeignKey(Oportunidad, on_delete=models.CASCADE, related_name='actividades')

    tipo = models.CharField(max_length=12, choices=TIPO)
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField(blank=True)

    fecha_programada = models.DateTimeField(null=True, blank=True)
    fecha_completada = models.DateTimeField(null=True, blank=True)

    asignado_a = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    estado = models.CharField(max_length=12, choices=ESTADO, default='PENDIENTE')

    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-fecha_programada']

    def __str__(self):
        return f"{self.tipo}: {self.titulo}"


# =============================================================================
# MULTI-MONEDA AVANZADA (Fase 4A)
# =============================================================================

class TasaCambio(models.Model):
    """Historial de tasas de cambio"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    moneda_origen = models.ForeignKey(Moneda, on_delete=models.CASCADE, related_name='tasas_origen')
    moneda_destino = models.ForeignKey(Moneda, on_delete=models.CASCADE, related_name='tasas_destino')
    tasa = models.DecimalField(max_digits=12, decimal_places=6)
    fecha = models.DateField()
    fuente = models.CharField(max_length=50, blank=True, help_text="BCRD, manual, API")

    class Meta:
        ordering = ['-fecha']
        unique_together = ['moneda_origen', 'moneda_destino', 'fecha']
        indexes = [
            models.Index(fields=['moneda_origen', 'moneda_destino', 'fecha']),
        ]

    def __str__(self):
        return f"{self.moneda_origen}/{self.moneda_destino}: {self.tasa} ({self.fecha})"


# =============================================================================
# SEGURIDAD EMPRESARIAL - MODELOS
# =============================================================================

class SesionActiva(models.Model):
    """Control de sesiones concurrentes (max 3 por usuario)"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    usuario = models.ForeignKey(Usuario, on_delete=models.CASCADE, related_name='sesiones')
    token_jti = models.CharField(max_length=255, unique=True, db_index=True)
    ip_address = models.GenericIPAddressField(null=True)
    user_agent = models.TextField(blank=True, default='')
    creado_en = models.DateTimeField(auto_now_add=True)
    ultimo_uso = models.DateTimeField(auto_now=True)
    activa = models.BooleanField(default=True)

    class Meta:
        ordering = ['-creado_en']
        indexes = [
            models.Index(fields=['usuario', 'activa']),
        ]

    def __str__(self):
        return f"Sesion {self.usuario.username} ({self.ip_address})"


class ApiKey(models.Model):
    """API keys con scopes para integraciones externas"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE, related_name='api_keys')
    nombre = models.CharField(max_length=100)
    key_hash = models.CharField(max_length=255, unique=True)
    key_prefix = models.CharField(max_length=12)
    scopes = models.JSONField(default=list, help_text="Ej: ['ventas:read', 'productos:read']")
    activa = models.BooleanField(default=True)
    ultimo_uso = models.DateTimeField(null=True, blank=True)
    expira_en = models.DateTimeField(null=True, blank=True)
    creado_por = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.nombre} ({self.key_prefix}...)"

    @property
    def esta_expirada(self):
        if self.expira_en and self.expira_en < timezone.now():
            return True
        return False


class IPBloqueada(models.Model):
    """IPs bloqueadas automatica o manualmente"""
    ip_address = models.GenericIPAddressField(unique=True)
    razon = models.CharField(max_length=255)
    intentos = models.IntegerField(default=0)
    bloqueado_hasta = models.DateTimeField(null=True, blank=True)
    permanente = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "IPs Bloqueadas"

    def __str__(self):
        return f"{self.ip_address} - {self.razon}"

    @property
    def esta_bloqueada(self):
        if self.permanente:
            return True
        if self.bloqueado_hasta and self.bloqueado_hasta > timezone.now():
            return True
        return False


class AlertaSeguridad(models.Model):
    """Alertas de seguridad en tiempo real"""
    TIPO_CHOICES = [
        ('LOGIN_FALLIDO', 'Intentos de login fallidos'),
        ('CAMBIO_ROL', 'Cambio de rol administrativo'),
        ('ELIMINACION_MASIVA', 'Eliminacion masiva de datos'),
        ('ACCESO_FUERA_HORARIO', 'Acceso fuera de horario'),
        ('IP_NUEVA', 'Login desde IP nueva'),
        ('DESCUADRE', 'Descuadre de caja significativo'),
        ('ANULACIONES', 'Exceso de anulaciones'),
        ('DESCUENTO_EXCESIVO', 'Descuento excesivo aplicado'),
        ('TRANSACCION_ALTA', 'Transaccion de monto alto'),
        ('ANOMALIA', 'Anomalia detectada'),
        ('CUENTA_BLOQUEADA', 'Cuenta bloqueada'),
        ('IP_BLOQUEADA', 'IP bloqueada'),
    ]
    SEVERIDAD_CHOICES = [
        ('BAJA', 'Baja'),
        ('MEDIA', 'Media'),
        ('ALTA', 'Alta'),
        ('CRITICA', 'Critica'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE, related_name='alertas_seguridad')
    tipo = models.CharField(max_length=30, choices=TIPO_CHOICES)
    severidad = models.CharField(max_length=10, choices=SEVERIDAD_CHOICES, default='MEDIA')
    titulo = models.CharField(max_length=200)
    descripcion = models.TextField()
    usuario = models.ForeignKey(Usuario, on_delete=models.SET_NULL, null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    datos = models.JSONField(default=dict, blank=True)
    leida = models.BooleanField(default=False)
    resuelta = models.BooleanField(default=False)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']
        indexes = [
            models.Index(fields=['negocio', 'tipo', 'creado_en']),
            models.Index(fields=['leida', 'resuelta']),
        ]

    def __str__(self):
        return f"[{self.severidad}] {self.titulo}"


class ConfirmacionTransaccion(models.Model):
    """Doble confirmacion para transacciones de monto alto"""
    ESTADO_CHOICES = [
        ('PENDIENTE', 'Pendiente'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
        ('EXPIRADA', 'Expirada'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    tipo = models.CharField(max_length=50)
    objeto_id = models.CharField(max_length=100)
    monto = models.DecimalField(max_digits=15, decimal_places=2)
    solicitado_por = models.ForeignKey(
        Usuario, on_delete=models.CASCADE, related_name='confirmaciones_solicitadas'
    )
    confirmado_por = models.ForeignKey(
        Usuario, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='confirmaciones_aprobadas'
    )
    estado = models.CharField(max_length=20, choices=ESTADO_CHOICES, default='PENDIENTE')
    expira_en = models.DateTimeField()
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.tipo} ${self.monto} - {self.estado}"

    @property
    def esta_expirada(self):
        return timezone.now() > self.expira_en and self.estado == 'PENDIENTE'


class TokenPago(models.Model):
    """Tokenizacion de pagos - PCI DSS nivel 4"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE)
    cliente = models.ForeignKey('Cliente', on_delete=models.CASCADE, related_name='tokens_pago')
    token = models.CharField(max_length=255, unique=True)
    ultimos_4 = models.CharField(max_length=4)
    tipo_tarjeta = models.CharField(max_length=20)
    expiracion_mes = models.IntegerField()
    expiracion_ano = models.IntegerField()
    activo = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.tipo_tarjeta} ****{self.ultimos_4}"


class LicenciaSistema(models.Model):
    """Licencias HMAC-SHA256 vinculadas a negocio"""
    TIPO_CHOICES = [
        ('TRIAL', 'Prueba'),
        ('BASICO', 'Basico'),
        ('PROFESIONAL', 'Profesional'),
        ('ENTERPRISE', 'Enterprise'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    negocio = models.ForeignKey(Negocio, on_delete=models.CASCADE, related_name='licencias')
    clave_licencia = models.CharField(max_length=512, unique=True)
    tipo = models.CharField(max_length=20, choices=TIPO_CHOICES)
    max_usuarios = models.IntegerField(default=5)
    max_sucursales = models.IntegerField(default=1)
    modulos = models.JSONField(default=list)
    fecha_inicio = models.DateField()
    fecha_fin = models.DateField()
    firma_hmac = models.CharField(max_length=128)
    ultima_verificacion = models.DateTimeField(null=True, blank=True)
    activa = models.BooleanField(default=True)
    creado_en = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"{self.negocio} - {self.tipo} (hasta {self.fecha_fin})"


class BackupRegistro(models.Model):
    """Registro de backups con verificacion de integridad"""
    TIPO_CHOICES = [
        ('DIARIO', 'Diario'),
        ('MIGRACION', 'Pre-migracion'),
        ('MANUAL', 'Manual'),
    ]
    ESTADO_CHOICES = [
        ('EN_PROGRESO', 'En progreso'),
        ('COMPLETADO', 'Completado'),
        ('FALLIDO', 'Fallido'),
        ('VERIFICADO', 'Verificado'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tipo = models.CharField(max_length=15, choices=TIPO_CHOICES)
    archivo = models.CharField(max_length=500)
    tamano_bytes = models.BigIntegerField(default=0)
    checksum_sha256 = models.CharField(max_length=64, blank=True)
    encriptado = models.BooleanField(default=True)
    estado = models.CharField(max_length=15, choices=ESTADO_CHOICES, default='EN_PROGRESO')
    test_restauracion = models.DateTimeField(null=True, blank=True)
    creado_en = models.DateTimeField(auto_now_add=True)
    expira_en = models.DateTimeField()

    class Meta:
        ordering = ['-creado_en']

    def __str__(self):
        return f"Backup {self.tipo} - {self.creado_en.strftime('%Y-%m-%d')}"
