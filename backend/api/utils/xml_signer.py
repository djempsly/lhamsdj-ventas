import os
from lxml import etree
from signxml import XMLSigner, XMLVerifier
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.backends import default_backend

def sign_ecf_xml(xml_content: bytes, p12_path: str, p12_password: str) -> str:
    """
    Firma un XML (e-CF) usando un certificado .p12 bajo el estándar XMLDSig.
    Cumple con los requisitos de la DGII (República Dominicana).
    Valida el certificado antes de firmar.

    Args:
        xml_content (bytes): Contenido del XML a firmar.
        p12_path (str): Ruta al archivo .p12.
        p12_password (str): Contraseña del archivo .p12.

    Returns:
        str: XML firmado en formato string.
    """

    if not os.path.exists(p12_path):
        raise FileNotFoundError(f"El certificado no existe en: {p12_path}")

    # Validate certificate before signing
    from .cert_validator import validate_p12_certificate
    cert_status = validate_p12_certificate(p12_path, p12_password)
    if not cert_status['valid']:
        raise ValueError(f"Certificado inválido: {cert_status['error']}")

    # 1. Cargar el .p12
    with open(p12_path, "rb") as f:
        p12_data = f.read()

    p12 = pkcs12.load_key_and_certificates(
        p12_data,
        p12_password.encode(),
        backend=default_backend()
    )
    
    private_key = p12[0]
    cert = p12[1]
    
    # 2. Preparar Key y Cert para signxml
    # signxml espera la clave en formato PEM y el certificado en PEM
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption()
    )
    
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    
    # 3. Parsear XML
    root = etree.fromstring(xml_content)
    
    # 4. Firmar
    # La DGII requiere:
    # - Method: http://www.w3.org/2000/09/xmldsig#rsa-sha1 (o sha256 según norma actual)
    # - Canonicalization: http://www.w3.org/TR/2001/REC-xml-c14n-20010315
    signer = XMLSigner(
        method=XMLSigner.SignatureMethods.RSA_SHA256,
        signature_algorithm="rsa-sha256",
        digest_algorithm="sha256",
        c14n_algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    )
    
    signed_root = signer.sign(
        root,
        key=key_pem,
        cert=cert_pem,
        always_add_key_value=True # Incluir KeyValue
    )
    
    return etree.tostring(signed_root, encoding="UTF-8", xml_declaration=True).decode("utf-8")
