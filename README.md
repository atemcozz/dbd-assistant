# dbd-assistant

A small local multiplayer game assistant inspired by Dead by Daylight.

## What this is

A lightweight web app to support a physical game played in a real building. Players move around in real life; the app tracks game state, quests, health, abilities, buffs, and survivor chat.

## Stack

- **Frontend** (`app/web`): React 19, Vite, TypeScript, Tailwind CSS, shadcn/ui components, Zustand, Socket.IO client
- **Backend** (`app/api`): NestJS, Prisma, SQLite, Socket.IO
- **Config** (`config/`): YAML files for quests, characters, abilities, buffs — synced to SQLite via `npm run config:sync`

## Setup

Requirements: Node.js 20+ and npm.

```sh
npm install
cp app/api/.env.example app/api/.env
cp app/web/.env.example app/web/.env
npm run prisma:generate --workspace=@dbd-assistant/api
npm run db:push --workspace=@dbd-assistant/api
npm run config:sync
```

The SQLite database lives at `app/api/prisma/data/game.db`.

## Development

Run frontend and backend in separate terminals:

```sh
npm run dev --workspace=@dbd-assistant/web
npm run dev --workspace=@dbd-assistant/api
```

- Frontend: Vite dev server (check terminal output for port)
- Backend: `http://localhost:3000` (also exposed on LAN via `0.0.0.0`)

### Manual recovery

```sh
# Edit config YAML, then:
npm run config:sync
# Restart the API
```

The database file can be inspected/edited with any SQLite tool.

If a player's client misbehaves during a live game, open the site with
`?debug` (admin diagnostics: connection facts, API ping, localStorage
session repair).

## Game flow

1. **Create** a game room — you become the owner (a survivor by default)
2. **Share** the 6-character code with other players
3. **Join** — other players enter the code and pick a name
4. **Configure** (owner): assign roles (Survivor/Killer), pick characters, select quests, set game duration and required quest count
5. **Start** — game enters RUNNING status
6. **Play** — complete quests, use abilities, killer attacks survivors, survivor chat
7. **Finish** — owner can end the game, or it ends when the timer expires

## API health check

```sh
curl http://localhost:3000/health
# => {"status":"ok"}
```

## Serving behind a subpath

The frontend build uses relative asset URLs, so one build works under any
path or domain — the reverse proxy owns path mapping. It must strip its
prefix when proxying to the web container (trailing slash matters —
without it, assets resolve as HTML and the app won't boot):

```nginx
location /dbdassistant/ {
    proxy_pass http://<docker-host>:3333/;
}
```

## Verification

```sh
npm run build
npm run test
npm run lint
npm run prisma:validate --workspace=@dbd-assistant/api
```
