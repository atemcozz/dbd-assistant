# dbd-assistant

A small local multiplayer game assistant inspired by Dead by Daylight.

## Step 1 scaffold

The project currently contains the application foundation only:

- `app/web`: React, Vite, TypeScript, Tailwind CSS, shadcn/ui metadata, Zustand, and Socket.IO Client dependencies.
- `app/api`: NestJS, Prisma, SQLite, and Socket.IO server dependencies with a `/health` endpoint.

Game rules and gameplay features are intentionally not implemented yet.

## Setup

Requirements: Node.js 20 or newer and npm.

```sh
npm install
cp app/api/.env.example app/api/.env
npm run prisma:generate --workspace=@dbd-assistant/api
```

## Development

Run the frontend and backend from separate terminals:

```sh
npm run dev --workspace=@dbd-assistant/web
npm run dev --workspace=@dbd-assistant/api
```

The frontend runs on Vite's default port. The API listens on port `3000` by default and exposes `GET /health`.

## Verification

```sh
npm run build
npm run test
npm run lint
npm run prisma:validate --workspace=@dbd-assistant/api
```

The SQLite database will live under `app/api/data/` when runtime persistence is introduced. Configuration synchronization is reserved for a later implementation step.
