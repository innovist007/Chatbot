"""Auth Pydantic schemas."""
from pydantic import BaseModel


class GoogleLoginRequest(BaseModel):
    credential: str


class OTPChallengeResponse(BaseModel):
    session_id: str
    email: str
    expires_in_minutes: int


class VerifyOTPRequest(BaseModel):
    session_id: str
    otp: str


class ResendOTPRequest(BaseModel):
    session_id: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict


class UserResponse(BaseModel):
    email: str
    name: str
    picture: str
