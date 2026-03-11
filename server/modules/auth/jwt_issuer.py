import jwt
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
import logging
import uuid

class JWTError(Exception): pass
class TokenExpiredError(JWTError): pass
class InvalidTokenError(JWTError): pass
class TokenRevokedError(JWTError): pass

logger = logging.getLogger(__name__)

from server.config import settings
SECRET_KEY = settings.JWT_SECRET
ALGORITHM = settings.JWT_ALGORITHM

_jwt_revocation_store: Dict[str, datetime] = {}

class JWTIssuer:
    """
    Handles generation and verification of JWTs for user sessions.
    Supports token revocation for logout and security events.
    """
    @staticmethod
    def create_access_token(data: Dict[str, Any], expires_delta: Optional[timedelta] = None, expires_in: Optional[int] = None) -> str:
        to_encode = data.copy()
        if expires_in is not None:
            expire = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        elif expires_delta:
            expire = datetime.now(timezone.utc) + expires_delta
        else:
            expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
        
        jti = str(uuid.uuid4())
        to_encode.update({
            "exp": expire,
            "jti": jti,
            "iat": datetime.now(timezone.utc)
        })
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt

    @staticmethod
    def verify_token(token: str, db_session=None) -> Dict[str, Any]:
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            jti = payload.get("jti")
            if jti and jti in _jwt_revocation_store:
                logger.warning("JWT revoked", jti=jti)
                raise TokenRevokedError("Token has been revoked")
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("JWT expired")
            raise TokenExpiredError("Token has expired")
        except TokenRevokedError:
            raise
        except jwt.PyJWTError as e:
            logger.warning(f"JWT decode error: {e}")
            raise InvalidTokenError(str(e))

    @staticmethod
    def revoke_token(token: str, account_id: int = None, user_id: str = None) -> bool:
        """Revoke a token by adding its JTI to the revocation store."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM], options={"verify_exp": False})
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                _jwt_revocation_store[jti] = datetime.fromtimestamp(exp, tz=timezone.utc)
                logger.info("token_revoked", jti=jti, account_id=account_id, user_id=user_id)
                return True
            return False
        except jwt.PyJWTError as e:
            logger.error(f"Failed to revoke token: {e}")
            return False

    @staticmethod
    def cleanup_expired_revoked():
        """Remove expired entries from revocation store."""
        now = datetime.now(timezone.utc)
        expired = [jti for jti, exp in _jwt_revocation_store.items() if exp < now]
        for jti in expired:
            del _jwt_revocation_store[jti]
