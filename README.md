<p align="center">
  <img src="https://raw.githubusercontent.com/abba-dev/trazer/main/img/trzrlogo.png" width="400" alt="Trazer">
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0EA5E9?style=flat-square" alt="MIT license"></a>
  <a href="apps/api"><img src="https://img.shields.io/badge/API-.NET%2010-512BD4?style=flat-square" alt=".NET 10 API"></a>
  <a href="apps/web"><img src="https://img.shields.io/badge/Web-React%20%2B%20Vite-61DAFB?style=flat-square" alt="React + Vite frontend"></a>
  <a href="#stack"><img src="https://img.shields.io/badge/DB-PostgreSQL-336791?style=flat-square" alt="PostgreSQL"></a>
  <a href="apps/api/Trazer.Query"><img src="https://img.shields.io/badge/Search-TQ-0EA5E9?style=flat-square" alt="TQ — Trazer Query"></a>
</p>

---

The issue tracker that gets out of your way. A board, a backlog,
sprints, releases, and a query language instead of a search form.
One instance, one team, no per-seat license.

## What's in it

- **Board** — drag issues between columns, drop into empty ones
- **Backlog** — plan into sprints, filter by epic, watch the points
- **Sprints & releases** — start one, end one, ship one
- **Issue panel** — every field editable inline, no round-trip
- **TQ** — search is a query, not a form (`assignee = me`, `GAME-1`)
- **Keyboard first** — `Ctrl+K`, `Ctrl+N`, `o`, `?` for the cheat sheet
- **Per-project** — labels, epics and members live on the project
- **History** — every change recorded: who, what, from what, to what

## Get it running

### Native

Prereqs: Node 20+, .NET 10 SDK, Postgres 15+ on `localhost:5432` with
a `trazer` user and db.

1. **Clone** the repo:
   ```sh
   git clone https://github.com/abba-dev/trazer.git && cd trazer
   ```
2. **Run** the dev script — it installs `apps/web/node_modules` if
   missing, spawns the API on `:8080` and vite on `:5173`, waits for
   both to respond, and prints the URL:
   ```sh
   node scripts/trazer.mjs dev
   ```
3. **Open** the URL the script prints (default `http://localhost:5173`).

To stop: `node scripts/trazer.mjs dev stop`.

### Docker

Prereqs: Docker.

1. **Clone** the repo:
   ```sh
   git clone https://github.com/abba-dev/trazer.git && cd trazer
   ```
2. **Run** compose:
   ```sh
   docker compose up -d
   ```
3. **Open** `http://localhost:3000`.

## Step by step

1. **Sign in** with the seeded admin (or bootstrap your own:
   `npx trazer admin create --email=me@x --password=...`).
2. **Create a project** with a short key — it shows up in every issue
   (`GAME-1`, `GAME-2`).
3. **Add an issue** with `Ctrl+N`. Title, type, priority. Done.
4. **Drag it across the board** — ToDo → InProgress → InReview → QA →
   Done. The position saves automatically.
5. **Find it** with TQ: `Ctrl+K`, then `assignee = me` or `GAME-1`.
6. **Script it** with the CLI: `npx trazer issue create GAME "Fix the bug"`
   from your terminal or CI.

## Search like a query

TQ is the search. No form to fill, no filters to click:

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
Operators: `=`, `!=`, `~`, `in (...)`. Parser + compiler live in
[`apps/api/Trazer.Query`](apps/api/Trazer.Query).

## Stack

| | |
|---|---|
| **Web** | React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, dnd-kit |
| **API** | ASP.NET Core minimal API (.NET 10), EF Core, JWT + bcrypt |
| **DB** | PostgreSQL |

## Develop

From the root, the same flows are wrapped as `npm` scripts:

```sh
npm test         # 60 dotnet tests + tsc + vite build
npm run build    # dotnet publish + tsc + vite build
npm run clean    # remove build artifacts
```

### Trazer CLI

A small CLI for scripting against the API:

```sh
npx trazer issue list GAME
npx trazer issue create GAME "Fix the bug"
npx trazer issue update GAME-1 --status=Done
npx trazer user me
```

Set `TRAZER_TOKEN` (a JWT or API token) and `TRAZER_API` (default
`http://localhost:8080`). Run `npx trazer` for the full help. Long-
running commands (`dev:*`) belong in a sub-agent per
[AGENTS.md](AGENTS.md).

## Why

Because the alternatives are either too thin (sticky notes don't
survive a sprint) or too heavy (a week of configuration before your
first issue). Trazer is the middle: a real tracker, up and running
in a minute.

Multi-tenant? No — one team per instance, run more instances for more
teams. Why "Trazer"? It's the verb form of "track" in old
Galician-Portuguese. Short, pronounceable, doesn't collide with Jira,
Linear, Trello, Asana, Notion, ClickUp, Height, Plane, Leantime,
OpenProject, or any of the other 200 trackers named this decade.

## License

[MIT](LICENSE).
