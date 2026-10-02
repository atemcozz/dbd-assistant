# dbd-assistant

A small local multiplayer game assistant inspired by Dead by Daylight.

## Step 1 scaffold

The project currently contains the application foundation and the game lobby slice:

- `app/web`: React, Vite, TypeScript, Tailwind CSS, shadcn/ui metadata, Zustand, and Socket.IO Client dependencies.
- `app/api`: NestJS, Prisma, SQLite, and Socket.IO server dependencies with a `/health` endpoint, game creation/joining, persisted player sessions, lobby state, roles, and character assignments.

Gameplay rules are intentionally still small. The owner can start a running game from the lobby; the game screen now includes role-specific players, HP, a remaining-time timer, quests, attack controls, damage/death handling, and placeholders for chat/effects. The lobby uses authenticated Socket.IO state synchronization and reconnect resync. Quest definitions live in `config/quests.json`; owners select and number them in the lobby's separate Quests tab.

## Setup

Requirements: Node.js 20 or newer and npm.

```sh
npm install
cp app/api/.env.example app/api/.env
cp app/web/.env.example app/web/.env
npm run prisma:generate --workspace=@dbd-assistant/api
npm run prisma:validate --workspace=@dbd-assistant/api
npm run db:push --workspace=@dbd-assistant/api
```

The API development environment contains `DATABASE_URL` and `PORT`. The frontend development environment contains `VITE_API_URL`.

The API development command synchronizes the SQLite schema before starting NestJS, so existing development databases receive new tables such as quests automatically.

## Development

Run the frontend and backend from separate terminals:

```sh
npm run dev --workspace=@dbd-assistant/web
npm run dev --workspace=@dbd-assistant/api
```

The frontend runs on Vite's default port. The API listens on port `3000` by default and exposes `GET /health`.

Create a room from the frontend, then open another browser tab and join with the displayed six-character code. The room owner can assign each player a role and matching character type. Both tabs receive authoritative lobby state over Socket.IO, including after a temporary reconnect.

Quest definitions are reusable JSON configuration. The owner selects survivor objectives in the Quests tab; selected quests receive stable numbers shown as high-contrast physical marker cards. In the lobby, only the owner and killers can see selected quests. Survivors receive them after the game starts, and only survivors can complete them.

## Verification

```sh
npm run build
npm run test
npm run lint
npm run prisma:validate --workspace=@dbd-assistant/api
```

The SQLite database will live under `app/api/data/` when runtime persistence is introduced. Configuration synchronization is reserved for a later implementation step.
