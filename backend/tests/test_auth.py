import unittest
from datetime import datetime, timedelta, timezone

import jwt
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.database.connection import get_db
from app.main import app
from app.models.user import User
from app.security import JWT_ALGORITHM, _signing_key


class AuthenticationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        User.__table__.create(self.engine)
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

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        settings.JWT_SECRET_KEY = self.previous_secret
        self.engine.dispose()

    def register(self, email: str = "person@example.com") -> dict:
        response = self.client.post(
            "/auth/register",
            json={
                "name": "Test Person",
                "email": email,
                "password": "correct-horse-battery",
            },
        )
        return response.json()

    def test_registration_stores_hash_and_never_returns_password(self) -> None:
        response = self.client.post(
            "/auth/register",
            json={
                "name": "Test Person",
                "email": "person@example.com",
                "password": "correct-horse-battery",
            },
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.json())
        self.assertNotIn("password_hash", response.json())
        with self.session_factory() as session:
            user = session.query(User).filter_by(email="person@example.com").one()
            self.assertNotEqual(user.password_hash, "correct-horse-battery")

    def test_duplicate_registration_is_rejected(self) -> None:
        self.register()
        response = self.client.post(
            "/auth/register",
            json={
                "name": "Another Person",
                "email": "person@example.com",
                "password": "another-safe-password",
            },
        )
        self.assertEqual(response.status_code, 409)

    def test_login_issues_token_and_protected_me_endpoint_accepts_it(self) -> None:
        self.register()
        response = self.client.post(
            "/auth/login",
            json={
                "email": "person@example.com",
                "password": "correct-horse-battery",
            },
        )

        self.assertEqual(response.status_code, 200)
        token = response.json()["access_token"]
        me = self.client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(me.status_code, 200)
        self.assertEqual(me.json()["email"], "person@example.com")
        self.assertNotIn("password_hash", me.json())

    def test_invalid_password_and_unknown_user_are_rejected(self) -> None:
        self.register()
        wrong_password = self.client.post(
            "/auth/login",
            json={"email": "person@example.com", "password": "incorrect-password"},
        )
        unknown_user = self.client.post(
            "/auth/login",
            json={"email": "unknown@example.com", "password": "incorrect-password"},
        )
        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_user.status_code, 401)

    def test_missing_and_invalid_tokens_are_rejected(self) -> None:
        missing = self.client.get("/auth/me")
        invalid = self.client.get(
            "/auth/me", headers={"Authorization": "Bearer not-a-jwt"}
        )
        self.assertEqual(missing.status_code, 401)
        self.assertEqual(invalid.status_code, 401)

    def test_frontend_origin_can_preflight_authenticated_api_requests(self) -> None:
        response = self.client.options(
            "/auth/me",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.headers["access-control-allow-origin"],
            "http://localhost:5173",
        )
        self.assertIn(
            "authorization",
            response.headers["access-control-allow-headers"].lower(),
        )

    def test_expired_token_is_rejected(self) -> None:
        user_data = self.register()
        token = jwt.encode(
            {
                "sub": str(user_data["id"]),
                "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
            },
            _signing_key(),
            algorithm=JWT_ALGORITHM,
        )
        response = self.client.get(
            "/auth/me", headers={"Authorization": f"Bearer {token}"}
        )
        self.assertEqual(response.status_code, 401)


if __name__ == "__main__":
    unittest.main()
