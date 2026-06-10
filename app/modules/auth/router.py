"""Authentication endpoints — Google OAuth + email OTP + JWT management."""
import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import Settings, get_settings
from app.modules.auth.service import AuthService
from app.modules.auth.otp_service import OTPService
from app.modules.auth.schemas import (
    GoogleLoginRequest,
    OTPChallengeResponse,
    ResendOTPRequest,
    TokenResponse,
    UserResponse,
    VerifyOTPRequest,
)

logger = logging.getLogger(__name__)

router   = APIRouter(prefix="/auth", tags=["auth"])
security = HTTPBearer(auto_error=False)


# ── Dependency providers ────────────────────────────────────────────────────

def get_auth_service(settings: Annotated[Settings, Depends(get_settings)]) -> AuthService:
    return AuthService(settings)


def get_otp_service(settings: Annotated[Settings, Depends(get_settings)]) -> OTPService:
    return OTPService(settings)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
) -> dict:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return auth_service.verify_access_token(credentials.credentials)


# ── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/google", response_model=OTPChallengeResponse)
def google_login(
    payload:      GoogleLoginRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    otp_service:  Annotated[OTPService,  Depends(get_otp_service)],
    settings:     Annotated[Settings,    Depends(get_settings)],
) -> OTPChallengeResponse:
    user_data  = auth_service.verify_google_token(payload.credential)
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
    payload:      VerifyOTPRequest,
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    otp_service:  Annotated[OTPService,  Depends(get_otp_service)],
) -> TokenResponse:
    user_data    = otp_service.verify(payload.session_id, payload.otp)
    access_token = auth_service.create_access_token(user_data)
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user={
            "email":   user_data["email"],
            "name":    user_data["name"],
            "picture": user_data["picture"],
        },
    )


@router.post("/resend-otp", response_model=OTPChallengeResponse)
def resend_otp(
    payload:     ResendOTPRequest,
    otp_service: Annotated[OTPService, Depends(get_otp_service)],
    settings:    Annotated[Settings,   Depends(get_settings)],
) -> OTPChallengeResponse:
    new_code, email = otp_service.rotate_code(payload.session_id)
    otp_service.send_email(to_email=email, otp_code=new_code)
    return OTPChallengeResponse(
        session_id=payload.session_id,
        email=email,
        expires_in_minutes=settings.otp_expire_minutes,
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: Annotated[dict, Depends(get_current_user)]) -> UserResponse:
    return UserResponse(
        email=current_user["email"],
        name=current_user.get("name", ""),
        picture=current_user.get("picture", ""),
    )


@router.post("/logout")
def logout() -> dict:
    return {"message": "Logged out successfully"}
