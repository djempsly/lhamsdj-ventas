from pathlib import Path
from datetime import timedelta
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# --- SECURITY -----------------------------------------------------------

SECRET_KEY = os.getenv('SECRET_KEY')
if not SECRET_KEY or 'insecure' in SECRET_KEY:
    raise ValueError(
        "SECRET_KEY no configurada o insegura. "
        "Genera una nueva: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
    )

DEBUG = os.getenv('DEBUG', 'False').lower() in ('true', '1')
ALLOWED_HOSTS = [h.strip() for h in os.getenv('ALLOWED_HOSTS', '').split(',') if h.strip()]

# --- APPS ----------------------------------------------------------------

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
    'django_celery_beat',
    'dbbackup',
    'channels',
    'api',
]

# --- MIDDLEWARE ----------------------------------------------------------

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.locale.LocaleMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'csp.middleware.CSPMiddleware',
    'api.middleware.IPBlacklistMiddleware',
    'api.middleware.NegocioFilterMiddleware',
    'api.middleware.SecurityHeadersMiddleware',
    'api.middleware.AuditMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# --- DATABASE ------------------------------------------------------------

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('DB_NAME'),
        'USER': os.getenv('DB_USER'),
        'PASSWORD': os.getenv('DB_PASSWORD'),
        'HOST': os.getenv('DB_HOST', 'localhost'),
        'PORT': os.getenv('DB_PORT', '5432'),
        'CONN_MAX_AGE': 600,
        'OPTIONS': {
            'connect_timeout': 10,
        },
    }
}

# In production with SSL:
if not DEBUG:
    DATABASES['default']['OPTIONS']['sslmode'] = 'prefer'

AUTH_USER_MODEL = 'api.Usuario'

# --- PASSWORD SECURITY ---------------------------------------------------

# Argon2id - superior a bcrypt para resistencia a GPU/ASIC attacks
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.Argon2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
]

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
     'OPTIONS': {'min_length': 12}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
    {'NAME': 'api.security.validators.ComplexPasswordValidator'},
]

# Password expiration (days)
PASSWORD_EXPIRY_DAYS = 90

# Account lockout
MAX_LOGIN_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

# Max concurrent sessions per user
MAX_CONCURRENT_SESSIONS = 3

# --- REST FRAMEWORK ------------------------------------------------------

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'api.authentication.CookieJWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '20/minute',
        'user': '100/minute',
        'login': '5/minute',
        'transactions': '30/minute',
    },
    'EXCEPTION_HANDLER': 'rest_framework.views.exception_handler',
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_RENDERER_CLASSES': [
        'rest_framework.renderers.JSONRenderer',
    ],
    'DEFAULT_VERSIONING_CLASS': 'rest_framework.versioning.URLPathVersioning',
    'DEFAULT_VERSION': 'v1',
    'ALLOWED_VERSIONS': ['v1'],
}

# --- DRF SPECTACULAR (API DOCS) ------------------------------------------

SPECTACULAR_SETTINGS = {
    'TITLE': 'Sistema de Ventas API',
    'DESCRIPTION': 'ERP completo con facturacion electronica DGII, contabilidad, inventario, AI y mas.',
    'VERSION': '2.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'TAGS': [
        {'name': 'Auth', 'description': 'Autenticacion y sesiones'},
        {'name': 'Seguridad', 'description': 'MFA, sesiones, API keys'},
        {'name': 'Negocios', 'description': 'Gestion de empresas'},
        {'name': 'Productos', 'description': 'Inventario y productos'},
        {'name': 'Ventas', 'description': 'Punto de venta y facturacion'},
        {'name': 'Compras', 'description': 'Compras y proveedores'},
        {'name': 'Contabilidad', 'description': 'Plan de cuentas y asientos'},
        {'name': 'Fiscal', 'description': 'Reportes DGII 606/607/608'},
        {'name': 'Bancos', 'description': 'Reconciliacion bancaria'},
        {'name': 'AI', 'description': 'Analisis inteligente'},
    ],
}

# Allow browsable API only in debug mode
if DEBUG:
    REST_FRAMEWORK['DEFAULT_RENDERER_CLASSES'].append(
        'rest_framework.renderers.BrowsableAPIRenderer'
    )

# --- JWT -----------------------------------------------------------------

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
    'TOKEN_OBTAIN_SERIALIZER': 'rest_framework_simplejwt.serializers.TokenObtainPairSerializer',
}

# --- FISCAL ENCRYPTION ---------------------------------------------------

FISCAL_ENCRYPTION_KEY = os.getenv('FISCAL_ENCRYPTION_KEY', '')
AES_256_KEY = os.getenv('AES_256_KEY', '')

# --- AI ------------------------------------------------------------------

ANTHROPIC_API_KEY = os.getenv('ANTHROPIC_API_KEY', '')

# --- COOKIES -------------------------------------------------------------

COOKIE_DOMAIN = os.getenv('COOKIE_DOMAIN', '') or None
COOKIE_SECURE = os.getenv('COOKIE_SECURE', 'False').lower() in ('true', '1')
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'Lax'

# --- CORS ----------------------------------------------------------------

