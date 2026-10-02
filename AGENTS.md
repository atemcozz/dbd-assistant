# dbd-assistant — Agent Instructions

## 1. Project goal

`dbd-assistant` is a small web application for running a local multiplayer game inspired by Dead by Daylight.

The project is intentionally small.

The current goal is to build a working MVP that proves the core game loop:

1. Create a game room.
2. Join the room.
3. Assign player roles and character types.
4. Select quests.
5. Start the game.
6. Synchronize game state in realtime.
7. Complete quests.
8. Use effects.
9. Let the killer attack survivors.
10. Change health and eliminate survivors at 0 HP.
11. Provide a chat visible only to alive survivors.
12. Reconnect after temporary network loss and restore current state.
13. Persist runtime state in SQLite.
14. Run without Docker and without external infrastructure.

The project is primarily intended for a small private group of players.

Priorities:

1. Simplicity.
2. Correctness of core game rules.
3. Easy debugging during a live game.
4. Easy manual recovery.
5. Fast development.
6. Maintainable code.
7. Performance.

Do not optimize for hypothetical large scale.

---

## 2. Technology stack

Use the following stack unless there is a concrete technical reason not to:

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* Zustand
* React Router
* Socket.IO Client

### Backend

* NestJS
* TypeScript
* Socket.IO
* Prisma

### Database

* SQLite

### Validation

* Prefer Zod for JSON/config validation and shared input schemas where useful.
* Use NestJS/TypeScript validation mechanisms where they are simpler.

### Deployment

* Node.js
* SQLite file
* No Docker required
* No PostgreSQL required
* No Redis required

Use existing libraries when they remove meaningful boilerplate.

Do not add libraries merely because they are popular.

---

## 3. Core architectural rule

The backend is authoritative.

The frontend is a view and input layer.

The client may request an action:

```text
"complete quest"
"attack player"
"apply effect"
"send chat message"
```

The server validates the request, changes state, persists it, and broadcasts the result.

Never trust client-provided:

* role
* game owner
* health
* effect charges
* target permissions
* quest permissions
* game status

Do not implement important game rules only in React.

---

## 4. Keep the architecture simple

Use one NestJS application.

Recommended structure:

```text
apps/
  web/
  api/
```

Backend may be organized into simple feature modules/services:

```text
game
player
quest
effect
chat
config
realtime
```

Do not create layers unless they solve an actual problem.

Do NOT introduce:

* microservices
* CQRS
* Event Sourcing
* DDD aggregates
* custom event buses
* generic repositories
* generic CRUD frameworks
* generic effect engines
* custom ORM layers
* plugin systems
* message brokers
* background job infrastructure

If ordinary code solves a problem clearly, prefer ordinary code.

The project should remain understandable to one developer who may need to fix it during a live game.

---

## 5. Database

Use SQLite through Prisma.

The database is a single file, for example:

```text
data/game.db
```

The application must work without a separate database server.

Conceptual models:

```text
Game
Player
CharacterType
EffectDefinition
PlayerEffect
ActiveEffect
QuestDefinition
GameQuest
ChatMessage
```

A future `GameEvent`/audit table is possible, but it is NOT part of the MVP.

Do not add tables without a concrete requirement.

---

## 6. Static configuration vs runtime state

Static game definitions are stored as readable JSON files in Git.

Example:

```text
config/
  characters/
    survivors.json
    killers.json
  effects.json
  quests.json
```

These definitions are synchronized into SQLite.

Conceptually:

```text
JSON
  ->
validate
  ->
upsert into SQLite
```

Runtime game state lives in SQLite.

The distinction is:

```text
JSON:
"What exists in the game?"

SQLite:
"What is happening in a particular game right now?"
```

---

## 7. Configuration synchronization

Provide a simple command such as:

```text
npm run config:sync
```

It should:

1. Load configuration JSON files.
2. Validate them.
3. Upsert definitions into SQLite.
4. Fail clearly when configuration is invalid.

Validation should happen before making database changes whenever practical.

Use stable IDs in JSON.

Example:

```json
{
  "id": "medic",
  "name": "Medic"
}
```

Do not use database-generated IDs as references from configuration files.

Changing game content should NOT require a Prisma database migration.

Prisma migrations are only for schema changes.

---

## 8. Running games must not change when config changes

