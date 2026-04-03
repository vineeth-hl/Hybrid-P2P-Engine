import os
import redis.asyncio as redis

# Using an environment variable for the Redis connection string
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# Lazy pool — created on first request, not at import time
# This prevents a crash during startup if REDIS_URL isn't ready yet
_redis_pool = None

def get_redis_pool():
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)
    return _redis_pool

async def get_redis():
    """
    FastAPI Dependency that yields an async Redis client.
    """
    client = redis.Redis(connection_pool=get_redis_pool())
    try:
        yield client
    finally:
        await client.aclose()
