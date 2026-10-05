# AGENTS.md

## Project

This is a small web service for assisting a real-life friendly game inspired by Dead by Daylight.

The project is called `dbd-assistant`.

The goal is to support the physical game, not to replace it with a complex digital simulation.

Prefer pragmatic architecture, fast iteration, understandable code, and easy manual recovery over scalability or abstraction for hypothetical future requirements.

This is a small game assistant, not a platform.

Prefer boring, explicit, understandable code over clever code.

Prefer a library that removes meaningful boilerplate over handwritten infrastructure.

Prefer a simple working implementation now over an abstraction for hypothetical future requirements.

## Real-world game context

The game takes place in a relatively small physical location with several floors, for example an old boarding house, recreation building, or an airsoft location.

Players physically move around the building. The website is an assistant for game state, information, quests, abilities, health, and communication.

Physical props are cheap and simple. They may be purchased from ordinary marketplaces with a limited budget. Examples include printed numbers, cards, signs, locks, colored objects, simple containers, keys, paper notes, and other inexpensive props.

Some quests may require a physical object or marker to be placed in the location. For example, a printed number `5` may be physically placed in a room. A player finds it in the real world, opens quest `5` on the website, and sees the relevant instructions or content.

The physical game may include mechanics that are currently outside the application. For example, after an attack or another condition, a killer may escort a player to a physical "cage" or holding area for a period of time. Do not add such mechanics to the application unless explicitly requested later.

The website should remain a lightweight support tool. Do not assume that every physical action must be represented digitally.

### Important design principle

Interactions with the website should not require players to stare at their phones constantly.

Good interactions are short and deliberate:

* inspect a quest after finding something in the building;
* activate an ability at an appropriate moment;
* check health/status;
* receive an instruction;
* send an occasional survivor chat message.

Avoid mechanics where several players are simultaneously expected to chase each other through a UI, repeatedly refresh lists, spam buttons, or continuously track each other on their phones.

Physical gameplay should remain the main activity.

## Game content examples

Examples are provided to communicate the intended style, not to define mandatory MVP mechanics.

Suitable survivor roles might be simple archetypes such as:

* Medic: can restore a small amount of health.
* Scout: has an ability related to finding or revealing information.
* Technician: can interact with certain quest/object types.
* Runner: has a temporary movement-related advantage.

Suitable killer types might be simple physical-game archetypes such as:

* Stalker: focuses on pressure and forcing survivors to relocate.
* Warden: focuses on control of areas or temporary restrictions.
* Hunter: focuses on direct attacks and short-term debuffs.

Suitable quests are generally based on exploration, observation, simple puzzles, physical objects, or visiting locations.

Examples:

* Find a marked number somewhere in the building and open the corresponding quest on the website.
* Find three symbols and enter their order.
* Locate a key hidden in a designated area.
* Visit a room and confirm that a physical object is present.
* Find several numbered markers and determine the correct sequence.
* Bring information from one physical location to another.
* Complete a simple timed or observation-based objective.

Avoid designing quests that require expensive props, specialized electronics, complex sensors, constant GPS tracking, or mechanics that would not be practical in a small real-world building.

Suitable killer abilities are short, understandable effects that fit physical gameplay.

Examples:

* temporarily reduce survivors' movement speed;
* briefly stun or disable survivors;
* force a survivor to go to a particular room;
* apply a temporary restriction to a group of survivors;
* deal damage to a selected survivor;
* activate a simple area or target effect.

These examples are thematic guidance, not a requirement to expand the MVP action system immediately.

Do not create a new generic effect engine just because a future ability might need a new mechanic. Prefer the existing small set of explicit server-side actions. Add a new action only when an actual game mechanic requires it.

## Architecture

### Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* shadcn/ui
* Zustand
* React Router
* Socket.IO client

### Backend

* NestJS
* TypeScript
* Socket.IO via NestJS Gateway
* Prisma
* SQLite

### Database

Use SQLite.

The application should run directly with Node.js and SQLite in production. Docker is not required.

The database file should live somewhere such as:

```text
data/game.db
```

SQLite is intentionally preferred because:

* it is a single file;
* there is no separate database server;
* memory usage is low;
* backup and restore are trivial;
* manual inspection and repair are easy;
* the expected number of players and writes is small.