A game must use the configuration that existed when it was started/configured.

Editing:

```text
config/effects.json
```

must not silently alter an already running game.

For example, if an effect had:

```text
quantity = 1
```

when the game started, changing the definition to:

```text
quantity = 3
```

must not retroactively change that running game.

Use the simplest practical solution:

* copy relevant values into runtime state, or
* otherwise freeze the values needed by the current game.

Do NOT build a general configuration-versioning framework for the MVP.

---

## 9. Game

A game has approximately:

```text
id
code
name
status
ownerPlayerId
createdAt
startedAt
finishedAt
```

Game states:

```text
LOBBY
RUNNING
FINISHED
```

Do not add `PAUSED` unless explicitly required later.

A game owner can:

* configure the lobby
* assign roles
* assign character types
* select quests
* start the game
* finish the game

The owner can also be a normal player.

Do NOT create an `ADMIN` or `GAME_MASTER` player role.

Ownership is separate from gameplay role:

```text
Player.role = SURVIVOR | KILLER

Game.ownerPlayerId = player ID
```

---

## 10. Player

A player has approximately:

```text
id
gameId
name
role
characterTypeId
health
maxHealth
status
```

Roles:

```text
SURVIVOR
KILLER
```

Initial statuses:

```text
ALIVE
DEAD
DISCONNECTED
```

Do not physically delete dead players during a game.

When a survivor reaches:

```text
health <= 0
```

set:

```text
status = DEAD
```

A dead survivor is no longer an active participant.

Do not invent additional death mechanics.

---

## 11. Character types

Character types are reusable configuration data.

A character type contains approximately:

```text
id
role
name
description
maxHealth
startingEffects
```

Example:

```json
{
  "id": "medic",
  "role": "SURVIVOR",
  "name": "Medic",
  "description": "Can heal allies.",
  "maxHealth": 3,
  "startingEffects": [
    {
      "effectId": "heal",
      "charges": 3
    }
  ]
}
```

Do not create a class hierarchy for characters.

Character types are data, not subclasses.

---

## 12. Effects

An effect is an ability that a player can apply to a target.

An effect definition contains approximately:

```text
id
name
description
action
quantity
duration
cooldown
allowedTargets
```

Initial actions:

```text
HEAL
DAMAGE
ADD_EFFECT
REMOVE_EFFECT
```

Only implement the actions that are actually needed.

Do not implement a generic scripting language or universal rules engine.

Hardcode action semantics in backend code.

Example:

```text
HEAL:
target.health = min(target.maxHealth, target.health + quantity)

DAMAGE:
target.health = max(0, target.health - quantity)
```

---

## 13. Effect charges

The list of effects available to a player is separate from effect definitions.

Conceptually:

```text
PlayerEffect
  playerId
  effectId
  charges
```

Example:

```text
heal      3
poison    1
shield    2
```

Using an effect consumes one charge.

Do not create a separate special-case system for medkits.

Healing is just a `HEAL` effect.

Use:

```text
charges = null
```

for unlimited use only if unlimited effects are actually needed.

---

## 14. Effect targets

Initial target types:

```text
SELF
SURVIVOR
ALL_SURVIVORS
KILLER
```

Examples:

```json
"allowedTargets": ["SELF"]
```

or:

```json
"allowedTargets": ["SURVIVOR", "ALL_SURVIVORS"]
```

The server must validate target permissions.

The frontend may hide impossible targets for convenience, but this is not a security boundary.

---

## 15. Active effects

Effects with a duration may create an active effect record.

Conceptually:

```text
ActiveEffect
  effectId
  sourcePlayerId
  targetPlayerId
  appliedAt
  expiresAt
```

Use timestamps instead of per-effect timers.

Do NOT use one `setTimeout` for every active effect.

Determine whether an effect is active using:

```text
now < expiresAt
```

and whether it has expired using:

```text
now >= expiresAt
```

This makes server restarts recoverable.

Do not build a complex scheduler for the MVP.

---

## 16. Effect application

When a player requests an effect:

The server validates:

1. The game exists.
2. The game is running.
3. The source player belongs to the game.
4. The source player is allowed to act.
5. The source player has the effect.
6. The source player has available charges.
7. The target belongs to the same game.
8. The target matches the effect's allowed target types.
9. Any cooldown/rule required by the effect is satisfied.

