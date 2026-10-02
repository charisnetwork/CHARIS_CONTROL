# Charis Control Centre API

The primary backend is a versioned FastAPI service. It uses an app-scoped PostgreSQL schema, SQLAlchemy 2, and Alembic.

## Local setup

```bash
python3 -m venv .venv
.venv/bin/pip install -e '.[dev]'
cp .env.example .env
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload
```

`DATABASE_URL` may use Railway's standard `postgresql://` format; configuration normalizes it to the asyncpg driver. Never point this service at the Bill Easy database.

Create the first owner only after applying the baseline migration:

```bash
.venv/bin/python -m app.cli create-owner --email owner@example.com --display-name "Owner"
```

The command prompts for the password. For a one-off non-interactive environment, supply `BOOTSTRAP_OWNER_PASSWORD` only for that command and remove it immediately afterward. No owner, application, credential, catalog, or subscription data is seeded during startup.

## Safe quality gates

```bash
.venv/bin/ruff check app tests alembic
.venv/bin/mypy app
.venv/bin/pytest
.venv/bin/alembic upgrade head --sql
```

The service exposes `/health/live`, `/health/ready`, and versioned application routes under `/api/v1`. Production requires an explicit JWT secret, exact CORS origins, and trusted hosts. API documentation is disabled in production.

Railway applies the reviewed Alembic migration as a pre-deploy command. Process startup never
runs schema synchronization or Prisma commands.
