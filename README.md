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

All flag, environment, targeting, group, audit, and workspace administration
routes require an active administrator account. Registration always creates a
regular `user` account. The evaluation route accepts any authenticated account
and uses only the external end-user `user_key`; dashboard account IDs are never
used as evaluation identities.

## Feature flag endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/flags` | Create a flag in an environment |
| GET | `/api/v1/flags` | List all flags |
| GET | `/api/v1/flags/{flag_id}` | Retrieve a flag |
| PUT | `/api/v1/flags/{flag_id}` | Update a flag |
| DELETE | `/api/v1/flags/{flag_id}` | Delete a flag |
| GET | `/api/v1/flags/{flag_id}/versions` | List saved configuration versions |

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

## Release controls

All release-control routes require a bearer token. Feature flags support a
`rollout_percentage` from 0 to 100; omitted values default to 0. A disabled
flag is an immediate kill switch and evaluates to `false`.

| Method | Path | Purpose |
|---|---|---|
| GET, POST | `/api/v1/flags/{flag_id}/targeting-rules` | List or add ordered user, attribute, or group rules |
| PUT, DELETE | `/api/v1/targeting-rules/{rule_id}` | Update or remove a targeting rule |
| GET, POST | `/api/v1/user-groups` | List or create user groups |
| PUT, DELETE | `/api/v1/user-groups/{group_id}` | Update or remove a group |
| POST | `/api/v1/user-groups/{group_id}/members` | Add an end-user by external `user_key` |
| DELETE | `/api/v1/user-groups/{group_id}/members/{membership_id}` | Remove an external group member |
| POST | `/api/v1/evaluations` | Evaluate a flag with user identity and attributes |
| GET | `/api/v1/analytics` | Read environment-scoped dashboard metrics and evaluation series |
| GET | `/api/v1/activity` | Read recent audit events |

Explicit external-user targeting runs first, followed by attribute targeting,
group targeting, percentage rollout, and the default value. Rules within each
targeting category run in ascending priority order.
Attribute operators include equality, membership, containment, numeric
comparison, and set/unset checks. Group rules match the external `user_key`.
Rollout assignment is stable for the same flag key and external `user_key`.
Dashboard account IDs and attributes are not rollout identities. At rollout
percentages from 1 to 99, an evaluation without an external identity returns
`MISSING_CONTEXT`; a group referenced by a targeting rule cannot be deleted
until that rule is removed.

Configuration changes create audit events. Flag creation and updates also
create version snapshots. Evaluation totals and true/false outcomes are
derived from persisted evaluation-stat records; the dashboard shows an empty
state when no evaluation data exists.

## Administrator access

After registering an account, an operator can grant administrator access to
that existing active account from the `backend` directory:

```powershell
python -m app.admin_cli --email you@company.com --confirm
```

The command requires an existing account and an explicit confirmation flag. It
does not create or alter any other account.

## Testing

From the repository root, run the backend unit tests:

```powershell
Push-Location backend
python -m unittest discover -s tests -v
Pop-Location
```

To try the API manually, use Swagger UI at `/docs`, or import the endpoint paths
into Postman. First call `/auth/login`, then configure a Bearer Token
authorization using the returned `access_token`.

Run the frontend development server and production build from the repository
root:

```powershell
npm --prefix frontend install
npm --prefix frontend run dev
npm --prefix frontend run build
```

The Vite development server is available at `http://localhost:5173`. Its
development proxy sends `/auth` and `/api` requests to
`VITE_API_PROXY_TARGET` (default `http://127.0.0.1:8000`), avoiding browser
cross-origin failures for local development. Copy `frontend\.env.example` to
`frontend\.env` to change the proxy target. For a separately hosted frontend,
set `VITE_API_BASE_URL` to the API origin and include the frontend origin in
the backend `CORS_ORIGINS` JSON list.

## Development demonstration data

Demo data is never loaded automatically. To seed missing Development, Staging,
Production, Testing, feature flag, group, membership, targeting-rule, audit,
and evaluation-stat records, set the environment and run the script from
`backend`:

```powershell
Push-Location backend
$env:APP_ENV = "development"
python seed_demo.py --apply
Pop-Location
```

The script refuses to run unless `APP_ENV` is `development` or `demo`, and
requires `--apply`. Existing users are never created or changed. Existing
environments, flags, groups, memberships, rules, and statistics are not
overwritten; only missing records are inserted. Sample end-user keys use a
`demo-user-` prefix.

## Database migrations

Alembic is configured in `backend\alembic.ini`, but there are currently no
Alembic revision files; the schema additions are documented as additive SQL
scripts under `backend\migrations`. No migration or database operation is
performed at application startup or by the demo seed script.

The configured database has not been queried or modified as part of this work.
The project owner reports that the rollout-percentage change is already
applied; do not rerun
`backend\migrations\2026_11_05_add_flag_rollout_percentage.sql` if so. The
external end-user membership table and evaluation outcome counter columns are
required by their APIs and are defined in
`backend\migrations\2026_11_05_add_external_user_group_memberships.sql` and
`backend\migrations\2026_11_06_add_evaluation_outcome_counts.sql`. Verify the
live schema and apply these additive changes through the normal database
change process before enabling those features. No migrations were run here.
"# feature-flow" 