Only then apply the effect.

Persist the result before broadcasting the authoritative state.

---

## 17. Quests

Separate reusable quest definitions from game-specific quest instances.

### QuestDefinition

Approximately:

```text
id
name
description
type
radius
settings
```

`settings` may use JSON for quest-specific configuration.

### GameQuest

Approximately:

```text
id
gameId
questDefinitionId
status
completedBy
completedAt
```

Initial quest statuses:

```text
AVAILABLE
COMPLETED
```

Do not create a separate model for exits.

---

## 18. Quest configuration

Example:

```json
{
  "id": "generator",
  "name": "Repair the generator",
  "description": "Find and repair the generator.",
  "type": "LOCATION",
  "radius": 20
}
```

The `radius` field may be stored even if physical location checking is not implemented yet.

Do not implement geolocation/radius validation unless explicitly required.

---

## 19. Quest completion

A player may request completion of a quest.

The server must validate:

* game is running
* player belongs to game
* player is alive when required
* quest exists in the game
* quest is not already completed
* player is allowed to complete it

On success:

```text
GameQuest.status = COMPLETED
```

Then broadcast the result.

For the MVP, quest completion may be a manual button action.

Do not invent complex automatic quest detection.

---

## 20. Killer

The killer may:

* view survivor state
* view completed quests
* attack survivors
* use allowed effects

Basic attack:

```text
target.health -= 1
```

If:

```text
target.health <= 0
```

the survivor becomes:

```text
DEAD
```

The server must verify that the source player is the killer.

Do not add combat systems beyond the explicit requirements.

---

## 21. Exits

Represent exits as quests.

Use:

```text
type = EXIT
```

Different killers may have different exits by selecting different quest definitions.

Do not create a separate exit subsystem unless the rules later require it.

---

## 22. Survivor chat

There is a chat visible only to alive survivors.

Rules:

```text
SURVIVOR + ALIVE
    ->
can send/read survivor chat
```

The server must enforce this.

Do not merely hide the chat through frontend logic.

Use a Socket.IO room such as:

```text
game:{gameId}:survivors
```

Chat messages may be persisted.

For MVP, retaining approximately the latest 50–100 messages is sufficient.

Do not implement:

* reactions
* threads
* attachments
* message editing
* moderation
* complex chat features

---

## 23. Realtime

Use Socket.IO directly.

Rooms:

```text
game:{gameId}
game:{gameId}:survivors
```

Possible events:

```text
game:state
game:started
game:finished

player:state
player:healthChanged
player:disconnected
player:reconnected

quest:completed

effect:applied
effect:removed

chat:message
```

Do not create dozens of events in advance.

Prefer a small number of explicit events.

When practical, use a full `game:state` resynchronization after reconnect rather than attempting sophisticated event replay.

---

## 24. Reconnect

Temporary network failures are expected.

When a client reconnects:

```text
Socket reconnect
    ->
identify session/player
    ->
server loads current state
    ->
server sends authoritative game state
    ->
Zustand updates
    ->
UI recovers
```

The client must NOT assume it received every event while disconnected.

Do not implement offline action queues for the MVP.

When the server cannot be reached, an action is not considered completed.

---

## 25. LAN mode

The application must be runnable on a local network.

Example:

```text
server: 192.168.1.100

players:
http://192.168.1.100:3000
```

The core game must not require Internet access.

Do not make external authentication, push services, analytics, cloud databases, or other third-party services mandatory for the game.

---

## 26. Frontend

Use:

```text
React
TypeScript
Vite
Tailwind CSS
shadcn/ui
Zustand
React Router
Socket.IO Client
```

Use shadcn/ui instead of writing custom UI primitives for:

* buttons
* dialogs
* cards
* inputs
* dropdowns
* tabs
* badges
* toasts
* etc.

Do not build a custom component library.

---

## 27. Frontend state

Use Zustand as the client-side representation of server state.

Potential state:

```text
currentGame
currentPlayer
players
quests
effects
chatMessages
connectionStatus
```

Keep the store simple.

Do not introduce Redux or another state management system.

The server remains the source of truth.

---

## 28. Frontend screens

Initial screens:

```text
Create Game
Join Game
Lobby
Game
```

Optional owner controls may be integrated into the Lobby/Game screens.

Survivor game UI should provide:

