
from sqlalchemy import text
from sqlalchemy.orm import Session


def evaluate_flag(
    db: Session,
    flag_key: str,
    environment_name: str,
) -> dict:
    """
    Evaluate a feature flag for a specific environment.

    Initial behavior:
    - Return not found if the flag does not exist.
    - Return False if the flag is disabled.
    - Otherwise return the flag's default_value.
    """

    query = text(
        """
        SELECT
            f.key,
            f.type,
            f.default_value,
            f.enabled,
            e.name AS environment_name
        FROM flags AS f
        JOIN environments AS e
            ON e.id = f.environment_id
        WHERE f.key = :flag_key
          AND e.name = :environment_name
        LIMIT 1
        """
    )

    flag = db.execute(
        query,
        {
            "flag_key": flag_key,
            "environment_name": environment_name,
        },
    ).mappings().first()

    if flag is None:
        return {
            "flag_key": flag_key,
            "environment": environment_name,
            "value": None,
            "reason": "FLAG_NOT_FOUND",
        }

    if not flag["enabled"]:
        return {
            "flag_key": flag_key,
            "environment": environment_name,
            "value": False,
            "reason": "FLAG_DISABLED",
        }

    return {
        "flag_key": flag_key,
        "environment": environment_name,
        "value": flag["default_value"],
        "reason": "DEFAULT_VALUE",
    }
