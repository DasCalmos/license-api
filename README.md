# Calmo License API

Express and MongoDB service for managing license keys, whitelisted Minecraft servers,
panel users, and the read-only LiteBans integration.

## License validation APIs

### Legacy API for existing plugins

The original key-only contract remains available during the migration:

```text
GET /license?key=CALMO-XXXX-XXXX
```

Legacy access can be disabled separately for each license in the panel after all of its
plugins have been updated.

### Server-bound API v2

Updated plugins should call:

```text
GET /v2/license?key=CALMO-XXXX-XXXX
```

The v2 endpoint returns `VALID` only when the key exists and the request's public source
IP matches an enabled server assigned to that license. A server can be configured with a
literal public IP or a hostname. Hostnames are resolved through regular A/AAAA records
and Minecraft `_minecraft._tcp` SRV records. All resulting IPv4 and IPv6 addresses are
cached for five minutes. Both endpoints return exactly one of `VALID`, `INVALID`, or
`ERROR` as plain text.

Do not send a player IP or server IP as a query parameter or custom header. The API uses
the network source address supplied by Render's trusted reverse proxy.

If a Minecraft hostname points to a TCP proxy or DDoS protection service, its DNS address
may differ from the server's outbound IP. In that case, whitelist the outbound public IP
instead of the hostname.

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
npm test
npm start
```

Production deployments must use HTTPS. The app expects one trusted reverse proxy,
which matches common hosting platforms such as Render or Railway.

## Server migration

1. Keep existing plugin versions on `/license`.
2. Add each Minecraft server in the **Servers** panel and assign a license.
3. Update a plugin to call `/v2/license` and verify that **Last successful check** changes.
4. Disable legacy access for that license only after every associated server is on v2.

Existing licenses are migrated with legacy access enabled. This prevents current Java
plugins from being interrupted by the deployment.

## Security features

- Session regeneration after login and an eight-hour absolute session lifetime
- CSRF protection for login, logout, and every administrative write operation
- Login throttling with constant-cost password verification for unknown users
- Strict Content Security Policy with external CSS and JavaScript
- Protected owner account to prevent administrative lockout races
- Strict permission values, MongoDB ID validation, and bcrypt byte-length validation
- Responsive redesigned login and administration interface
- Per-license migration switch for the legacy key-only endpoint
- Server-bound v2 validation using normalized IPv4/IPv6 source addresses
- Hostname resolution with positive and negative DNS caching
- Server status, resolved addresses, and last-successful-check visibility in the panel
