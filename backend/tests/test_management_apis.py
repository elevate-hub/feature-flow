import unittest
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import BigInteger, create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database.base import Base
from app.database.connection import get_db
from app.main import app
from app.models.user import User
from app.security import JWT_ALGORITHM, _signing_key, get_password_hash


@compiles(BigInteger, "sqlite")
def compile_bigint_for_sqlite(type_, compiler, **kwargs):
    return "INTEGER"


@compiles(JSONB, "sqlite")
def compile_jsonb_for_sqlite(type_, compiler, **kwargs):
    return "JSON"


class ManagementApiTests(unittest.TestCase):
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
        settings.JWT_SECRET_KEY = "test-only-secret-key-with-at-least-32-bytes"
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)
        self.user_token = self._register_and_login()
        self.user_headers = {"Authorization": f"Bearer {self.user_token}"}
        with self.session_factory() as session:
            admin = User(
                name="Management Admin",
                email="management-admin@example.com",
                password_hash=get_password_hash("admin-test-password-123"),
                role="admin",
                is_active=True,
            )
            session.add(admin)
            session.commit()
        admin_login = self.client.post(
            "/auth/login",
            json={
                "email": "management-admin@example.com",
                "password": "admin-test-password-123",
            },
        )
        if admin_login.status_code != 200:
            raise AssertionError(admin_login.text)
        self.token = admin_login.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        settings.JWT_SECRET_KEY = self.previous_secret
        self.engine.dispose()

    def _register_and_login(self) -> str:
        response = self.client.post(
            "/auth/register",
            json={
                "name": "Management Tester",
                "email": "management@example.com",
                "password": "test-password-123",
            },
        )
        if response.status_code != 201:
            raise AssertionError(response.text)
        response = self.client.post(
            "/auth/login",
            json={
                "email": "management@example.com",
                "password": "test-password-123",
            },
        )
        if response.status_code != 200:
            raise AssertionError(response.text)
        return response.json()["access_token"]

    def _create_environment(self, name: str = "development") -> int:
        response = self.client.post(
            "/api/v1/environments",
            headers=self.headers,
            json={"name": name, "description": "Test environment"},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def test_all_management_routes_reject_unauthenticated_requests(self) -> None:
        requests = [
            ("post", "/api/v1/flags", {"json": {}}),
            ("get", "/api/v1/flags", {}),
            ("get", "/api/v1/flags/1", {}),
            ("put", "/api/v1/flags/1", {"json": {}}),
            ("delete", "/api/v1/flags/1", {}),
            ("post", "/api/v1/environments", {"json": {}}),
            ("get", "/api/v1/environments", {}),
            ("get", "/api/v1/environments/1", {}),
            ("put", "/api/v1/environments/1", {"json": {}}),
            ("delete", "/api/v1/environments/1", {}),
            ("get", "/api/v1/environments/1/flags", {}),
        ]
        for method, path, kwargs in requests:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401)

    def test_invalid_and_expired_tokens_are_unauthorized_on_all_management_routes(
        self,
    ) -> None:
        expired_token = jwt.encode(
            {
                "sub": "1",
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            _signing_key(),
            algorithm=JWT_ALGORITHM,
        )
        for token in ("not-a-valid-token", expired_token):
            headers = {"Authorization": f"Bearer {token}"}
            for method, path, kwargs in [
                ("post", "/api/v1/flags", {"json": {}}),
                ("get", "/api/v1/flags", {}),
                ("get", "/api/v1/flags/1", {}),
                ("put", "/api/v1/flags/1", {"json": {}}),
                ("delete", "/api/v1/flags/1", {}),
                ("post", "/api/v1/environments", {"json": {}}),
                ("get", "/api/v1/environments", {}),
                ("get", "/api/v1/environments/1", {}),
                ("put", "/api/v1/environments/1", {"json": {}}),
                ("delete", "/api/v1/environments/1", {}),
                ("get", "/api/v1/environments/1/flags", {}),
            ]:
                with self.subTest(token="expired" if token == expired_token else "invalid", method=method, path=path):
                    response = getattr(self.client, method)(
                        path, headers=headers, **kwargs
                    )
                    self.assertEqual(response.status_code, 401, response.text)

    def test_regular_user_is_forbidden_on_all_management_routes(self) -> None:
        environment_id = self._create_environment()
        flag = self.client.post(
            "/api/v1/flags",
            headers=self.headers,
            json={
                "key": "authorization_test",
                "type": "boolean",
                "default_value": False,
                "environment_id": environment_id,
            },
        )
        self.assertEqual(flag.status_code, 201, flag.text)
        flag_id = flag.json()["id"]
        requests = [
            ("post", "/api/v1/flags", {"json": {
                "key": "forbidden_create",
                "type": "boolean",
                "default_value": False,
                "environment_id": environment_id,
            }}),
            ("get", "/api/v1/flags", {}),
            ("get", f"/api/v1/flags/{flag_id}", {}),
            ("put", f"/api/v1/flags/{flag_id}", {"json": {"enabled": False}}),
            ("delete", f"/api/v1/flags/{flag_id}", {}),
            ("post", "/api/v1/environments", {"json": {"name": "forbidden"}}),
            ("get", "/api/v1/environments", {}),
            ("get", f"/api/v1/environments/{environment_id}", {}),
            ("put", f"/api/v1/environments/{environment_id}", {"json": {"description": "forbidden"}}),
            ("delete", f"/api/v1/environments/{environment_id}", {}),
            ("get", f"/api/v1/environments/{environment_id}/flags", {}),
        ]
        for method, path, kwargs in requests:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(
                    path, headers=self.user_headers, **kwargs
                )
                self.assertEqual(response.status_code, 403, response.text)

    def test_admin_can_access_management_routes_and_registration_stays_user_only(
        self,
    ) -> None:
        registration = self.client.post(
            "/auth/register",
            json={
                "name": "Role Safety",
                "email": "role-safety@example.com",
                "password": "test-password-123",
                "role": "admin",
            },
        )
        self.assertEqual(registration.status_code, 201, registration.text)
        self.assertEqual(registration.json()["role"], "user")

        environment_id = self._create_environment("admin-environment")
        self.assertEqual(
            self.client.get("/api/v1/flags", headers=self.headers).status_code, 200
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/environments", headers=self.headers
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                f"/api/v1/environments/{environment_id}", headers=self.headers
            ).status_code,
            200,
        )
        created_flag = self.client.post(
            "/api/v1/flags",
            headers=self.headers,
            json={
                "key": "admin_flag",
                "type": "boolean",
                "default_value": True,
                "environment_id": environment_id,
            },
        )
        self.assertEqual(created_flag.status_code, 201, created_flag.text)
        flag_id = created_flag.json()["id"]
        self.assertEqual(
            self.client.get(
                f"/api/v1/flags/{flag_id}", headers=self.headers
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/v1/flags/{flag_id}",
                headers=self.headers,
                json={"enabled": False},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.put(
                f"/api/v1/environments/{environment_id}",
                headers=self.headers,
                json={"description": "Updated by admin"},
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.get(
                f"/api/v1/environments/{environment_id}/flags",
                headers=self.headers,
            ).status_code,
            200,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/v1/flags/{flag_id}", headers=self.headers
            ).status_code,
            204,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/v1/environments/{environment_id}", headers=self.headers
            ).status_code,
            204,
        )

    def test_flag_and_environment_crud_and_relationship(self) -> None:
        environment_id = self._create_environment()
        self.assertEqual(
            len(self.client.get("/api/v1/environments", headers=self.headers).json()),
            1,
        )
        environment = self.client.get(
            f"/api/v1/environments/{environment_id}", headers=self.headers
        )
        self.assertEqual(environment.status_code, 200)
        updated_environment = self.client.put(
            f"/api/v1/environments/{environment_id}",
            headers=self.headers,
            json={"description": "Updated description"},
        )
        self.assertEqual(updated_environment.status_code, 200)
        self.assertEqual(updated_environment.json()["description"], "Updated description")

        create_flag = self.client.post(
            "/api/v1/flags",
            headers=self.headers,
            json={
                "key": "checkout_v2",
                "type": "boolean",
                "default_value": False,
                "environment_id": environment_id,
                "description": "New checkout",
            },
        )
        self.assertEqual(create_flag.status_code, 201, create_flag.text)
        flag_id = create_flag.json()["id"]
        self.assertEqual(create_flag.json()["environment_id"], environment_id)
        self.assertEqual(
            len(self.client.get("/api/v1/flags", headers=self.headers).json()), 1
        )
        self.assertEqual(
            self.client.get(
                f"/api/v1/flags/{flag_id}", headers=self.headers
            ).status_code,
            200,
        )
        update_flag = self.client.put(
            f"/api/v1/flags/{flag_id}",
            headers=self.headers,
            json={"enabled": False, "default_value": True},
        )
        self.assertEqual(update_flag.status_code, 200, update_flag.text)
        self.assertFalse(update_flag.json()["enabled"])
        self.assertTrue(update_flag.json()["default_value"])
        related_flags = self.client.get(
            f"/api/v1/environments/{environment_id}/flags", headers=self.headers
        )
        self.assertEqual(related_flags.status_code, 200)
        self.assertEqual([flag["id"] for flag in related_flags.json()], [flag_id])

        self.assertEqual(
            self.client.delete(
                f"/api/v1/environments/{environment_id}", headers=self.headers
            ).status_code,
            409,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/v1/flags/{flag_id}", headers=self.headers
            ).status_code,
            204,
        )
        self.assertEqual(
            self.client.delete(
                f"/api/v1/environments/{environment_id}", headers=self.headers
            ).status_code,
            204,
        )

    def test_duplicates_invalid_types_and_missing_resources(self) -> None:
        environment_id = self._create_environment()
        payload = {
            "key": "unique_in_environment",
            "type": "number",
            "default_value": 1,
            "environment_id": environment_id,
        }
        self.assertEqual(
            self.client.post("/api/v1/flags", headers=self.headers, json=payload).status_code,
            201,
        )
        self.assertEqual(
            self.client.post("/api/v1/flags", headers=self.headers, json=payload).status_code,
            409,
        )
        other_environment_id = self._create_environment("staging")
        payload["environment_id"] = other_environment_id
        self.assertEqual(
            self.client.post("/api/v1/flags", headers=self.headers, json=payload).status_code,
            201,
        )
        payload["environment_id"] = environment_id
        payload["default_value"] = True
        self.assertEqual(
            self.client.post("/api/v1/flags", headers=self.headers, json=payload).status_code,
            422,
        )
        payload["type"] = "invalid"
        payload["default_value"] = 1
        self.assertEqual(
            self.client.post("/api/v1/flags", headers=self.headers, json=payload).status_code,
            422,
        )
        payload["type"] = "number"
        payload["default_value"] = 1
        payload["environment_id"] = 99999
        self.assertEqual(
            self.client.post("/api/v1/flags", headers=self.headers, json=payload).status_code,
            404,
        )
        self.assertEqual(
            self.client.get("/api/v1/flags/99999", headers=self.headers).status_code,
            404,
        )
        self.assertEqual(
            self.client.put(
                "/api/v1/flags/99999", headers=self.headers, json={}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete("/api/v1/flags/99999", headers=self.headers).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/environments/99999", headers=self.headers
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.put(
                "/api/v1/environments/99999", headers=self.headers, json={}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.delete(
                "/api/v1/environments/99999", headers=self.headers
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.get(
                "/api/v1/environments/99999/flags", headers=self.headers
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/environments",
                headers=self.headers,
                json={"name": "development"},
            ).status_code,
            409,
        )
        self.assertEqual(
            self.client.post(
                "/api/v1/environments",
                headers=self.headers,
                json={"name": "   "},
            ).status_code,
            422,
        )


if __name__ == "__main__":
    unittest.main()
