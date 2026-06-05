from cryptography.fernet import Fernet
from server.config import settings

class Encryption:
    """
    Simple symmetric encryption utility for sensitive data like PATs.
    Uses Fernet with a key from settings.
    """
    _fernet = None

    @classmethod
    def get_instance(cls) -> Fernet:
        if cls._fernet is None:
            # Development-only fallback. Production config validation requires a
            # stable Fernet key so encrypted credentials survive restarts.
            key = settings.ENCRYPTION_KEY or Fernet.generate_key().decode()
            try:
                cls._fernet = Fernet(key.encode())
            except Exception as exc:
                raise ValueError("Invalid ENCRYPTION_KEY; generate one with Fernet.generate_key()") from exc
        return cls._fernet

    @classmethod
    def encrypt(cls, data: str) -> str:
        if not data:
            return ""
        return cls.get_instance().encrypt(data.encode()).decode()

    @classmethod
    def decrypt(cls, encrypted_data: str) -> str:
        if not encrypted_data:
            return ""
        return cls.get_instance().decrypt(encrypted_data.encode()).decode()
