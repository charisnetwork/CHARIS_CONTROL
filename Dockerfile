# Charis OS API, built from the repository root (Railway service root = repo root).
# apps/control_api/Dockerfile is the same image built from inside apps/control_api.
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /service

RUN addgroup --system charis && adduser --system --ingroup charis charis

COPY apps/control_api/pyproject.toml apps/control_api/alembic.ini ./
COPY apps/control_api/alembic ./alembic
COPY apps/control_api/app ./app

RUN pip install .

USER charis
EXPOSE 8000

# Railway injects $PORT; self-hosted Docker uses 8000.
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
