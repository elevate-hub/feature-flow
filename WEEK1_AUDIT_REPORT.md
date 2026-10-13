# Week 1 Audit Report

## Verified status

| Deliverable | Status | Evidence |
|---|---|---|
| Project and dependency setup | PARTIAL | Backend package folders and two virtual environments are present. The workspace-root `.venv` (Python 3.13.3) runs the verified checks and has the added auth/test dependencies; `backend/venv` is a duplicate interpreter that does not expose those dependencies. No frontend implementation or root README was found in the inspected project. |
| PostgreSQL connection and existing schema | COMPLETE | Read-only connection succeeded against `feature_flag_db`. Existing tables: `users`, `environments`, `flags`, `flag_versions`, `user_groups`, `user_group_memberships`, `targeting_rules`, `audit_log`, and `evaluation_stats`. Inspected constraints/indexes; flags are unique per environment and relevant lookup indexes exist. |
| SQLAlchemy models and imports | COMPLETE | Replaced empty/incomplete model modules and aligned metadata with live PostgreSQL columns, types, constraints, indexes, FK delete rules, and ORM relationships. All nine entities are exported from `app.models`; read-only Alembic metadata comparison reports no schema differences. |
| Core flag evaluation | COMPLETE (Week 1 scope) | Existing raw-SQL service passed its three database-backed tests: existing/default value, missing flag, and disabled flag. |
| Alembic configuration | PARTIAL | `env.py` now imports all model metadata and uses the settings-derived URL directly instead of the placeholder in `alembic.ini`. A read-only metadata comparison reports no differences. No `alembic_version` table or revision scripts exist, so migration history/baseline still needs an explicit safe decision. No migration was applied or created. |
| Registration and login | COMPLETE (implementation) | New `/auth/register` and `/auth/login` endpoints use the existing `users` table; duplicate email returns 409 and login failure returns 401. |
| Password hashing and JWT | COMPLETE | Argon2 password hashing via `pwdlib`; signed HS256 access tokens with expiration; token subject resolves to an active database user. Root `.env` contains `JWT_SECRET_KEY`; settings load it, and its configured length meets the 32-character minimum without exposing its value. |
| Protected endpoints | PARTIAL | `/auth/me` requires a valid bearer token. No feature-flag management write endpoints exist yet to protect. |
| Startup and API integration | COMPLETE | App imports successfully and OpenAPI exposes `/`, `/auth/register`, `/auth/login`, `/auth/me`, and `/flags/{flag_key}`. |

## Changes made

- Repaired the model modules to match the existing database schema without touching database tables or data.
- Centralized database session dependency and application database URL construction.
- Added authentication request/response schemas, Argon2 hashing, JWT utilities, user dependency, and auth routes.
- Registered the auth and flags routers.
- Configured Alembic to read the database URL from application settings and import all model metadata.
- Added isolated authentication tests and pinned authentication/test dependencies in `backend/requirements.txt`.
- Added root `.env.example`, matching the existing settings loader; the actual `.env` was not edited or printed.
- Added a root `.gitignore` rule for `.env` after verification showed the prior backend-only `.gitignore` did not exclude the project-root environment file. Confirmed `.env` is not tracked.

## Tests and actual results

- PostgreSQL connection and schema inspection: **passed** (read-only).
- Existing database-backed evaluation tests: **passed** (3 scenarios).
- Authentication tests: **passed** (6 tests, 0 failures, 0 errors); includes registration, duplicate email, password-hash secrecy, login, invalid credentials, valid/missing/invalid/expired JWT handling, and protected `/auth/me`.
- App import and OpenAPI check: **passed**; all expected paths registered.
- SQLAlchemy mapper configuration and Alembic metadata comparison: **passed**; no metadata-to-live-schema differences detected.
- JWT configuration check: **passed**; `JWT_SECRET_KEY` exists in root `.env`, is loaded by settings, and meets the 32-character validation requirement (secret value not displayed).
- Git secret-exclusion check: **passed** after adding a root `.gitignore`; `git check-ignore .env` succeeds and `.env` is untracked.
- The auth tests emit a third-party Starlette deprecation warning about its current `httpx` integration; tests pass despite it.
- Alembic migration application was intentionally not attempted; `alembic_version` is absent.

## Remaining manual steps

1. Use the project-root `.venv` for these checks or install `backend/requirements.txt` into `backend/venv`; the latter currently lacks the auth dependencies.
2. Before establishing Alembic history for the existing tables, decide on and review a baseline/stamp procedure. Do not run an initial create-all migration against this populated database.
3. Implement management write routes before adding JWT protection to those routes.
4. Frontend implementation remains out of the current repository.

## Commands

From `backend`:

```powershell
..\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
..\.venv\Scripts\python.exe -m unittest discover -s tests -v
..\.venv\Scripts\python.exe test_evaluation_service.py
```
