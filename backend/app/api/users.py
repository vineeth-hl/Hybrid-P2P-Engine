from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from app.core.security import get_current_user
from app.services.redis_client import get_redis

router = APIRouter()

@router.post("/heartbeat")
async def heartbeat(
    current_user: dict = Depends(get_current_user),
    redis_client: Redis = Depends(get_redis)
):
    """
    Updates the user's online state in Redis.
    Sets a key 'user_online:{uuid}' with their name and an absolute TTL of 60 seconds.
    Requires a valid JWT token.
    """
    user_id = current_user["user_id"]
    name = current_user["name"]
    
    key = f"user_online:{user_id}"
    
    # Store online status with an explicit expiration of 60 seconds
    await redis_client.set(name=key, value=name, ex=60)
    
    return {"status": "ok", "message": "Heartbeat updated successfully"}

@router.get("/users/online")
async def get_online_users(redis_client: Redis = Depends(get_redis)):
    """
    Scans Redis to find all active online users.
    """
    keys = []
    
    # Scan iter helps prevent blocking Redis operations compared to keys()
    async for key in redis_client.scan_iter(match="user_online:*"):
        keys.append(key)
        
    online_users = []
    
    if keys:
        # Retrieve all values in a single trip for high performance
        names = await redis_client.mget(keys)
        
        for key, name in zip(keys, names):
            if name:
                user_id = key.split(":")[1]
                online_users.append({
                    "user_id": user_id,
                    "name": name
                })
                
    return {"online_users": online_users}
