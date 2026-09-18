# Backend Service Implementation Plan

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Backend technology | Spring Boot (Java 21) | Aligns with project's target framework; production-grade; mature security/payment ecosystems |
| Integration model | Backend required | User's explicit request (overrides roadmap's local-first principle) |
| Database | PostgreSQL + Spring Data JPA | Production-grade relational DB; JSON support for project/histories |
| Payment provider | Structure only (no provider yet) | User wants subscription/plans structure; actual billing integration deferred |
| Control panel | Web admin panel | Separate web UI for admin/management |
| JWT strategy | Access (15 min) + Refresh (7 days) in HTTP-only cookies | Industry standard; secure; supports token rotation |
| Deployment | Docker Compose | Includes Spring Boot + PostgreSQL; SMTP for password reset |

## Project Structure

```
backend/
  pom.xml                              # Maven build config
  docker-compose.yml                   # Backend + PostgreSQL
  Dockerfile                           # Spring Boot image
  src/main/
    java/com/archiviz/backend/
      ArchivizBackendApplication.java  # Spring Boot entry point
      config/
        SecurityConfig.java            # JWT filter chain, CORS, password encoder
        JwtConfig.java                 # Token expiry, secret config
        JwtTokenProvider.java          # Token generation/validation
        JwtAuthenticationFilter.java   # HTTP filter for protected endpoints
        RefreshTokenService.java       # Refresh token rotation + reuse detection
        WebMvcConfig.java              # CORS config for Tauri app
      controller/
        AuthController.java            # /api/auth/* — register, login, refresh, logout
        SubscriptionController.java    # /api/subscription/* — plan management
        HistoryController.java         # /api/history/* — project/history CRUD
        AdminController.java           # /api/admin/* — user management, config
        HealthController.java          # /api/health
      dto/
        AuthRequest.java               # login/signup payload
        AuthResponse.java              # tokens + user info
        RefreshRequest.java            # refresh token payload
        PasswordResetRequest.java      # reset password request
        PasswordResetConfirm.java     # reset password confirm
        SubscriptionRequest.java       # subscription plan select
        HistoryEntryDto.java           # project import/export history
      entity/
        User.java                      # id, email, name, passwordHash, role, createdAt
        RefreshToken.java              # token, userId, expiry, revoked
        Subscription.java              # id, userId, plan, status, currentPeriodEnd
        ProjectHistory.java            # id, userId, projectId, projectName, snapshot, createdAt
      repository/
        UserRepository.java
        RefreshTokenRepository.java
        SubscriptionRepository.java
        ProjectHistoryRepository.java
      service/
        AuthService.java               # register, authenticate, token rotation
        UserService.java               # user lookup, delete
        SubscriptionService.java       # plan validation, subscription lifecycle
        HistoryService.java            # save/load/list project history snapshots
        PasswordResetService.java      # token generation, email sending
      security/
        JwtTokenFilter.java            # Spring Security filter
        JwtTokenProvider.java          # (moved to config above)
      exception/
        AuthException.java             # custom exceptions
        GlobalExceptionHandler.java    # @RestControllerAdvice
    resources/
      application.yml                  # DB config, JWT secret, SMTP settings
      db/migration/                    # Flyway migrations
        V1__create_users_table.sql
        V2__create_refresh_tokens_table.sql
        V3__create_subscriptions_table.sql
        V4__create_project_history_table.sql
    webapp/
      STATIC-ADMIN/                    # Web admin control panel (React build)
        (separate React app — see backend-admin/ below)
  src/test/java/com/archiviz/backend/  # Unit + integration tests

backend-admin/                         # Web admin control panel (React + Vite)
  package.json
  vite.config.ts
  src/
    main.tsx
    App.tsx
    routes/
      LoginPage.tsx
      DashboardPage.tsx
      UsersPage.tsx
      SubscriptionsPage.tsx
      ServerStatusPage.tsx
    components/
      UserTable.tsx
      SubscriptionTable.tsx
      ConfigEditor.tsx
  public/
```

## Milestones

### Milestone B.1: Auth System (Account Creation, Login, JWT, Password Reset)

**Endpoints:**
- `POST /api/auth/register` — email, name, password → creates user, returns user info (no auto-login)
- `POST /api/auth/login` — email, password → validates, creates access + refresh tokens, sets HTTP-only cookies
- `POST /api/auth/refresh` — reads refresh cookie, validates, rotates refresh token, issues new access token
- `POST /api/auth/logout` — revokes refresh token, clears cookies
- `POST /api/auth/reset-password/request` — email → generates reset token, sends email via SMTP
- `POST /api/auth/reset-password/confirm` — token, newPassword → resets password
- `POST /api/auth/logout-all` — revokes all user's refresh tokens

**Security:**
- Passwords hashed with BCrypt (strength 12)
- Refresh tokens hashed in DB (store hash, not plaintext)
- Refresh token rotation with reuse detection (if a used token is presented, revoke all user tokens)
- JWT signed with HS256 or RS256, secret from environment variable
- HTTP-only, SameSite=Strict cookies for tokens
- Rate limiting on auth endpoints (e.g., 5 attempts per minute per IP/email)
- CSRF protection for cookie-based auth (double-submit cookie or Spring Security CSRF)

**Database:**
- `users` table: id (UUID), email (unique), name, password_hash, role (USER/ADMIN), created_at, updated_at
- `refresh_tokens` table: id, user_id (FK), token_hash, expires_at, created_at, revoked_at, replaced_by_token_id

