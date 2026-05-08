"""Authentication service - handles Google OAuth and JWT tokens."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from jose import JWTError, jwt

from app.config import Settings

logger = logging.getLogger(__name__)


class AuthService:
    """Handles Google OAuth verification and JWT token management."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    # ============================================== Google Token Verification
    def verify_google_token(self, token: str) -> dict[str, Any]:
        """Verify Google ID token and return user info.
        
        Raises:
            HTTPException 401: If token is invalid
            HTTPException 403: If email domain is not allowed
        """
        try:
            # Verify the token with Google
            idinfo = id_token.verify_oauth2_token(
                token,
                google_requests.Request(),
                self.settings.google_client_id,
            )
            
            email = idinfo.get("email")
            if not email:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Email not found in Google token",
                )
            
            # Check if email domain is allowed
            email_domain = email.split("@")[-1].lower()
            allowed_domain = self.settings.allowed_email_domain.lower()
            
            if email_domain != allowed_domain:
                logger.warning(f"❌ Login denied for {email} (domain: {email_domain})")
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Access restricted to @{allowed_domain} accounts only",
                )
            
            logger.info(f"✅ Verified Google user: {email}")
            
            return {
                "email": email,
                "name": idinfo.get("name", ""),
                "picture": idinfo.get("picture", ""),
                "google_id": idinfo.get("sub"),
                "email_verified": idinfo.get("email_verified", False),
            }
            
        except ValueError as e:
            logger.error(f"❌ Invalid Google token: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Google token",
            ) from e

    # ============================================== JWT Token Management
    def create_access_token(self, user_data: dict[str, Any]) -> str:
        """Create a JWT access token for the user."""
        expire = datetime.now(timezone.utc) + timedelta(
            hours=self.settings.jwt_expire_hours
        )
        
        payload = {
            "sub": user_data["email"],
            "email": user_data["email"],
            "name": user_data.get("name", ""),
            "picture": user_data.get("picture", ""),
            "exp": expire,
            "iat": datetime.now(timezone.utc),
        }
        
        token = jwt.encode(
            payload,
            self.settings.jwt_secret_key,
            algorithm=self.settings.jwt_algorithm,
        )
        
        logger.info(f"🔑 Created JWT for {user_data['email']}")
        return token

    def verify_access_token(self, token: str) -> dict[str, Any]:
        """Verify a JWT token and return the payload.
        
        Raises:
            HTTPException 401: If token is invalid or expired
        """
        try:
            payload = jwt.decode(
                token,
                self.settings.jwt_secret_key,
                algorithms=[self.settings.jwt_algorithm],
            )
            
            email = payload.get("email")
            if email is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: no email",
                )
            
            return payload
            
        except JWTError as e:
            logger.error(f"❌ JWT verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            ) from e