# Calmo License API

Small Express and MongoDB service for managing license keys and panel users.

## Java plugin compatibility

The public validation contract is intentionally unchanged:

```text
GET /license?key=CALMO-XXXX-XXXX
```

The response body remains exactly one of `VALID`, `INVALID`, or `ERROR`. No login,
CSRF token, or additional header is required for this endpoint.

## Environment

```env
MONGO_URI=mongodb://...
# Optional; defaults to "user"
ADMIN_USER=user
ADMIN_PASS=choose-a-strong-initial-password
SESSION_SECRET=use-at-least-32-random-characters
NODE_ENV=production
PORT=3000

# LiteBans (password must be added only in Render)
LITEBANS_DB_HOST=62.72.177.23
LITEBANS_DB_PORT=3306
LITEBANS_DB_NAME=s6538_litebans
LITEBANS_DB_USER=u6538_obShyClfxu
LITEBANS_DB_PASSWORD=
LITEBANS_TABLE_PREFIX=litebans_
LITEBANS_DB_SSL=false
```

`ADMIN_USER` (default: `user`) and `ADMIN_PASS` create the first account only. Existing
databases are migrated automatically by protecting the oldest user with user-management
access as the owner account. Owner permissions are always fixed to full access.

The LiteBans panel is read-only. If `LITEBANS_DB_PASSWORD` is missing or the external
database is unavailable, the license service continues to run and the panel displays a
setup notice. Never commit the database password to this repository.

## Run

```bash
npm install
npm run check
npm start
```

Production deployments must use HTTPS. The app expects one trusted reverse proxy,
which matches common hosting platforms such as Render or Railway.

## Security changes in 1.1

- Session regeneration after login and an eight-hour absolute session lifetime
- CSRF protection for login, logout, and every administrative write operation
- Login throttling with constant-cost password verification for unknown users
- Strict Content Security Policy with external CSS and JavaScript
- Protected owner account to prevent administrative lockout races
- Strict permission values, MongoDB ID validation, and bcrypt byte-length validation
- Responsive redesigned login and administration interface