Do not introduce Redis, Kafka, PostgreSQL, MongoDB, Kubernetes, microservices, or other infrastructure unless a concrete requirement appears.

## Static configuration vs runtime state

Reusable game definitions should live in readable JSON files under version control.

Suggested structure:

```text
config/
  characters/
    survivors.json
    killers.json
  abilities.json
  buffs.json
  quests.json
```

JSON is the source of truth for reusable game content.

SQLite is the source of truth for runtime game state.

Use stable IDs in JSON.

A command such as:

```text
npm run config:sync
```

should validate configuration and upsert definitions into SQLite.

Changing quests, abilities, buffs, or character definitions should not require a Prisma migration.

Prisma migrations are for database schema changes.

A running game must not silently change because somebody edited JSON files. Once a game starts or its configuration is finalized, relevant values must be frozen/copied into runtime state so that the game continues using the configuration with which it started.

Do not build a general configuration snapshot/versioning framework for the MVP.

## Game model

`Game` should roughly contain:

* `id`
* `code`
* `name`
* `status` (`LOBBY`, `RUNNING`, `FINISHED`)
* `ownerPlayerId`
* `createdAt`
* `startedAt`
* `finishedAt`

The game owner is separate from the gameplay role.

Do not create an `ADMIN` or `GAME_MASTER` gameplay role.

The owner may also be a normal survivor or killer.

## Player

A player should roughly contain:

* `id`
* `gameId`
* `name`
* `role`
* `characterTypeId`
* `health`
* `maxHealth`
* `status`

Roles:

* `SURVIVOR`
* `KILLER`

Statuses:

* `ALIVE`
* `DEAD`
* `DISCONNECTED`

Dead players are not deleted.

When health reaches `0`, the player becomes `DEAD`.

A dead survivor no longer participates in normal survivor actions.

## Character types

Character types are reusable data/configuration, not class hierarchies.

A character type roughly contains:

* `id`
* `role`
* `name`
* `description`
* `maxHealth`
* `abilities`
* `startingBuffs`

Example:

```json
{
  "id": "medic",
  "role": "SURVIVOR",
  "name": "Medic",
  "description": "Can heal allies.",
  "maxHealth": 3,
  "abilities": [
    { "abilityId": "field-dressing", "count": 3 }
  ],
  "startingBuffs": [
    { "buffId": "free-run", "duration": null }
  ]
}
```

Do not create inheritance trees such as `Medic extends Survivor`.

Character behavior should mostly be expressed through data and the existing explicit game actions.

## Quests

Separate reusable `QuestDefinition` from game-specific `GameQuest`.

`QuestDefinition` roughly contains:

* `id`
* `name`
* `description`
* `type`
* `radius`
* `settings`
* optional killer-category information

`GameQuest` roughly contains:

* `id`
* `gameId`
* `questDefinitionId`
* `status`
* `completedBy`
* `completedAt`

Initial quest status:

* `AVAILABLE`
* `COMPLETED`

Before a game starts, the owner selects/configures quests.

After the game starts, the selected quests become part of the game state.

### Killer-specific quests

A quest may optionally be associated with a specific killer character type.

The intended behavior is:

* if a quest specifies a killer type, it is relevant to that killer type;
* if a quest does not specify a killer type, it is a universal quest;
* a killer should normally see only quests for their own killer type plus universal quests;
* the server should apply this filtering as part of the actual game data/API behavior, not merely hide irrelevant quests in the frontend.

The exact field can stay simple. For example, a nullable `killerCharacterTypeId` is sufficient for the initial implementation.

Do not build a complex category/tag/filter framework just for this.

This feature exists primarily to keep the killer's quest list manageable and prevent unrelated killer mechanics from cluttering their UI.

For example:

```text
Quest A -> killerCharacterTypeId = "warden"
Quest B -> killerCharacterTypeId = "stalker"
Quest C -> killerCharacterTypeId = null
```

A `warden` sees A + C.

A `stalker` sees B + C.

A killer should not have to mentally filter dozens of mechanics that belong to other killer types.

Quest visibility in the lobby is role-sensitive:

* the room owner may configure and view quest definitions and selected quests;
* killers may view selected quests in the lobby;
* ordinary survivors must not receive quest definitions or selected quest data until the game is running.

