"""One-time interactive utility to promote an existing user account to admin."""

import sys
from pathlib import Path

from sqlalchemy import update


PROJECT_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_ROOT / "backend"))

from app.database.connection import engine
from app.models.user import User


def main() -> None:
    email = input("Registered user's email: ").strip().lower()
    if not email:
        raise SystemExit("An email address is required.")

    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            try:
                result = connection.execute(
                    update(User)
                    .where(User.email == email)
                    .values(role="admin")
                )
                if result.rowcount != 1:
                    transaction.rollback()
                    raise RuntimeError(
                        "Expected exactly one registered account; no changes were kept."
                    )
                transaction.commit()
            except Exception:
                if transaction.is_active:
                    transaction.rollback()
                raise
    finally:
        engine.dispose()

    print("Exactly one existing account was promoted to admin.")


if __name__ == "__main__":
    main()