* own health
* own effects
* available effect actions
* other survivors
* quests
* completed quests
* survivor chat
* connection status

Killer game UI should provide:

* survivors
* survivor health/status
* killer effects
* attack action
* quests
* connection status

The frontend should show only actions applicable to the current player.

Do not rely on UI hiding for actual permission enforcement.

---

## 29. Authentication and sessions

Do NOT implement external accounts for the MVP.

No:

* Google login
* Discord login
* passwords
* account registration
* OAuth provider

A lightweight game session is sufficient.

Joining a game:

```text
player enters game code
    ->
player enters display name
    ->
server creates/identifies player
    ->
server returns session identifier
    ->
client stores session
```

On reconnect/refresh, the session identifies the player.

Use a standard session/token mechanism or existing small library if it materially reduces boilerplate.

Do not implement custom cryptography.

Do not build a full authentication platform.

---

## 30. Permissions

The permission model is intentionally small.

There are only two concepts:

### Gameplay role

```text
SURVIVOR
KILLER
```

### Ownership

```text
Game.ownerPlayerId
```

Do not introduce role hierarchies or permission matrices unless required.

Server-side permission checks should be explicit and easy to read.

---

## 31. Error handling

Use straightforward application errors.

Useful error codes include:

```text
GAME_NOT_FOUND
GAME_NOT_RUNNING
NOT_GAME_OWNER
PLAYER_NOT_FOUND
PLAYER_DEAD
INVALID_TARGET
EFFECT_NOT_AVAILABLE
NO_EFFECT_CHARGES
EFFECT_ON_COOLDOWN
QUEST_NOT_FOUND
QUEST_ALREADY_COMPLETED
NOT_ALLOWED
```

Do not create a custom error framework.

---

## 32. Logging

Use NestJS logging or another existing lightweight logger.

Useful development logs:

```text
game created
player joined
game started
quest completed
effect applied
attack performed
player died
player reconnected
```

Do not build analytics or telemetry infrastructure.

Do not log secrets or session tokens.

---

## 33. Testing

The MVP does not require comprehensive test coverage.

Write tests for core game rules:

* survivor can be attacked
* attack removes 1 HP
* survivor dies at 0 HP
* dead survivor cannot perform normal actions
* heal cannot exceed maxHealth
* effect requires charges
* effect consumes a charge
* invalid targets are rejected
* survivor-only effects cannot be used on invalid targets
* killer cannot perform survivor-only actions
* completed quest cannot be completed again

Prefer unit tests for backend game logic.

Do not spend excessive time testing trivial UI markup.

---

## 34. Development commands

Provide simple commands such as:

```text
npm run dev
npm run build
npm run test
npm run lint
npm run config:sync
```

Use the package manager already used by the repository.

Do not add build systems or tooling unless required.

---

## 35. Implementation workflow

Work in small vertical slices.

Do NOT implement the entire MVP in one enormous change.

Recommended sequence:

### Step 1 — Scaffold

Create:

* React/Vite frontend
* NestJS backend
* Prisma
* SQLite
* Socket.IO
* Tailwind
* shadcn/ui
* Zustand

Only establish the project and verify it builds.

Do not implement game logic yet.

### Step 2 — Game and players

Implement:

* create game
* game code
* join game
* player session
* lobby
* roles
* character types

Verify multiple browser tabs can join the same game.

### Step 3 — Realtime state

Implement:

* Socket.IO connection
* game room
* authoritative state
* basic state synchronization
* reconnect/resync

### Step 4 — Quests

Implement:

* quest JSON
* config synchronization
* quest selection
* game quests
* quest completion

### Step 5 — Health and attack

Implement:

* HP
* killer attack
* survivor death
* role-specific UI

### Step 6 — Effects

Implement:

* effect definitions
* player effects
* charges
* HEAL
* DAMAGE
* target validation
* cooldown if needed
* simple timed effects

### Step 7 — Chat

Implement:

* survivor-only room
* send/receive
* basic persistence

### Step 8 — Owner controls

Implement:

* role assignment
* character type assignment
* quest selection
* start game
* finish game

### Step 9 — PWA polish

Only after the core game loop works.

---

## 36. Scope control

Do not implement hypothetical future requirements.

When choosing between:

```text
A) simple code that solves the current requirement

B) flexible abstraction for possible future requirements
```

