import logging
import time
import requests
from requests.exceptions import RequestException

logger = logging.getLogger('security')

AMBIENTES = {
    'TEST': 'https://ecf.dgii.gov.do/TesteCF/',
    'PROD': 'https://ecf.dgii.gov.do/CerteCF/',
}

ESTADO_ACEPTADO = 'ACEPTADO'
ESTADO_RECHAZADO = 'RECHAZADO'
ESTADO_EN_PROCESO = 'EN_PROCESO'
ESTADO_ERROR = 'ERROR'


class DGIIClient:
    """Cliente para la API de e-CF de la DGII."""

    def __init__(self, ambiente, rnc, usuario=None, clave=None):
        self.base_url = AMBIENTES.get(ambiente, AMBIENTES['TEST'])
        self.rnc = rnc
        self.usuario = usuario
        self.clave = clave
        self.timeout = 30
        self.max_retries = 3
        self.session = requests.Session()
        if usuario and clave:
            self.session.auth = (usuario, clave)
        self.session.headers.update({
            'Content-Type': 'application/xml',
            'Accept': 'application/json',
        })

    def _request_with_retry(self, method, url, **kwargs):
        """Ejecuta request con retry y backoff exponencial."""
        last_exception = None
        for attempt in range(self.max_retries):
            try:
                response = self.session.request(
                    method, url, timeout=self.timeout, **kwargs
                )
                return response
            except RequestException as e:
                last_exception = e
                wait = 2 ** attempt
                logger.warning(
                    'DGII API intento %d/%d falló: %s. Reintentando en %ds...',
                    attempt + 1, self.max_retries, e, wait,
                )
                time.sleep(wait)
        raise last_exception

    def enviar_ecf(self, xml_firmado):
        """
        Envía un e-CF firmado a la DGII.

        Returns:
            dict: {estado, track_id, mensaje, respuesta_cruda}
        """
        url = f'{self.base_url}eCFRecepcion/api/ECFRecepcion'
        try:
            response = self._request_with_retry(
                'POST', url, data=xml_firmado.encode('utf-8'),
            )

            if response.status_code == 200:
                data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                track_id = data.get('trackId', data.get('TrackId', ''))
                return {
                    'estado': ESTADO_EN_PROCESO,
                    'track_id': track_id,
                    'mensaje': data.get('mensaje', 'e-CF enviado correctamente'),
                    'respuesta_cruda': data,
                }
            elif response.status_code == 401:
                return {
                    'estado': ESTADO_ERROR,
                    'track_id': '',
                    'mensaje': 'Credenciales DGII inválidas.',
                    'respuesta_cruda': {'status_code': 401},
                }
            else:
                return {
                    'estado': ESTADO_RECHAZADO,
                    'track_id': '',
                    'mensaje': f'DGII rechazó el e-CF. HTTP {response.status_code}',
                    'respuesta_cruda': {
                        'status_code': response.status_code,
                        'body': response.text[:500],
                    },
                }

        except RequestException as e:
            logger.error('Error de conexión con DGII: %s', e)
            return {
                'estado': ESTADO_ERROR,
                'track_id': '',
                'mensaje': f'Error de conexión con DGII: {e}',
                'respuesta_cruda': {'error': str(e)},
            }

    def consultar_estado(self, track_id):
        """Consulta el estado de un e-CF enviado."""
        url = f'{self.base_url}eCFConsulta/api/ECFConsulta/{track_id}'
        try:
            response = self._request_with_retry('GET', url)
            if response.status_code == 200:
                data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                estado = data.get('estado', ESTADO_EN_PROCESO)
                return {
                    'estado': estado,
                    'mensaje': data.get('mensaje', ''),
                    'respuesta_cruda': data,
                }
            return {
                'estado': ESTADO_EN_PROCESO,
                'mensaje': f'HTTP {response.status_code}',
                'respuesta_cruda': {'status_code': response.status_code},
            }
        except RequestException as e:
            return {
                'estado': ESTADO_ERROR,
                'mensaje': str(e),
                'respuesta_cruda': {'error': str(e)},
            }

    def consultar_timbre(self, track_id):
        """Consulta datos del timbre/QR de un e-CF."""
        url = f'{self.base_url}eCFTimbre/api/ECFTimbre/{track_id}'
        try:
            response = self._request_with_retry('GET', url)
            if response.status_code == 200:
                data = response.json() if response.headers.get('content-type', '').startswith('application/json') else {}
                return {
                    'exito': True,
                    'qr_data': data.get('qrCode', data.get('QRCode', '')),
                    'respuesta_cruda': data,
                }
            return {
                'exito': False,
                'qr_data': '',
                'respuesta_cruda': {'status_code': response.status_code},
            }
        except RequestException as e:
            return {
                'exito': False,
                'qr_data': '',
                'respuesta_cruda': {'error': str(e)},
            }