_cors_origins = os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000')
CORS_ALLOWED_ORIGINS = [o.strip() for o in _cors_origins.split(',') if o.strip()]
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
    'x-api-key',
]

# --- SECURITY HEADERS ----------------------------------------------------

SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_BROWSER_XSS_FILTER = True

if not DEBUG:
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_SSL_REDIRECT = True

# --- CSP (Content Security Policy) ---------------------------------------

CSP_DEFAULT_SRC = ("'self'",)
CSP_SCRIPT_SRC = ("'self'",)
CSP_STYLE_SRC = ("'self'", "'unsafe-inline'")
CSP_IMG_SRC = ("'self'", "data:", "https:")
CSP_FONT_SRC = ("'self'", "https://fonts.gstatic.com")
CSP_CONNECT_SRC = ("'self'",)
CSP_FRAME_ANCESTORS = ("'none'",)
CSP_FORM_ACTION = ("'self'",)

# --- REQUEST SIZE LIMITS -------------------------------------------------

DATA_UPLOAD_MAX_MEMORY_SIZE = 10485760  # 10 MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 10485760  # 10 MB

# --- RATE LIMITING (django-ratelimit) ------------------------------------

RATELIMIT_USE_CACHE = 'default'
RATELIMIT_FAIL_OPEN = False

# --- I18N ----------------------------------------------------------------

LANGUAGE_CODE = 'es'
TIME_ZONE = 'America/Santo_Domingo'
USE_I18N = True
USE_L10N = True
USE_TZ = True

LANGUAGES = [
    ('es', 'Espanol'),
    ('en', 'English'),
]

LOCALE_PATHS = [
    BASE_DIR / 'locale',
]

# --- STATIC FILES --------------------------------------------------------

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# --- LOGGING -------------------------------------------------------------

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'filters': {
        'mask_sensitive': {
            '()': 'api.security.log_filters.SensitiveDataFilter',
        },
    },
    'formatters': {
        'verbose': {
            'format': '[{asctime}] {levelname} {name} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
            'filters': ['mask_sensitive'],
        },
        'security_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'security.log',
            'formatter': 'verbose',
            'filters': ['mask_sensitive'],
            'maxBytes': 50 * 1024 * 1024,  # 50 MB
            'backupCount': 10,
        },
        'audit_file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': BASE_DIR / 'logs' / 'audit.log',
            'formatter': 'verbose',
            'filters': ['mask_sensitive'],
            'maxBytes': 50 * 1024 * 1024,
            'backupCount': 10,
        },
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'WARNING',
        },
        'security': {
            'handlers': ['console', 'security_file'],
            'level': 'INFO',
        },
        'audit': {
            'handlers': ['console', 'audit_file'],
            'level': 'INFO',
        },
        'api': {
            'handlers': ['console'],
            'level': 'INFO',
        },
    },
}

# --- CELERY --------------------------------------------------------------

CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/1')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/2')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 300
CELERY_BEAT_SCHEDULE = {
    'reintentar-ecf-contingencia': {
        'task': 'api.tasks.reintentar_ecf_contingencia',
        'schedule': 300.0,
    },
    'backup-diario': {
        'task': 'api.tasks.backup_diario',
        'schedule': 86400.0,  # cada 24 horas
    },
    'limpiar-sesiones-expiradas': {
        'task': 'api.tasks.limpiar_sesiones_expiradas',
        'schedule': 3600.0,  # cada hora
    },
    'detectar-anomalias': {
        'task': 'api.tasks.detectar_anomalias_todos',
        'schedule': 1800.0,  # cada 30 min
    },
    'verificar-licencias': {
        'task': 'api.tasks.verificar_licencias',
        'schedule': 86400.0,  # cada 24 horas
    },
    'limpiar-backups-expirados': {
        'task': 'api.tasks.limpiar_backups_expirados',
        'schedule': 86400.0,
    },
    'limpiar-ips-bloqueadas-expiradas': {
        'task': 'api.tasks.limpiar_ips_expiradas',
        'schedule': 3600.0,
    },
}

# --- CACHE (Redis) -------------------------------------------------------

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_URL', 'redis://localhost:6379/0'),
        'TIMEOUT': 300,
        'OPTIONS': {
            'db': 0,
        },
    }
}

# --- DBBACKUP ------------------------------------------------------------

DBBACKUP_STORAGE = 'django.core.files.storage.FileSystemStorage'
DBBACKUP_STORAGE_OPTIONS = {
    'location': os.getenv('BACKUP_DIR', '/var/backups/sistema-ventas'),
}
DBBACKUP_CLEANUP_KEEP = 30

# --- LICENSE --------------------------------------------------------------

LICENSE_SIGNING_KEY = os.getenv('LICENSE_SIGNING_KEY', SECRET_KEY)

# --- SENTRY --------------------------------------------------------------

SENTRY_DSN = os.getenv('SENTRY_DSN_BACKEND', '')
if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.redis import RedisIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        integrations=[DjangoIntegration(), CeleryIntegration(), RedisIntegration()],
        traces_sample_rate=0.1 if not DEBUG else 1.0,
        send_default_pii=False,
        environment='development' if DEBUG else 'production',
    )
