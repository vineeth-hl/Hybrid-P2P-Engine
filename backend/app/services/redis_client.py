import os
import redis.asyncio as redis

# Using an environment variable for the Redis connection string
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

# Create an async connection pool to reuse connections
# We use decode_responses=True to automatically decode bytes to strings globally
redis_pool = redis.ConnectionPool.from_url(REDIS_URL, decode_responses=True)

async def get_redis():
    """
    FastAPI Dependency that yields an async Redis client.
    """
    client = redis.Redis(connection_pool=redis_pool)
    try:
        yield client
    finally:
        # In modern redis.asyncio, acoose() cleans up the connection safely
        await client.aclose()
