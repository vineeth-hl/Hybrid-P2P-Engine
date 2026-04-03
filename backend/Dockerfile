FROM python:3.11-slim

# Create a non-root group and user for security
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

WORKDIR /app

# Copy dependency boundaries and install without caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source repository
COPY . .

# Assign explicit ownership to the secure non-root user
RUN chown -R appuser:appgroup /app

# Demote container runtime privileges
USER appuser

EXPOSE 8000

# Copy and use entrypoint so Railway's $PORT env var is correctly expanded at runtime
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
