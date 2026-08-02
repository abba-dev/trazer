<p align="center">
  <img src="https://raw.githubusercontent.com/abba-dev/trazer/main/img/trzrlogo.png" width="110" alt="Trazer">
</p>

<h1 align="center">Trazer</h1>

<p align="center">
  <em>Track less. Build more.</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0EA5E9?style=flat-square" alt="MIT license"></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/API-.NET%2010-512BD4?style=flat-square" alt=".NET 10 API"></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/Web-React%20%2B%20Vite-61DAFB?style=flat-square" alt="React + Vite frontend"></a>
  <a href="#stack"><img src="https://img.shields.io/badge/DB-PostgreSQL-336791?style=flat-square" alt="PostgreSQL"></a>
  <a href="apps/api/Trazer.Query"><img src="https://img.shields.io/badge/Search-TQ-0EA5E9?style=flat-square" alt="TQ — Trazer Query"></a>
  <a href="#deploy"><img src="https://img.shields.io/badge/Deploy-Docker%20%7C%20Native-111111?style=flat-square" alt="Docker or Native"></a>
</p>

---

Software development shouldn't need enterprise software to track an
issue. Trazer is the issue tracker that gets out of the way: a board,
a backlog, sprints, releases, and a query language instead of a search
form. One instance, one team, no per-seat license.

## Features

- **Board** — drag issues between columns, drop into empty ones. Two clicks, no forms.
- **Backlog** — plan into sprints, filter by epic, watch the points add up.
- **Sprints & releases** — start one, end one, ship one. Progress shows up without you asking.
- **Issue panel** — every field editable inline. Comments, history, attachments, all in the side panel. No "edit screen" round-trip.
- **TQ — Trazer Query** — search is a query, not a form. `assignee = me`, `status in (Done, QA)`, `GAME-1`. 60 tests cover the parser.
- **Keyboard first** — `Ctrl+K` to search, `Ctrl+N` to create, `o` to open, `?` for the cheat sheet. The mouse is optional.
- **Per-project** — labels, epics and members live on the project, not in a global admin panel. No cross-tenant weirdness.
- **History** — every change recorded: who, what, from what, to what, when. No audit log to enable, no retention policy to write.

## What it's not

No SSO, no SAML, no per-seat license, no custom fields yet, no workflow
engine, no plugin marketplace, no AI features, no public roadmap page,
no marketing emails. We're not adding them unless someone shows up with
a real reason. The constitution says no enterprise bloat and we read it.

## TQ

Search is a query, not a form:

```
assignee = me                           my issues
status in (Done, QA)                    finished or in QA
epic = "UI / UX"                        quoted values with spaces
label ~ bug                             case-insensitive substring
priority = High and sprint = "Sprint 1" compound queries
GAME-1                                  by key
```

Fields: `assignee`, `reporter`, `status`, `priority`, `project`, `label`, `epic`,
`sprint`, `release`, `type`, `title`, `description`, `text`, `estimate`.
Operators: `=`, `!=`, `~`, `in (...)`. Grammar and implementation live in
[`apps/api/Trazer.Query`](apps/api/Trazer.Query).

## Quick start

```sh
docker compose up -d
```

- Web: http://localhost:3000
- API: http://localhost:8080

## Deploy

Two paths. The Docker one is the easy one. The native one is for the
VPS crowd that doesn't want a daemon manager for the daemon manager.

### Docker Compose (default)

```sh
docker compose up -d
```

Web on `:3000`, API on `:8080`. OAuth providers are opt-in via the
commented `Google__*` / `GitHub__*` in `docker-compose.yml`.

### Native (bare metal / VPS)

Any host with **PostgreSQL 15+**, **.NET 10 runtime** and **nginx** (or
any static server) works. The API listens on `:8080` in both deploys.

1. **Postgres** — create a role and database.
   ```sh
   sudo -u postgres createuser trazer
   sudo -u postgres createdb -O trazer trazer
   ```
2. **API** — publish to `/opt/trazer/api`.
   ```sh
   cd apps/api && dotnet publish -c Release -o /opt/trazer/api
   ```
3. **Web** — build static assets.
   ```sh
   cd apps/web && npm ci && npm run build       # → apps/web/dist
   ```
4. **nginx** serves `dist/` and reverse-proxies `/api/`.
   ```nginx
   server {
     listen 80;
     server_name trazer.example.com;
     root /opt/trazer/web/dist;
     location / { try_files $uri $uri/ /index.html; }
     location /api/ {
       proxy_pass http://127.0.0.1:8080;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
     }
   }
   ```
5. **systemd** supervises the API. Required env vars live in the unit, not
   the repo.
   ```ini
   [Service]
   WorkingDirectory=/opt/trazer/api
   ExecStart=/usr/bin/dotnet /opt/trazer/api/Trazer.Api.dll
   Environment=ConnectionStrings__Default=Host=localhost;Database=trazer;Username=trazer;Password=...
   Environment=Jwt__Key=<32+ random chars>
   Environment=ASPNETCORE_URLS=http://0.0.0.0:8080
   Restart=always
   ```
6. HTTPS via Caddy or Let's Encrypt + certbot.

Required env (the API won't start without `Jwt__Key`):
`ConnectionStrings__Default`, `Jwt__Key`, `ASPNETCORE_URLS`. OAuth
providers are off until `Google__*` / `GitHub__*` are set.

## Stack

- **Web** — React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, dnd-kit
- **API** — ASP.NET Core minimal API (.NET 10), EF Core, JWT + bcrypt
- **DB** — PostgreSQL
- **Deploy** — Docker Compose (default) or native (Postgres + .NET + nginx)

## Repo layout

```
apps/
  api/        ASP.NET Core minimal API
  api.Tests/  TQ parser/compiler tests (60 tests)
  web/        React frontend
```

## Development

Prerequisites: .NET 10 SDK, Node.js 20+, Docker (or native Postgres 15+).

```sh
docker compose up -d db          # PostgreSQL

cd apps/api
dotnet run                       # API on http://localhost:8080 (set ASPNETCORE_URLS)

cd apps/web
npm install
npm run dev                      # web on http://localhost:5173 (proxies /api to :8080)
```

```sh
dotnet test                      # 60 tests
npm run lint                     # oxlint
npm run build                    # tsc + vite build
```

## FAQ

**Why another issue tracker?**
Because the alternatives are either too thin (sticky notes don't
survive a sprint) or too thick (the next one needs a consultant to
configure). Trazer is the middle: a real tracker, no consultants.

**Multi-tenant? Multi-team?**
One team per instance. Run it for your team, run more instances for
more teams. We're not shipping "projects as a tenant" until someone
actually needs it.

**Custom fields? Workflows? Plugins?**
Not yet. The constitution says no enterprise bloat. When custom
fields land, they'll be per-project and the query language will
understand them.

**Why "Trazer"?**
It's the verb form of "track" in old Galician-Portuguese. Short,
pronounceable in any language, doesn't collide with Jira, Linear,
Trello, Asana, Notion, ClickUp, Height, Plane, Leantime,
OpenProject, or any of the other 200 trackers named this decade.

## License

[MIT](LICENSE).