choose A.

Do not introduce a general system because it "might be useful later".

When a requirement is ambiguous but the architecture is not affected, choose the simplest reasonable interpretation and document it briefly.

When ambiguity materially affects the architecture or data model, stop and ask for clarification.

Do not silently invent major game mechanics.

---

## 37. Libraries and dependencies

Prefer existing, well-established libraries when they significantly reduce boilerplate.

Good examples:

```text
Prisma
Socket.IO
Zustand
shadcn/ui
Zod
React Router
```

A new dependency is justified when it removes meaningful handwritten infrastructure.

Do NOT add a dependency for a problem that can be solved with a few obvious lines of code.

Do not create a custom replacement for an established library.

---

## 38. Security and safety of game logic

This is a private game application, not a public banking/security system.

Do not over-engineer security.

However, the server must reliably prevent accidental rule violations:

* survivor cannot perform killer actions
* killer cannot read survivor-only chat
* players cannot affect games they do not belong to
* players cannot spend another player's effect charges
* players cannot assign themselves arbitrary roles
* clients cannot directly set HP
* clients cannot directly mark arbitrary quests completed

Correct server-side validation is more important than elaborate authentication.

---

## 39. Manual recovery requirement

The application must remain easy to repair manually.

A developer should be able to access the server and inspect:

```text
config/*.json
data/game.db
application logs
```

A reasonable recovery workflow may be:

```text
edit JSON
npm run config:sync
restart application
```

or, when necessary, inspect/edit SQLite directly.

Do not make recovery depend on an external service.

Do not hide important game state in:

* process memory only
* Redis
* browser local storage only
* ephemeral timers
* external APIs

Important runtime state belongs in SQLite.

---

## 40. Restart behavior

After a backend restart, the application must recover:

* games
* players
* roles
* character types
* health
* quest state
* effect charges
* active timed effects
* chat history retained by the application

Timed effects must use timestamps such as:

```text
appliedAt
expiresAt
```

not process-local timers.

After restart, the backend should reconstruct the current state from SQLite.

---

## 41. Definition of done for MVP

The MVP is done when all of the following work:

* backend starts without Docker
* frontend starts locally
* SQLite database works
* configuration JSON can be validated and synchronized
* game can be created
* players can join
* player sessions survive refresh/reconnect
* roles can be assigned
* character types can be assigned
* game can start
* game state is synchronized through Socket.IO
* quests are visible
* quests can be completed
* killer can attack survivors
* health is persisted
* survivors die at 0 HP
* effects can be used
* effect charges work
* basic timed effects work
* survivor-only chat works
* reconnect restores authoritative state
* application works over a LAN
* code remains understandable and manually repairable

Visual polish is NOT part of the MVP definition.

---

## 42. Agent operating rules

Before changing code:

1. Read this `AGENTS.md`.
2. Inspect the existing repository.
3. Understand the relevant existing code.
4. Do not recreate existing functionality.
5. Do not make unrelated changes.
6. Do not introduce new architecture unless necessary for the requested task.

When implementing a task:

1. Make the smallest reasonable change.
2. Prefer existing libraries over custom infrastructure.
3. Keep types explicit.
4. Do not weaken TypeScript with unnecessary `any`.
5. Do not silently change game rules.
6. Do not implement future features "while you're here".

After implementing:

1. Run relevant tests.
2. Run type checking/build.
3. Run lint if available.
4. Fix errors caused by the change.
5. Summarize:

   * what changed
   * what was tested
   * any known limitation

Do not claim something works unless it was actually checked.

---

## 43. Instructions for agent prompts

When given a task, first map it to the current architecture and MVP scope.

Good task:

```text
Implement Step 3 from AGENTS.md.
Do not modify unrelated modules.
Do not add new abstractions.
Run tests and build after implementation.
```

Bad task:

```text
Build a scalable realtime architecture for future features.
```

For larger tasks, split them into smaller changes.

Do not generate the entire application in one operation unless explicitly requested.

---

## 44. Final principle

The project is a small game assistant.

The preferred architecture is the one that:

* works
* is easy to understand
* is easy to debug
* is easy to run on a small server
* is easy to run in a LAN
* is easy to modify during a real game
* has minimal infrastructure
* avoids unnecessary abstractions

Choose boring, explicit code over clever code.
