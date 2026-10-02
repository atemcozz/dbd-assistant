# dbd-assistant

A small local multiplayer game assistant inspired by Dead by Daylight.

## Step 1 scaffold

The project currently contains the application foundation and the game lobby slice:

- `app/web`: React, Vite, TypeScript, Tailwind CSS, shadcn/ui metadata, Zustand, and Socket.IO Client dependencies.
- `app/api`: NestJS, Prisma, SQLite, and Socket.IO server dependencies with a `/health` endpoint, game creation/joining, persisted player sessions, lobby state, roles, and character assignments.

Quest selection, game start, realtime Socket.IO synchronization, and gameplay rules are intentionally not implemented yet.

## Setup

Requirements: Node.js 20 or newer and npm.

```sh
npm install
cp app/api/.env.example app/api/.env
cp app/web/.env.example app/web/.env
npm run prisma:generate --workspace=@dbd-assistant/api
npm run prisma:validate --workspace=@dbd-assistant/api
npm exec --workspace=@dbd-assistant/api prisma db push
```

The API development environment contains `DATABASE_URL` and `PORT`. The frontend development environment contains `VITE_API_URL`.

## Development

Run the frontend and backend from separate terminals:

```sh
npm run dev --workspace=@dbd-assistant/web
npm run dev --workspace=@dbd-assistant/api
```

The frontend runs on Vite's default port. The API listens on port `3000` by default and exposes `GET /health`.

Create a room from the frontend, then open another browser tab and join with the displayed six-character code. The room owner can assign each player a role and matching character type. Lobby polling keeps both tabs updated until realtime synchronization is added in Step 3.

## Verification

```sh
npm run build
npm run test
npm run lint
npm run prisma:validate --workspace=@dbd-assistant/api
```

The SQLite database will live under `app/api/data/` when runtime persistence is introduced. Configuration synchronization is reserved for a later implementation step.