After the game starts, selected quests are visible to all players. Killer-specific and universal quests should be presented as separate UI categories, with killer-specific quests first and universal quests second. A killer-specific category is for organization and visibility, not completion permission: only alive survivors may complete quests.

### Quest completion

For MVP, quest completion may be a manual button.

The server must validate:

* game is running;
* player belongs to the game;
* player is allowed to complete the quest;
* player is alive if the quest requires an active player;
* quest exists in this game;
* quest is not already completed;
* any relevant killer-specific or role-specific restrictions are satisfied.

No automatic geolocation/radius validation is required for MVP.

A radius field may exist for future mechanics.

Exits can simply be quests with:

```text
type = EXIT
```

Do not create a separate Exit subsystem.

## Abilities and buffs

The system is split into two concepts:

* an **ability** is an activatable action a player owns (button, cooldown, targets);
* a **buff** is a state applied to a character (what happens to the target).

An ability inflicts one or more buffs when used. Buffs can also exist without
an ability (permanent starting buffs, and later possibly manually applied
buffs).

A character's entry in `abilities` may optionally include `count` — the
number of times the player may use that ability (integer >= 1). If `count`
is absent, the ability has unlimited uses. The optional count works for
survivors and killers alike.

Ability definitions roughly contain:

* `id`
* `name`
* `description`
* `cooldown`
* `allowedTargets`
* `buffs` — list of `{ buffId, duration }`

Buff definitions roughly contain:

* `id`
* `name`
* `description`
* `action`
* `params` — free-form JSON object
* `defaultDuration`

Buff action enum:

* `HEAL` — instantly restores HP; strength comes from `params.quantity`
* `HURT` — instantly removes HP; strength comes from `params.quantity`
* `INFO` — a physical-game instruction applied to the target as a timed
  (or permanent) buff row

`params` is arbitrary JSON interpreted individually by server code per
action. `HEAL`/`HURT` read `quantity` from it; a future action can carry
its own params without schema changes. Do not describe params in the DB
schema — a plain string column is enough.

Duration resolution: `applied duration = ability.buffs[].duration ?? buff.defaultDuration`.
Either null means the buff is permanent. Permanent-ness is a property of
the buff — an ability can override the length, not force permanence.

Do not create a generic scripting engine.

Buff semantics should remain explicit in server code.

Example ability:

```json
{
  "id": "field-dressing",
  "name": "Перевязка",
  "description": "Выбери себя или другого выжившего и восстанови 1 HP.",
  "cooldown": 30,
  "allowedTargets": ["SELF", "SURVIVOR"],
  "buffs": [{ "buffId": "field-dressing", "duration": null }]
}
```

Example buff:

```json
{
  "id": "field-dressing",
  "name": "Перевязка",
  "description": "Тебе оказывают первую помощь. Ты восстанавливаешь 1 HP.",
  "action": "HEAL",
  "params": { "quantity": 1 },
  "defaultDuration": null
}
```

Healing is a `HEAL` buff. Do not create a separate medkit subsystem.

Runtime rows are copied from the kit on character assignment:

```text
PlayerAbility(playerId, abilityId, chargesRemaining, lastUsedAt)
ActiveBuff(buffId, sourcePlayerId, targetPlayerId, appliedAt, expiresAt)
```

`chargesRemaining = null` means unlimited uses; a non-null value is
decremented on every use and reaches 0 when the ability is exhausted.
`expiresAt = null` means the buff is permanent (starting buffs).

Initial target types:

* `SELF`
* `SURVIVOR`
* `ALL_SURVIVORS`
* `KILLER`

The server must validate target permissions.

Frontend visibility is only a usability feature, not authorization.

### Ability usage

When an ability is used, the server should validate:

* source player has the ability;
* source has charges remaining (when the ability is limited);
* target is valid;
* game state allows the action;
* source role/character allows the action;
* cooldown has expired if applicable.

Then it applies every inflicted buff to every resolved target:
`HEAL`/`HURT` update health instantly (clamped to `[0, maxHealth]`, 0 → DEAD),
`INFO` creates an `ActiveBuff` row.

Persist the result before broadcasting the resulting realtime event.

### Timed buffs

Do not use one `setTimeout` per active buff.

Use timestamps.

An active timed buff can roughly contain:

* `buffId`
* `sourcePlayerId`
* `targetPlayerId`
* `appliedAt`
* `expiresAt`

A buff is active while:

```text
expiresAt IS NULL OR now < expiresAt
```

Cleanup can be lazy or periodic.

Do not build a complex scheduler.

For MVP, buffs should usually represent a short, clear game-state change rather than requiring players to constantly interact with the app.

## Physical-game-first interaction principle

When designing new quests, abilities, or buffs, prefer mechanics that can be resolved primarily through real-world movement and observation.

Good:

* "Go to room 3."
* "Find the red card."
* "Read the number on the physical marker."
* "After discovering the object, unlock quest 5 on the website."
* "The killer activates a temporary area restriction."
* "A survivor receives an instruction and physically goes somewhere."

Avoid:

* continuous phone tracking;
* constant GPS polling;
* real-time player chasing through the UI;
* repeatedly searching a player list under pressure;
* simultaneous button-spamming between multiple participants;
* mechanics that require everyone to keep the website open every second.

The website should answer "what is my current state and what should I do next?" rather than become the main game itself.

## Killer

A killer can:

* view relevant survivors;
* see survivor health/status as allowed by the game;
* see their own buffs;
* attack survivors;
* use allowed abilities;
* see quests relevant to their killer type plus universal quests.

Attack removes `1 HP`.

When health reaches `0`, the survivor becomes `DEAD`.

The server must validate that the source is actually a killer.

Physical mechanics such as escorting a survivor to a cage are currently outside the application.

## Survivor chat

There is one survivor-only chat.

Only alive survivors can send and read survivor chat messages.

The server must enforce this.

Do not rely on the frontend merely hiding chat from killers.

A Socket.IO room may be:

```text
game:${gameId}:survivors
```

Chat messages may be persisted in SQLite.

Keeping only the latest 50–100 messages is sufficient for MVP.

Do not add reactions, threads, attachments, moderation, or other chat platform features.

## Realtime

Use Socket.IO directly through NestJS.

Do not create a custom realtime abstraction.

Useful rooms:

```text
game:${gameId}
game:${gameId}:survivors
```

Keep the event set small.

Possible events:

* `game:state`
* `game:started`
* `game:finished`
* `player:state`
* `player:healthChanged`
* `player:disconnected`
* `player:reconnected`
* `quest:completed`
* `buff:applied`
* `buff:removed`
* `chat:message`

The server is authoritative.

After reconnect, the client should identify the player/session, load the current authoritative state, and receive `game:state`.

The client should then update Zustand from that state.

Do not rely on replaying missed events.

Do not implement an offline action queue for MVP.

If the server is unreachable, an action is not considered completed.

The UI should remain open and display the last known state while showing that the connection is unavailable.

## Authentication/session

Do not build OAuth, Google login, Discord login, password accounts, or a full identity system for MVP.

Joining a game should involve:

* game code;
* display name.

The server creates or identifies the player and returns a lightweight session identifier/token.

The client stores it so that refresh/reconnect can restore the same player.

Use an established lightweight session/token library when it materially reduces boilerplate.

Do not hand-write cryptographic/session infrastructure.

Full authentication can be added later if the project actually needs it.

## Frontend screens

Main screens:

* Create Game
* Join Game
* Lobby
* Game

Owner controls may be integrated into the lobby/game rather than creating a separate admin system.

### Survivor game UI

Should contain roughly:

* own HP;
* own buffs;
* other survivors;
* quests;
* completed quests;
* survivor chat;
* connection status.

### Killer game UI

Should contain roughly:

* survivors;
* HP/status;
* own buffs;
* attack controls;
* relevant quests;
* connection status.

Only appropriate actions should be visible in the UI, while the server independently enforces permissions.

## Testing

Do not aim for exhaustive testing.

Focus on backend game logic.

Important tests include:

* survivor can be attacked;
* attack removes 1 HP;
* death occurs at 0 HP;
* dead survivor cannot perform normal actions;
* heal cannot exceed maxHealth;
* invalid target is rejected;
* an ability applies all of its buffs;
* permanent starting buff is listed (expiresAt null);
* limited ability count is consumed and rejected when exhausted;
* killer cannot perform survivor-only actions;
* completed quest cannot be completed twice;
* killer-specific quest visibility/filtering works;
* universal quests are visible to all relevant killers.

Do not spend large amounts of time testing trivial UI rendering.

## Manual recovery

Manual recovery is an important project requirement.

