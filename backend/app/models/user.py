from pydantic import BaseModel

class JoinRequest(BaseModel):
    anonymous_name: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
