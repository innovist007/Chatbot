"""Authentication endpoints - Google OAuth + email OTP + JWT management."""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.config import get_settings, Settings
from app.services.auth_service import AuthService
from app.services.otp_service import OTPService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"],)

# Bearer token security scheme for protected endpoints
security = HTTPBearer(auto_error=False)


# ============================================== Schemas
class GoogleLoginRequest(BaseModel):
    """Request body for Google login."""
    credential: str  # Google ID token from frontend


class OTPChallengeResponse(BaseModel):
    """Returned after Google verification — the client now must submit an OTP."""
    session_id: str
    email: str
    expires_in_minutes: int


class VerifyOTPRequest(BaseModel):
    session_id: str
    otp: str


class ResendOTPRequest(BaseModel):
    session_id: str


class TokenResponse(BaseModel):
    """Response with JWT access token."""
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    """Current user info."""
    email: str
    name: str
    picture: str


# ============================================== Dependencies
def get_auth_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AuthService:
    """Dependency to get AuthService instance."""
    return AuthService(settings)


def get_otp_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> OTPService:
    """Dependency to get OTPService instance."""
    return OTPService(settings)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    """Dependency to get current authenticated user from JWT token.

    Use this in any endpoint that requires authentication:

    @router.get("/protected")
    def protected_route(user: dict = Depends(get_current_user)):
        return {"hello": user["email"]}
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = auth_service.verify_access_token(credentials.credentials)
    return payload


# ============================================== Endpoints
@router.post("/google", response_model=OTPChallengeResponse)
def google_login(
    payload: GoogleLoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    otp_service: Annotated[OTPService, Depends(get_otp_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OTPChallengeResponse:
    """Step 1 of login. Verify Google ID token + domain, then email an OTP.

    Returns a `session_id` the client uses to submit the OTP at /auth/verify-otp.
    No JWT is issued at this step.
    """
    user_data = auth_service.verify_google_token(payload.credential)

    session_id, otp_code = otp_service.create_session(user_data)
    otp_service.send_email(
        to_email=user_data["email"],
        otp_code=otp_code,
        name=user_data.get("name", ""),
    )

    return OTPChallengeResponse(
        session_id=session_id,
        email=user_data["email"],
        expires_in_minutes=settings.otp_expire_minutes,
    )


@router.post("/verify-otp", response_model=TokenResponse)
def verify_otp(
    payload: VerifyOTPRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    otp_service: Annotated[OTPService, Depends(get_otp_service)],
) -> TokenResponse:
    """Step 2 of login. Verify the OTP and return the final JWT."""
    user_data = otp_service.verify(payload.session_id, payload.otp)
    access_token = auth_service.create_access_token(user_data)

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "email": user_data["email"],
            "name": user_data["name"],
            "picture": user_data["picture"],
        },
    )


@router.post("/resend-otp", response_model=OTPChallengeResponse)
def resend_otp(
    payload: ResendOTPRequest,
    otp_service: Annotated[OTPService, Depends(get_otp_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> OTPChallengeResponse:
    """Regenerate and email a fresh OTP for an existing session."""
    new_code, email = otp_service.rotate_code(payload.session_id)
    otp_service.send_email(to_email=email, otp_code=new_code)

    return OTPChallengeResponse(
        session_id=payload.session_id,
        email=email,
        expires_in_minutes=settings.otp_expire_minutes,
    )


@router.get("/me", response_model=UserResponse)
def get_me(
    current_user: Annotated[dict, Depends(get_current_user)],
) -> UserResponse:
    """Get current authenticated user info."""
    return UserResponse(
        email=current_user["email"],
        name=current_user.get("name", ""),
        picture=current_user.get("picture", ""),
    )


@router.post("/logout")
def logout() -> dict:
    """Logout endpoint.

    Note: With JWT, logout is handled on the frontend by removing the token.
    This endpoint is here for consistency and future use (e.g., token blacklist).
    """
    return {"message": "Logged out successfully"}
