from __future__ import annotations

import argparse
import asyncio
import getpass
import os

from sqlalchemy import select

from app.core.security import hash_password, normalize_email
from app.db.models import ControlUser, UserRole, UserStatus
from app.db.session import SessionFactory, engine
from app.domains.notifications.service import notification_service


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Charis Control Centre administration")
    commands = parser.add_subparsers(dest="command", required=True)
    create_owner = commands.add_parser(
        "create-owner", description="Create the first Control Centre owner"
    )
    create_owner.add_argument("--email", required=True)
    create_owner.add_argument("--display-name", required=True)
    process_notifications = commands.add_parser(
        "process-notifications", description="Materialize due scheduled notification deliveries"
    )
    process_notifications.add_argument("--limit", type=int, default=100)
    return parser


async def _create_owner(email: str, display_name: str) -> None:
    normalized_email = normalize_email(email)
    password = os.environ.get("BOOTSTRAP_OWNER_PASSWORD") or getpass.getpass(
        "Owner password (minimum 12 characters): "
    )
    if len(password) < 12:
        raise ValueError("Owner password must contain at least 12 characters")

    async with SessionFactory() as session:
        existing = await session.scalar(
            select(ControlUser.id).where(ControlUser.email == normalized_email)
        )
        if existing is not None:
            raise ValueError("A Control Centre user with that email already exists")
        session.add(
            ControlUser(
                email=normalized_email,
                display_name=" ".join(display_name.split()),
                password_hash=hash_password(password),
                role=UserRole.OWNER,
                status=UserStatus.ACTIVE,
            )
        )
        await session.commit()
    await engine.dispose()
    print(f"Created owner {normalized_email}")


async def _process_notifications(limit: int) -> None:
    if limit < 1 or limit > 1000:
        raise ValueError("Notification processing limit must be between 1 and 1000")
    async with SessionFactory() as session:
        processed, recipients = await notification_service.dispatch_due(session, limit=limit)
    await engine.dispose()
    print(f"Processed {processed} notification(s) for {recipients} recipient(s)")


def main() -> None:
    arguments = _parser().parse_args()
    if arguments.command == "create-owner":
        asyncio.run(_create_owner(arguments.email, arguments.display_name))
    elif arguments.command == "process-notifications":
        asyncio.run(_process_notifications(arguments.limit))


if __name__ == "__main__":
    main()
