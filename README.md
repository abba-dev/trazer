![Trazer](https://github.com/abba-dev/trazer/blob/main/moodboard/trzrlogo.png )

Fast issue tracking focused on speed, simplicity and developer productivity.

## Stack

- **Web**: React, TypeScript, Vite, Tailwind, shadcn/ui, TanStack Query, dnd-kit
- **API**: ASP.NET Core (minimal API, .NET 10)
- **DB**: PostgreSQL
- **Deploy**: Docker Compose

## Repo layout

```
apps/
  api/    ASP.NET Core minimal API
  web/    React frontend
docs/     Product constitution and project docs
```

## Development

### Prerequisites

- .NET 10 SDK
- Node.js 20+
- Docker (for PostgreSQL)

### Run the API

```sh
cd apps/api
dotnet restore
dotnet run
```

### Run the web app

```sh
cd apps/web
npm install
npm run dev
```

### Full stack with Docker

```sh
docker compose up
```
