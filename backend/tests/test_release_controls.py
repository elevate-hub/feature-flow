import hashlib
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, Integer, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database.base import Base
from app.database.connection import get_db
from app.main import app
from app.models.flag import Flag
from app.models.evaluation_stat import EvaluationStat
from app.models.user import User
from seed_demo import seed_demo_data


@compiles(BigInteger, "sqlite")
def compile_bigint_for_sqlite(type_, compiler, **kwargs):
    return "INTEGER"


@compiles(JSONB, "sqlite")
def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
    return "JSON"


class ReleaseControlApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        event.listen(
            self.engine,
            "connect",
            lambda connection, _: connection.execute("PRAGMA foreign_keys=ON"),
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine, autoflush=False, expire_on_commit=False
        )

        def override_get_db():
            with self.session_factory() as session:
                yield session

        self.previous_secret = settings.JWT_SECRET_KEY
        settings.JWT_SECRET_KEY = "release-controls-test-secret-at-least-32-bytes"
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        registered = self.client.post(
            "/auth/register",
            json={
                "name": "Release Tester",
                "email": "release-tester@example.com",
                "password": "test-password-123",
            },
        )
        if registered.status_code != 201:
            raise AssertionError(registered.text)
        login = self.client.post(
            "/auth/login",
            json={
                "email": "release-tester@example.com",
                "password": "test-password-123",
            },
        )
        if login.status_code != 200:
            raise AssertionError(login.text)
        self.headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        with self.session_factory() as session:
            user = session.query(User).filter_by(
                email="release-tester@example.com"
            ).one()
            user.role = "admin"
            session.commit()
        self.dashboard_user_id = self.client.get(
            "/auth/me", headers=self.headers
        ).json()["id"]
        environment = self.client.post(
            "/api/v1/environments",
            headers=self.headers,
            json={"name": "production"},
        )
        if environment.status_code != 201:
            raise AssertionError(environment.text)
        self.environment_id = environment.json()["id"]

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        settings.JWT_SECRET_KEY = self.previous_secret
        self.engine.dispose()

    def create_flag(self, key: str = "new_checkout") -> int:
        response = self.client.post(
            "/api/v1/flags",
            headers=self.headers,
            json={
                "key": key,
                "type": "boolean",
                "default_value": False,
                "environment_id": self.environment_id,
            },
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_flag_rollout_persists_and_evaluation_is_stable(self) -> None:
        flag_id = self.create_flag()
        response = self.client.get(
            f"/api/v1/flags/{flag_id}", headers=self.headers
        )
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(response.json()["rollout_percentage"], 0)

        update = self.client.put(
            f"/api/v1/flags/{flag_id}",
            headers=self.headers,
            json={"rollout_percentage": 37},
        )
        self.assertEqual(update.status_code, 200, update.text)
        self.assertEqual(update.json()["rollout_percentage"], 37)

        request = {
            "flag_key": "new_checkout",
            "environment": "production",
            "user_key": "stable-user",
            "attributes": {},
        }
        first = self.client.post(
            "/api/v1/evaluations", headers=self.headers, json=request
        )
        second = self.client.post(
            "/api/v1/evaluations", headers=self.headers, json=request
        )
        self.assertEqual(first.status_code, 200, first.text)
        self.assertEqual(second.status_code, 200, second.text)
        self.assertEqual(first.json(), second.json())
        self.assertEqual(first.json()["reason"], "PERCENTAGE_ROLLOUT")
        expected_bucket = int.from_bytes(
            hashlib.sha256(b"new_checkout:stable-user").digest()[:8], "big"
        ) % 100
        self.assertEqual(first.json()["rollout_bucket"], expected_bucket)

        missing_context = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "new_checkout",
                "environment": "production",
                "attributes": {"user_id": self.dashboard_user_id},
            },
        )
        self.assertEqual(missing_context.json()["reason"], "MISSING_CONTEXT")
        self.assertEqual(missing_context.json()["value"], None)

        dashboard_account_identity = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "new_checkout",
                "environment": "production",
                "user_id": self.dashboard_user_id,
            },
        )
        self.assertEqual(dashboard_account_identity.status_code, 422)

        for invalid_percentage in (-1, 101):
            with self.subTest(rollout_percentage=invalid_percentage):
                invalid_rollout = self.client.put(
                    f"/api/v1/flags/{flag_id}",
                    headers=self.headers,
                    json={"rollout_percentage": invalid_percentage},
                )
                self.assertEqual(invalid_rollout.status_code, 422)

        with self.session_factory() as session:
            column = Flag.__table__.c.rollout_percentage
            self.assertIsInstance(column.type, Integer)
            self.assertEqual(column.default.arg, 0)
            self.assertTrue(
                any(
                    "rollout_percentage BETWEEN 0 AND 100" in str(constraint.sqltext)
                    for constraint in Flag.__table__.constraints
                    if hasattr(constraint, "sqltext")
                )
            )
            persisted = session.get(Flag, flag_id)
            self.assertIsNotNone(persisted)
            assert persisted is not None
            self.assertEqual(persisted.rollout_percentage, 37)
            persisted.rollout_percentage = 101
            session.add(persisted)
            with self.assertRaises(IntegrityError):
                session.commit()
            session.rollback()

        disabled = self.client.put(
            f"/api/v1/flags/{flag_id}",
            headers=self.headers,
            json={"enabled": False},
        )
        self.assertEqual(disabled.status_code, 200, disabled.text)
        result = self.client.post(
            "/api/v1/evaluations", headers=self.headers, json=request
        )
        self.assertEqual(result.json()["reason"], "FLAG_DISABLED")

    def test_user_group_and_attribute_rules_drive_evaluation(self) -> None:
        flag_id = self.create_flag("targeted_checkout")
        group_response = self.client.post(
            "/api/v1/user-groups",
            headers=self.headers,
            json={"name": "Beta customers", "description": "Early access"},
        )
        self.assertEqual(group_response.status_code, 201, group_response.text)
        group_id = group_response.json()["id"]

        member_response = self.client.post(
            f"/api/v1/user-groups/{group_id}/members",
            headers=self.headers,
            json={"user_key": "end-user-42"},
        )
        self.assertEqual(member_response.status_code, 200, member_response.text)
        self.assertEqual(member_response.json()["member_count"], 1)
        self.assertEqual(
            member_response.json()["members"][0]["user_key"], "end-user-42"
        )

        rule_response = self.client.post(
            f"/api/v1/flags/{flag_id}/targeting-rules",
            headers=self.headers,
            json={
                "rule_type": "attribute",
                "operator": "equals",
                "attribute": "country",
                "value": "US",
                "result": True,
                "priority": 1,
            },
        )
        self.assertEqual(rule_response.status_code, 201, rule_response.text)
        rule_id = rule_response.json()["id"]

        result = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "targeted_checkout",
                "environment": "production",
                "user_key": "visitor-1",
                "attributes": {"country": "US"},
            },
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()["value"])
        self.assertEqual(result.json()["reason"], "USER_RULE_MATCH")
        self.assertEqual(result.json()["rule_id"], rule_id)

        group_rule = self.client.post(
            f"/api/v1/flags/{flag_id}/targeting-rules",
            headers=self.headers,
            json={
                "rule_type": "user_group",
                "operator": "in_group",
                "value": group_id,
                "result": True,
                "priority": 2,
            },
        )
        self.assertEqual(group_rule.status_code, 201, group_rule.text)
        group_rule_id = group_rule.json()["id"]
        group_evaluation = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "targeted_checkout",
                "environment": "production",
                "user_key": "end-user-42",
                "attributes": {},
            },
        )
        self.assertTrue(group_evaluation.json()["value"])
        self.assertEqual(group_evaluation.json()["reason"], "GROUP_RULE_MATCH")
        self.assertEqual(group_evaluation.json()["rule_id"], group_rule_id)

        disabled = self.client.put(
            f"/api/v1/flags/{flag_id}",
            headers=self.headers,
            json={"enabled": False, "rollout_percentage": 0},
        )
        self.assertEqual(disabled.status_code, 200, disabled.text)
        disabled_evaluation = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "targeted_checkout",
                "environment": "production",
                "user_key": "end-user-42",
                "attributes": {"country": "US"},
            },
        )
        self.assertEqual(disabled_evaluation.status_code, 200)
        self.assertFalse(disabled_evaluation.json()["value"])
        self.assertEqual(disabled_evaluation.json()["reason"], "FLAG_DISABLED")

        conflict = self.client.delete(
            f"/api/v1/user-groups/{group_id}", headers=self.headers
        )
        self.assertEqual(conflict.status_code, 409)

        wrong_result = self.client.post(
            f"/api/v1/flags/{flag_id}/targeting-rules",
            headers=self.headers,
            json={
                "rule_type": "attribute",
                "operator": "equals",
                "attribute": "country",
                "value": "CA",
                "result": "yes",
            },
        )
        self.assertEqual(wrong_result.status_code, 422)

        deleted = self.client.delete(
            f"/api/v1/targeting-rules/{rule_id}", headers=self.headers
        )
        self.assertEqual(deleted.status_code, 204)

    def test_release_control_routes_require_authentication(self) -> None:
        for method, path, kwargs in [
            ("get", "/api/v1/user-groups", {}),
            ("post", "/api/v1/user-groups", {"json": {"name": "test"}}),
            ("post", "/api/v1/evaluations", {"json": {}}),
            ("get", "/api/v1/flags/1/targeting-rules", {}),
        ]:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401, response.text)

    def test_regular_user_cannot_change_release_controls_but_can_evaluate(self) -> None:
        registration = self.client.post(
            "/auth/register",
            json={
                "name": "Read Only",
                "email": "read-only@example.com",
                "password": "test-password-123",
            },
        )
        self.assertEqual(registration.status_code, 201, registration.text)
        login = self.client.post(
            "/auth/login",
            json={
                "email": "read-only@example.com",
                "password": "test-password-123",
            },
        )
        self.assertEqual(login.status_code, 200, login.text)
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        flag_id = self.create_flag("read_only_eval")

        self.assertEqual(
            self.client.post(
                "/api/v1/user-groups",
                headers=headers,
                json={"name": "forbidden"},
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.get("/api/v1/analytics", headers=headers).status_code,
            403,
        )
        evaluation = self.client.post(
            "/api/v1/evaluations",
            headers=headers,
            json={
                "flag_key": "read_only_eval",
                "environment": "production",
                "user_key": "external-end-user",
            },
        )
        self.assertEqual(evaluation.status_code, 200, evaluation.text)
        self.assertEqual(evaluation.json()["reason"], "PERCENTAGE_ROLLOUT")

    def test_rollout_zero_and_hundred_percent_boundaries(self) -> None:
        flag_id = self.create_flag("rollout_boundaries")
        no_rollout = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "rollout_boundaries",
                "environment": "production",
            },
        )
        self.assertEqual(no_rollout.status_code, 200, no_rollout.text)
        self.assertFalse(no_rollout.json()["value"])
        self.assertEqual(no_rollout.json()["reason"], "PERCENTAGE_ROLLOUT")

        update = self.client.put(
            f"/api/v1/flags/{flag_id}",
            headers=self.headers,
            json={"default_value": True, "rollout_percentage": 100},
        )
        self.assertEqual(update.status_code, 200, update.text)
        everyone = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "rollout_boundaries",
                "environment": "production",
            },
        )
        self.assertEqual(everyone.status_code, 200, everyone.text)
        self.assertTrue(everyone.json()["value"])
        self.assertEqual(everyone.json()["reason"], "DEFAULT_VALUE")

    def test_explicit_user_rule_precedes_attribute_and_group_rules(self) -> None:
        flag_id = self.create_flag("specific_user_checkout")
        group = self.client.post(
            "/api/v1/user-groups",
            headers=self.headers,
            json={"name": "Specific user cohort"},
        ).json()
        added_member = self.client.post(
            f"/api/v1/user-groups/{group['id']}/members",
            headers=self.headers,
            json={"user_key": "external-user-1"},
        )
        self.assertEqual(added_member.status_code, 200, added_member.text)

        rule_payloads = [
            {
                "rule_type": "user_group",
                "operator": "in_group",
                "value": group["id"],
                "result": False,
                "priority": 1,
            },
            {
                "rule_type": "attribute",
                "operator": "equals",
                "attribute": "country",
                "value": "US",
                "result": False,
                "priority": 1,
            },
            {
                "rule_type": "user",
                "operator": "equals",
                "value": "external-user-1",
                "result": True,
                "priority": 99,
            },
        ]
        for payload in rule_payloads:
            response = self.client.post(
                f"/api/v1/flags/{flag_id}/targeting-rules",
                headers=self.headers,
                json=payload,
            )
            self.assertEqual(response.status_code, 201, response.text)

        result = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "specific_user_checkout",
                "environment": "production",
                "user_key": "external-user-1",
                "attributes": {"country": "US"},
            },
        )
        self.assertEqual(result.status_code, 200, result.text)
        self.assertTrue(result.json()["value"])
        self.assertEqual(result.json()["reason"], "USER_RULE_MATCH")

    def test_analytics_activity_and_versions_are_database_backed(self) -> None:
        flag_id = self.create_flag("analytics_flag")
        updated = self.client.put(
            f"/api/v1/flags/{flag_id}",
            headers=self.headers,
            json={"enabled": False},
        )
        self.assertEqual(updated.status_code, 200, updated.text)
        evaluation = self.client.post(
            "/api/v1/evaluations",
            headers=self.headers,
            json={
                "flag_key": "analytics_flag",
                "environment": "production",
                "user_key": "analytics-user",
            },
        )
        self.assertEqual(evaluation.status_code, 200, evaluation.text)

        analytics = self.client.get(
            f"/api/v1/analytics?environment_id={self.environment_id}",
            headers=self.headers,
        )
        self.assertEqual(analytics.status_code, 200, analytics.text)
        self.assertEqual(analytics.json()["total_flags"], 1)
        self.assertEqual(analytics.json()["enabled_flags"], 0)
        self.assertEqual(analytics.json()["evaluations"], 1)
        self.assertEqual(analytics.json()["true_rate"], 0)
        self.assertEqual(analytics.json()["series"][-1]["false"], 1)

        versions = self.client.get(
            f"/api/v1/flags/{flag_id}/versions",
            headers=self.headers,
        )
        self.assertEqual(versions.status_code, 200, versions.text)
        self.assertEqual(
            [item["version_number"] for item in versions.json()],
            [2, 1],
        )
        activity = self.client.get("/api/v1/activity", headers=self.headers)
        self.assertEqual(activity.status_code, 200, activity.text)
        self.assertTrue(
            any(item["action"] == "flag.updated" for item in activity.json())
        )

    def test_demo_seed_is_repeatable_and_preserves_flags_and_users(self) -> None:
        development = self.client.post(
            "/api/v1/environments",
            headers=self.headers,
            json={"name": "Development"},
        ).json()
        existing = self.client.post(
            "/api/v1/flags",
            headers=self.headers,
            json={
                "key": "new_checkout",
                "type": "boolean",
                "default_value": False,
                "enabled": False,
                "rollout_percentage": 5,
                "environment_id": development["id"],
            },
        )
        self.assertEqual(existing.status_code, 201, existing.text)

        with self.session_factory() as session:
            seed_demo_data(session)
            seed_demo_data(session)
            preserved = session.get(Flag, existing.json()["id"])
            self.assertIsNotNone(preserved)
            assert preserved is not None
            self.assertFalse(preserved.enabled)
            self.assertEqual(preserved.rollout_percentage, 5)
            self.assertEqual(session.query(User).count(), 1)
            self.assertEqual(session.query(Flag).count(), 40)
            self.assertEqual(session.query(EvaluationStat).count(), 40 * 7)


if __name__ == "__main__":
    unittest.main()
