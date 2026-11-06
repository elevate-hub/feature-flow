import argparse

from sqlalchemy import func, select

from app.database.connection import SessionLocal
from app.models.user import User


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Grant administrator access to an existing FeatureFlow account."
    )
    parser.add_argument("--email", required=True, help="email of the existing account")
    parser.add_argument(
        "--confirm",
        action="store_true",
        help="confirm the intentional role change",
    )
    args = parser.parse_args()
    if not args.confirm:
        parser.error("pass --confirm to apply the administrator role change")

    with SessionLocal() as db:
        user = db.scalar(
            select(User).where(
                func.lower(User.email) == args.email.strip().lower()
            )
        )
        if user is None:
            parser.error("no account exists with the requested email")
        if not user.is_active:
            parser.error("inactive accounts cannot be promoted")
        if user.role != "admin":
            user.role = "admin"
            db.commit()
    print("Administrator access is ready for the selected account.")


if __name__ == "__main__":
    main()
