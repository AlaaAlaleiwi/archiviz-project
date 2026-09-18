# Archiviz backend deployment

The backend is a standalone Java 21 Spring Boot service. The admin console is a separate React application served at an admin subdomain; neither is bundled into the desktop/web frontend.

## Local stack

```sh
cp .env.example .env
docker compose up --build
```

Local addresses:

- Main Java API: `http://api.localhost/api`
- Admin console: `http://admin.localhost`
- Direct API port for development: `http://localhost:8080/api`
- Direct admin port for development: `http://localhost:3000`

Use the `ADMIN_EMAIL` and `ADMIN_PASSWORD` values from `.env` to sign in. Change every example secret before a shared or production deployment.

## Production subdomains

Set `ADMIN_HOST=admin.example.com`, `API_HOST=api.example.com`, `APP_ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`, and `REFRESH_COOKIE_SECURE=true`. Point both DNS records to the host running the stack. Caddy obtains TLS certificates automatically for public hostnames.

The admin nginx container proxies its `/api` path to the Java container, so admin authentication remains same-origin. Other clients call the API subdomain directly and should set `VITE_API_BASE_URL=https://api.example.com/api`.

## Verification

```sh
JAVA_HOME=/path/to/java-21 mvn test
cd ../backend-admin && npm ci && npm run build
docker compose config
```
