#!/bin/sh
# Railway injects $PORT at runtime. This script ensures uvicorn reads it correctly.
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
