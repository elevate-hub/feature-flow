# Feature Flag Management System

FastAPI backend and React/Vite frontend for managing feature flags by environment.

## Backend setup

From the repository root, create and activate a Python environment, then install
the backend dependencies:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

Copy `.env.example` to `.env` in the repository root. Set the PostgreSQL host,
port, database, user, and password for your own database, and set
`JWT_SECRET_KEY` to a private random value at least 32 characters long. Do not
commit `.env` or share its contents.

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Start the backend from the `backend` directory:

```powershell
cd backend
python -m uvicorn app.main:app --reload
```

The API is served at `http://127.0.0.1:8000`. Interactive Swagger documentation
is available at `http://127.0.0.1:8000/docs`.

## Authentication

Register or sign in using the existing authentication endpoints:

- `POST /auth/register` — create an account.
- `POST /auth/login` — obtain a JWT access token.
- `GET /auth/me` — retrieve the authenticated account.

Send the login token on each flag and environment management request as
`Authorization: Bearer <access_token>`. All management endpoints require a
valid JWT.

## Feature flag endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/flags` | Create a flag in an environment |
| GET | `/api/v1/flags` | List all flags |
| GET | `/api/v1/flags/{flag_id}` | Retrieve a flag |
| PUT | `/api/v1/flags/{flag_id}` | Update a flag |
| DELETE | `/api/v1/flags/{flag_id}` | Delete a flag |

Supported flag types are `boolean`, `string`, `number`, and `json`. A
`default_value` must match the selected type. Flag keys must be unique within
their environment.

## Environment endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/environments` | Create an environment |
| GET | `/api/v1/environments` | List all environments |
| GET | `/api/v1/environments/{environment_id}` | Retrieve an environment |
| PUT | `/api/v1/environments/{environment_id}` | Update an environment |
| DELETE | `/api/v1/environments/{environment_id}` | Delete an environment with no flags |
| GET | `/api/v1/environments/{environment_id}/flags` | List flags in an environment |

An environment with flags cannot be deleted; the API responds with HTTP 409.

## Testing

From the repository root, run the backend unit tests:

```powershell
python -m unittest discover -s backend\tests -v
```

To try the API manually, use Swagger UI at `/docs`, or import the endpoint paths
into Postman. First call `/auth/login`, then configure a Bearer Token
authorization using the returned `access_token`.

## Database migrations

Alembic is configured in `backend\alembic.ini`. Before applying migrations to
an existing database, inspect the migration history and verify the live schema.
Never generate or apply a schema-recreating initial migration against an
existing database.
