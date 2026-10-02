from __future__ import annotations

import uuid
from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient, Response
from sqlalchemy.dialects import postgresql

from app.api.dependencies import AuthenticatedUser, get_current_user
from app.db.models import (
    AppCredential,
    Application,
    ApplicationEnvironment,
    ApplicationStatus,
    AppPermission,
    AuditLog,
    UserRole,
)
from app.db.session import get_db_session
from app.domains.applications.router import router
from app.domains.applications.schemas import ApplicationCreate
from app.domains.applications.service import ApplicationRegistryService


class ScalarCollection:
    def __init__(self, values: list[Any]) -> None:
        self.values = values

    def unique(self) -> ScalarCollection:
        return self

    def all(self) -> list[Any]:
        return self.values


class FakeSession:
    def __init__(
        self,
        *,
        application: Application | None = None,
        permissions: list[AppPermission] | None = None,
        applications: list[Application] | None = None,
    ) -> None:
        self.application = application
        self.permissions = permissions or []
        self.applications = applications or []
        self.scalars_statements: list[Any] = []
        self.added: list[Any] = []
        self.commits = 0
        self.rollbacks = 0

    async def scalar(self, _statement: Any) -> Application | None:
        return self.application

    async def scalars(self, statement: Any) -> ScalarCollection:
        self.scalars_statements.append(statement)
        if self.applications:
            return ScalarCollection(self.applications)
        return ScalarCollection(self.permissions)

    def add(self, value: Any) -> None:
        self.added.append(value)

    def add_all(self, values: list[Any]) -> None:
        self.added.extend(values)

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


def make_application() -> Application:
    now = datetime.now(UTC)
    return Application(
        id=uuid.uuid4(),
        name="Bill Easy",
        slug="bill-easy",
        logo_url=None,
        frontend_url="https://example.com",
        control_api_base_url="https://control.example.com/control/v1",
        health_path="/control/v1/health",
        environment=ApplicationEnvironment.PRODUCTION,
        status=ApplicationStatus.ACTIVE,
        integration_config={},
        version=1,
        created_at=now,
        updated_at=now,
        archived_at=None,
    )


def make_principal(role: UserRole) -> AuthenticatedUser:
    user = SimpleNamespace(id=uuid.uuid4(), role=role)
    session = SimpleNamespace(id=uuid.uuid4())
    claims = SimpleNamespace(user_id=user.id, session_id=session.id)
    return AuthenticatedUser(user=user, session=session, claims=claims)  # type: ignore[arg-type]


def make_app(principal: AuthenticatedUser, db: FakeSession) -> FastAPI:
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")

    async def current_user_override() -> AuthenticatedUser:
        return principal

    async def session_override():
        yield db

    application.dependency_overrides[get_current_user] = current_user_override
    application.dependency_overrides[get_db_session] = session_override
    return application


async def request(app: FastAPI, method: str, url: str, **kwargs: Any) -> Response:
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        return await client.request(method, url, **kwargs)


async def test_team_member_cannot_open_an_unassigned_application() -> None:
    application = make_application()
    db = FakeSession(application=application, permissions=[])

    response = await request(
        make_app(make_principal(UserRole.TEAM_MEMBER), db),
        "GET",
        f"/api/v1/apps/{application.id}",
    )

    assert response.status_code == 403
    assert response.json() == {"detail": "Insufficient permission for this application"}


async def test_team_member_can_open_only_with_required_app_permission() -> None:
    application = make_application()
    db = FakeSession(application=application, permissions=[AppPermission.VIEW_OVERVIEW])

    response = await request(
        make_app(make_principal(UserRole.TEAM_MEMBER), db),
        "GET",
        f"/api/v1/apps/{application.id}",
    )

    assert response.status_code == 200
    assert response.json()["id"] == str(application.id)


async def test_owner_can_open_any_non_archived_application() -> None:
    application = make_application()
    db = FakeSession(application=application)

    response = await request(
        make_app(make_principal(UserRole.OWNER), db),
        "GET",
        f"/api/v1/apps/{application.id}",
    )

    assert response.status_code == 200
    assert response.json()["slug"] == "bill-easy"


async def test_team_member_registry_query_is_restricted_by_assignment() -> None:
    service = ApplicationRegistryService()
    db = FakeSession()

    await service.list_for_user(db, make_principal(UserRole.TEAM_MEMBER))  # type: ignore[arg-type]

    compiled = str(
        db.scalars_statements[0].compile(
            dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}
        )
    )
    assert "user_app_permissions" in compiled
    assert "user_app_permissions.user_id" in compiled
    assert "user_app_permissions.application_id = applications.id" in compiled


async def test_owner_registry_query_does_not_require_assignments() -> None:
    service = ApplicationRegistryService()
    db = FakeSession()

    await service.list_for_user(db, make_principal(UserRole.OWNER))  # type: ignore[arg-type]

    compiled = str(db.scalars_statements[0].compile(dialect=postgresql.dialect()))
    assert "user_app_permissions" not in compiled


async def test_create_hashes_credential_and_audits_without_plaintext() -> None:
    service = ApplicationRegistryService()
    db = FakeSession()
    principal = make_principal(UserRole.OWNER)
    payload = ApplicationCreate.model_validate(
        {
            "name": "Bill Easy",
            "slug": "bill-easy",
            "control_api_base_url": "https://control.example.com/control/v1",
            "environment": "production",
        }
    )

    application, issued = await service.create(  # type: ignore[arg-type]
        db,
        principal,
        payload,
        correlation_id="registry-test",
        ip_address="127.0.0.1",
    )

    stored_credential = next(item for item in db.added if isinstance(item, AppCredential))
    audit_log = next(item for item in db.added if isinstance(item, AuditLog))
    assert application.id == stored_credential.application_id
    assert stored_credential.secret_hash != issued.secret
    assert issued.secret not in repr(audit_log.after_summary)
    assert audit_log.correlation_id == "registry-test"
    assert db.commits == 1


async def test_team_member_cannot_create_application() -> None:
    application = FastAPI()
    application.include_router(router, prefix="/api/v1")
    principal = make_principal(UserRole.TEAM_MEMBER)
    db = FakeSession()

    async def current_user_override() -> AuthenticatedUser:
        return principal

    async def session_override():
        yield db

    application.dependency_overrides[get_current_user] = current_user_override
    application.dependency_overrides[get_db_session] = session_override
    payload = {
        "name": "Charis Civil",
        "slug": "charis-civil",
        "control_api_base_url": "https://civil.example.com/control/v1",
        "environment": "production",
    }

    response = await request(application, "POST", "/api/v1/apps", json=payload)

    assert response.status_code == 403
    assert db.added == []
