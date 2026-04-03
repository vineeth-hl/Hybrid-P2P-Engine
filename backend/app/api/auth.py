import uuid
from fastapi import APIRouter
from app.models.user import JoinRequest, TokenResponse
from app.core.security import create_access_token

router = APIRouter()

@router.post("/join", response_model=TokenResponse)
async def join(request: JoinRequest):
    """
    Issues a JWT containing a new UUID4 and the provided anonymous name.
    """
    user_id = str(uuid.uuid4())
    access_token = create_access_token(user_id=user_id, anonymous_name=request.anonymous_name)
    return {"access_token": access_token, "token_type": "bearer"}
