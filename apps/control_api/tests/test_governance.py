from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domains.governance.schemas import TeamMemberCreate, TeamPermissionUpdate


def test_team_member_requires_strong_password_and_unique_permissions() -> None:
    with pytest.raises(ValidationError):
        TeamMemberCreate(
            email="member@example.com",
            display_name="Member",
            password="short",
            permissions=["view_reports"],
        )
    with pytest.raises(ValidationError):
        TeamMemberCreate(
            email="member@example.com",
            display_name="Member",
            password="long-enough-password",
            permissions=["view_reports", "view_reports"],
        )
    with pytest.raises(ValidationError):
        TeamPermissionUpdate(permissions=["view_reports", "view_reports"])


def test_team_member_accepts_app_scoped_permissions() -> None:
    member = TeamMemberCreate(
        email="member@example.com",
        display_name="Member",
        password="long-enough-password",
        permissions=["view_reports", "view_overview"],
    )
    assert len(member.permissions) == 2