**Frontend (Tauri app) changes:**
- Replace `src/pages/Loginpage.tsx` localStorage auth with API calls to backend
- Add `src/utils/apiClient.ts` — wrapper around `fetch` (or `axios`) with credentials: 'include'
- Add `src/utils/authStore.ts` — session state management (reads from backend, stores in Tauri keyring or HttpOnly cookie)
- Update `src/ProductShell.tsx` — check session on load, route protected/unauthenticated paths
- Add password reset flow to login page UI

**Admin panel:**
- Login page
- User management table (list, view, reset password, delete)
- Server status/health display

### Milestone B.2: History System

**Endpoints:**
- `POST /api/history` — saves a project snapshot (requires auth)
- `GET /api/history` — lists user's saved project snapshots (id, name, createdAt, size)
- `GET /api/history/{id}` — retrieves full project snapshot
- `DELETE /api/history/{id}` — deletes a snapshot
- `GET /api/history/export` — exports all user history as JSON

**Database:**
- `project_history` table: id (UUID), user_id (FK), project_name, snapshot (JSON), size_bytes, created_at

**Frontend changes:**
- Add history API client methods to `src/utils/apiClient.ts`
- Update App.tsx to save to backend history on autosave (alongside local autosave)
- Add "Save to History" action in UI

### Milestone B.3: Subscription System

**Endpoints:**
- `GET /api/subscription` — get current user's subscription status + plan details
- `POST /api/subscription` — select a plan (stores intent, returns plan info)
- `GET /api/subscription/plans` — public list of available plans (name, description, features, price)
- `DELETE /api/subscription` — cancel subscription (sets to cancel_at_period_end or immediate)
- `POST /api/subscription/reactivate` — reactivate a canceled subscription

**Plans structure (enum):**
- `FREE` — basic features, limited history entries (e.g., 5)
- `PRO` — unlimited history, priority generation, advanced templates
- `TEAM` — shared projects, team templates, role-based access (future)

**Database:**
- `subscriptions` table: id (UUID), user_id (FK, unique), plan (enum), status (enum: ACTIVE, CANCELED, PAST_DUE, UNPAID, TRIAL), current_period_end, cancel_at_period_end, created_at, updated_at

**Frontend changes:**
- Add subscription store to track plan client-side (fetched from backend on login)
- Add subscription management UI in control panel
- Gate features based on plan (e.g., history limit for free tier)
- Show subscription status in Tauri app UI

### Milestone B.4: Admin Control Panel

**Web admin panel features:**
- Authentication (admin login)
- User management: list all users, view details, reset passwords, delete users, view subscription
- Subscription overview: all subscriptions, filter by plan/status, cancel
- Server health: DB connection, uptime, memory, active sessions
- Configuration: adjust rate limits, feature flags, plan definitions
- System logs: recent auth events, errors

**Backend endpoints for admin:**
- `GET /api/admin/users` — list users (paginated)
- `GET /api/admin/users/{id}` — user details
- `DELETE /api/admin/users/{id}` — delete user
- `GET /api/admin/subscriptions` — list all subscriptions
- `GET /api/admin/stats` — user count, revenue projection, active subs
- `GET /api/admin/config` — current config (non-sensitive)
- `PUT /api/admin/config` — update config

### Milestone B.5: Tauri App Integration

- Update `src-tauri/Cargo.toml` — no changes needed (Tauri acts as frontend only, all API calls go to external backend)
- Update Tauri CSP in `tauri.conf.json` — ensure `connect-src` includes backend API URL (or use localhost for dev)
- Update `src/utils/tauriRuntime.ts` — no changes
- Frontend API client (`src/utils/apiClient.ts`):
  - Uses `fetch` with `credentials: 'include'`
  - Automatic token refresh on 401
  - Base URL configurable via settings

## Risks & Mitigations

1. **Security risk: JWT in desktop app** — Backend required means no offline mode. Mitigate: clear error messaging when backend is unreachable, cache essential data locally.
2. **Cookie-based auth in Tauri webview** — Test thoroughly. Tauri webview may handle cookies differently than browsers.
3. **Password reset without email in dev** — Provide console-based token display in dev mode as fallback.
4. **Subscription enforcement** — All plan checks must happen server-side, not just client-side. Critical to prevent bypass.
5. **Migration from localStorage auth** — Existing users' data will be lost. Provide a one-time migration or clear messaging.

## Testing Strategy

- Unit tests: each service class tested with mocks
- Integration tests: @SpringBootTest with @AutoConfigureTestDatabase (Testcontainers for PostgreSQL)
- API contract tests: RestAssured or Spring's MockMvc for endpoint coverage
- Frontend: update existing component tests to mock API calls instead of localStorage

## Deployment

- `backend/docker-compose.yml` — Spring Boot + PostgreSQL
- `backend/Dockerfile` — multi-stage build
- Environment variables: `JWT_SECRET`, `DB_URL`, `DB_USER`, `DB_PASSWORD`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ADMIN_EMAIL`
- Dev profile: H2 in-memory DB, console-based password reset
- Production profile: PostgreSQL, SMTP email

## Validation Steps

1. Start backend with `docker compose up`
2. Run Spring Boot tests with `./mvnw test`
3. Test auth flow: register → login → refresh → logout
4. Test password reset flow
5. Test history save/load/delete
6. Test subscription plan selection
7. Test admin panel access (admin-only endpoints)
8. Verify Tauri app can authenticate against the new backend