A developer should be able to inspect and repair:

* `config/*.json`
* `data/game.db`
* logs

Example recovery workflow:

```text
edit JSON
npm run config:sync
restart app
```

SQLite should remain inspectable/editable manually when necessary.

Important runtime state must not exist only in:

* process memory;
* Redis;
* browser storage;
* ephemeral timers;
* external APIs.

Persist anything that must survive a server restart.

## Development commands

Use commands such as:

```text
npm run dev
npm run build
npm run test
npm run lint
npm run config:sync
```

Use the existing package manager.

If starting from scratch, npm is fine unless there is a concrete reason to use something else.

## Agent behavior

Read `AGENTS.md` first.

Inspect the existing repository before modifying anything.

Work in small vertical slices rather than implementing the entire application in one giant change.

Make the smallest reasonable change.

Run tests/build/typecheck/lint after changes when applicable.

Summarize changed files, checks run, and remaining issues.

Never claim something works unless it was actually checked.

Do not use `any` unless justified.

Do not modify unrelated areas.

Do not silently invent major game mechanics.

When ambiguity materially affects architecture or the data model, ask before making a large architectural decision.

Otherwise choose the simplest reasonable interpretation and move forward.

Do not add dependencies unless they materially simplify implementation.

Prefer existing libraries over handwritten infrastructure.

Avoid "enterprise" architecture.

When creating examples for characters, quests, abilities, and buffs, keep them consistent with the small physical venue, cheap props, limited budget, and physical-game-first interaction model described above.

Do not automatically turn every example into a new system or database abstraction.

## Implementation sequence

### Step 1 — Scaffold

* React/Vite
* NestJS
* Prisma
* SQLite
* Socket.IO
* Tailwind
* shadcn/ui
* Zustand
* verify builds
* no game logic yet

### Step 2 — Game and players

* create game
* game code
* join
* session
* lobby
* roles
* character types

### Step 3 — Realtime

* Socket.IO
* room
* authoritative state
* reconnect/resync

### Step 4 — Quests

* JSON
* config sync
* role-aware quest visibility
* killer-specific and universal quest grouping
* quest selection
* game quests
* completion

### Step 5 — Health/attack

* HP
* killer attack
* death
* role-specific UI

### Step 6 — Abilities and buffs

* ability/buff definitions in JSON
* player abilities
* HEAL/HURT/INFO actions
* targets
* cooldown
* timed buffs
* starting buffs

### Step 7 — Chat

* survivor room
* send/receive
* basic persistence

### Step 8 — Owner controls

* role/type assignment
* quest selection
* start/finish

### Step 9 — PWA polish

* only after the core game loop works

## MVP done when

* backend starts without Docker;
* frontend starts;
* SQLite works;
* config JSON validates/syncs;
* game create/join works;
* player session survives refresh/reconnect;
* roles and character types can be assigned;
* game starts;
* Socket.IO synchronizes state;
* quests are visible and completable;
* killer-specific quests are filtered correctly;
* killer attack works;
* health persists;
* death occurs at 0 HP;
* abilities work and apply their buffs;
* cooldowns work;
* limited ability counts work;
* starting buffs apply to characters;
* survivor chat works;
* reconnect restores state;
* LAN works;
* code remains understandable and manually repairable.# dbd-assistant — Agent Instructions## 1. Project goal`dbd-assistant` is a small web application for running a local multiplayer game inspired by Dead by Daylight.The project is intentionally small.The current goal is to build a working MVP that proves the core game loop:1. Create a game room.2. Join the room.3. Assign player roles and character types.4. Select quests.5. Start the game.6. Synchronize game state in realtime.7. Complete quests.8. Use abilities.9. Let the killer attack survivors.10. Change health and eliminate survivors at 0 HP.11. Provide a chat visible only to alive survivors.12. Reconnect after temporary network loss and restore current state.13. Persist runtime state in SQLite.14. Run without Docker and without external infrastructure.The project is primarily intended for a small private group of players.Priorities:1. Simplicity.2. Correctness of core game rules.3. Easy debugging during a live game.4. Easy manual recovery.5. Fast development.6. Maintainable code.7. Performance.Do not optimize for hypothetical large scale.---## 2. Technology stackUse the following stack unless there is a concrete technical reason not to:### Frontend* React* TypeScri
