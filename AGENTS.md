# AGENTS.md — reglas primarias

- **REGLAS PRIMARIAS**
  1. **Nada de procesos de larga duración en el flujo principal**: cualquier cosa que deba quedar corriendo (dev servers, `dotnet run`, `npm run dev`, listeners, watchers) se delega a un subagente (Task tool). Nunca `Start-Process` huérfano ni sleeps largos en el flujo principal. El agente los levanta, verifica health y reporta.
  2. Los cierres de sesión se cortan cuando el usuario lo pide ("corta"). Nunca commitear sin pedido explícito (o convención pactada "una por vez + commit").
  3. Todo cambio se verifica (build/test/smoke) antes de dar por terminado.

## Stack de dev local (nativo, sin Docker)

- API: `dotnet run --project apps/api --no-launch-profile` en `:8080`.
  Env requeridos: `ConnectionStrings__Default=Host=localhost;Database=trazer;Username=trazer;Password=trazer`,
  `Jwt__Key=dev-only-secret-change-in-production`, `ASPNETCORE_URLS=http://localhost:8080`,
  `ASPNETCORE_ENVIRONMENT=Development`, `Demo__Enabled=true` (para modo demo).
- Web: `npm run dev` en `apps/web` → `:5173` (proxy `/api` → `:8080`).
- Postgres nativo: servicio Windows `postgresql-x64-17` (rol/db `trazer`).
- Logs de los procesos delegados: `%TEMP%\trazer-api.log`, `%TEMP%\trazer-web.log`.

## Modo demo

- `Demo__Enabled=true` activa: seed de datos demo (idempotente), `POST /api/auth/demo-login`,
  badge "Demo" en UI (vía `GET /api/config`). Con el flag apagado no queda ningún rastro de demo
  (la versión final self-hosted es limpia).
