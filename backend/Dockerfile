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

# Trigger FastAPI via Uvicorn 
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
