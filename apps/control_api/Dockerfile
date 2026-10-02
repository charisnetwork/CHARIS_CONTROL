FROM python:3.13-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /service

RUN addgroup --system charis && adduser --system --ingroup charis charis

# Railway can build from either the monorepo root or directly from this app folder.
# Copy the source tree and normalize the files regardless of which layout is used.
COPY . /tmp/source

RUN if [ -d /tmp/source/apps/control_api ]; then \
        cp /tmp/source/apps/control_api/pyproject.toml /tmp/source/apps/control_api/alembic.ini /service/; \
        cp -a /tmp/source/apps/control_api/alembic /service/; \
        cp -a /tmp/source/apps/control_api/app /service/; \
    else \
        cp /tmp/source/pyproject.toml /tmp/source/alembic.ini /service/; \
        cp -a /tmp/source/alembic /service/; \
        cp -a /tmp/source/app /service/; \
    fi

RUN pip install .

USER charis
EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
