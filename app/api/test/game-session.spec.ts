import { PrismaService } from '../src/prisma.service'
import { GamesService } from '../src/games.service'
import { CharactersService } from '../src/characters.service'
import { PlayerRole, GameStatus } from '@prisma/client'
import {
  clearRuntimeData,
  closeTestContext,
  createTestContext,
  seedTestData,
} from './setup'
import type { TestContext } from './setup'
import { createGameWithOwner, joinSurvivor } from './helpers'

describe('Game session', () => {
  let ctx: TestContext
  let prisma: PrismaService
  let gamesService: GamesService
  let charactersService: CharactersService

  beforeAll(async () => {
    ctx = await createTestContext()
    prisma = ctx.prisma
    gamesService = ctx.gamesService
    charactersService = ctx.charactersService

    await seedTestData(prisma)
  })

  afterAll(async () => {
    await closeTestContext(ctx)
  })

  beforeEach(async () => {
    await clearRuntimeData(prisma)
  })

  it('create returns sessionToken, playerId, and state', async () => {
    const result = await gamesService.createGame('Test', 'Player1')
    expect(result.sessionToken).toBeTruthy()
    expect(result.playerId).toBeTruthy()
    expect(result.state.code).toBeTruthy()
    expect(result.state.status).toBe(GameStatus.LOBBY)
  })

  it('create auto-selects all exits', async () => {
    const result = await gamesService.createGame('Test', 'Player1')
    expect(
      result.state.exits.map((exit) => exit.definition.id),
    ).toEqual(['main-gate', 'side-door'])
  })

  it('join returns sessionToken, playerId, and state', async () => {
    const owner = await createGameWithOwner(ctx)
    const joiner = await joinSurvivor(ctx, owner.state.code, 'Player2')
    expect(joiner.sessionToken).toBeTruthy()
    expect(joiner.playerId).toBeTruthy()
    expect(joiner.state.code).toBe(owner.state.code)
  })

  it('join auto-assigns a random free survivor character', async () => {
    const owner = await createGameWithOwner(ctx)
    const first = await joinSurvivor(ctx, owner.state.code, 'First')
    const second = await joinSurvivor(ctx, owner.state.code, 'Second')

    // Test DB has two survivor types (medic, scout-test).
    const firstPlayer = first.state.players.find((p) => p.id === first.playerId)!
    const secondPlayer = second.state.players.find((p) => p.id === second.playerId)!

    expect(firstPlayer.role).toBe(PlayerRole.SURVIVOR)
    expect(firstPlayer.characterTypeId).not.toBeNull()
    expect(firstPlayer.health).not.toBeNull()

    // Second joiner gets the other free type — no repeats while supply lasts.
    expect(secondPlayer.characterTypeId).not.toBeNull()
    expect(secondPlayer.characterTypeId).not.toBe(firstPlayer.characterTypeId)

    // Owner is untouched.
    const me = first.state.players.find((p) => p.id === owner.playerId)!
    expect(me.characterTypeId).toBeNull()
  })

  it('join repeats a character when every survivor type is taken', async () => {
    const owner = await createGameWithOwner(ctx)
    await joinSurvivor(ctx, owner.state.code, 'First')
    await joinSurvivor(ctx, owner.state.code, 'Second')

    // Only two survivor types exist — the third joiner must repeat one.
    const third = await joinSurvivor(ctx, owner.state.code, 'Third')
    const thirdPlayer = third.state.players.find((p) => p.id === third.playerId)!
    expect(thirdPlayer.role).toBe(PlayerRole.SURVIVOR)
    expect(thirdPlayer.characterTypeId).not.toBeNull()
  })

  it('game requires all players to have characters before starting', async () => {
    const owner = await createGameWithOwner(ctx)
    // Second player joins (auto-assigned a character on join)...
    const player2 = await joinSurvivor(ctx, owner.state.code, 'Player2')

    // Assign owner a character but not the other player.
    await charactersService.assignRole(
      owner.state.code,
      owner.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )
    await charactersService.assignCharacter(
      owner.state.code,
      owner.playerId,
      owner.sessionToken,
      'medic',
    )

    // ...then the auto-assigned character is cleared to simulate
    // an unassigned player (assignRole wipes character and abilities).
    await charactersService.assignRole(
      owner.state.code,
      player2.playerId,
      owner.sessionToken,
      PlayerRole.SURVIVOR,
    )

    // Starting should fail — the other player has no character.
    await expect(
      gamesService.startGame(owner.state.code, owner.sessionToken),
    ).rejects.toThrow('ALL_PLAYERS_NEED_CHARACTER')
  })
})
