![Trazer](https://raw.githubusercontent.com/abba-dev/trazer/main/img/trzrlogo.png)

# Trazer

*Track less. Build more.*

Software development shouldn't require enterprise software. Trazer is an issue
tracker that makes issue tracking almost invisible: a board, a backlog, sprints,
releases, and a query language instead of a search form. Nothing else.

## Features

- **Board** — drag issues between statuses; drop into empty columns.
- **Backlog** — plan issues into sprints, filter by epic, track points.
- **Sprints & releases** — start/end sprints, release with one click, progress at a glance.
- **Issue panel** — every field editable inline; comments, change history, attachments.
- **TQ** — a query language for search: `assignee = me`, `status in (Done, QA)`, `label ~ bug`.
- **Keyboard first** — `Ctrl+K` to search, `Ctrl+N` to create. No configuration to learn.
- **Per-project** — labels, epics and members belong to a project, not to a global admin panel.
- **History** — every change recorded: who changed what, from what, to what.

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
[`apps/api/Trazer.Query`](apps/api/Trazer.Query), covered by 34 tests.

## Quick start

```sh
docker compose up -d
```

- Web: http://localhost:3000
- API: http://localhost:8080

Demo account (dev seed): `demo@trazer.dev` / `password123` — comes with a project,
12 issues, 4 labels, 3 epics, 2 sprints and a release.

## Stack

- **Web**: React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, dnd-kit
- **API**: ASP.NET Core minimal API (.NET 10), EF Core, JWT + bcrypt
- **DB**: PostgreSQL
- **Deploy**: Docker Compose (db, api, web)

## Repo layout

```
apps/
  api/       ASP.NET Core minimal API
  api.Tests/ query language tests
  web/       React frontend
docs/        Constitution, manifest, API reference, TQ grammar, decisions
```

## Development

Prerequisites: .NET 10 SDK, Node.js 20+, Docker.

```sh
docker compose up -d db          # PostgreSQL

cd apps/api
dotnet run                       # API on http://localhost:5081

cd apps/web
npm install
npm run dev                      # web on http://localhost:5173 (proxies /api)
```

```sh
dotnet test                      # 34 tests
npm run lint                     # oxlint
npm run build                    # tsc + vite build
```

## License

[MIT](LICENSE).
