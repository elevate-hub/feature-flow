
from sqlalchemy import text

from app.database.connection import SessionLocal
from app.services.evaluation_service import evaluate_flag


def run_test():
    # Test 1: Existing, enabled flag returns its default value
    with SessionLocal() as db:
        result = evaluate_flag(
            db,
            flag_key="new_dashboard",
            environment_name="development",
        )

        print("Test 1 - Existing flag:", result)
        assert result["value"] is False
        assert result["reason"] == "DEFAULT_VALUE"

    # Test 2: Nonexistent flag
    with SessionLocal() as db:
        result = evaluate_flag(
            db,
            flag_key="does_not_exist",
            environment_name="development",
        )

        print("Test 2 - Missing flag:", result)
        assert result["value"] is None
        assert result["reason"] == "FLAG_NOT_FOUND"

    # Test 3: Disabled flag, using a transaction that is rolled back
    with SessionLocal() as db:
        transaction = db.begin()

        try:
            db.execute(
                text(
                    """
                    UPDATE flags
                    SET enabled = FALSE
                    WHERE key = :flag_key
                      AND environment_id = (
                          SELECT id
                          FROM environments
                          WHERE name = :environment_name
                      )
                    """
                ),
                {
                    "flag_key": "new_dashboard",
                    "environment_name": "development",
                },
            )

            result = evaluate_flag(
                db,
                flag_key="new_dashboard",
                environment_name="development",
            )

            print("Test 3 - Disabled flag:", result)
            assert result["value"] is False
            assert result["reason"] == "FLAG_DISABLED"

        finally:
            transaction.rollback()

    print("\nAll evaluation tests passed!")


if __name__ == "__main__":
    run_test()
