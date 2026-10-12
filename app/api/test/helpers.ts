import { PlayerRole } from '@prisma/client'
import type { TestContext } from './setup'

// Helper: create a game with an owner (survivor) and return session info.
export async function createGameWithOwner(ctx: TestContext) {
  const result = await ctx.gamesService.createGame('Test Game', 'Owner')
  return result
}

// Helper: join a second player as survivor.
export async function joinSurvivor(ctx: TestContext, code: string, name: string) {
  return ctx.gamesService.joinGame(code, name)
}

// Helper: create a lobby-ready game with owner + survivor and characters assigned.
// Does NOT start the game — quest/exit selection must happen in LOBBY status.
// Selects one exit (startGame requires at least one) and sets requiredQuestPoints
// to 1 so exits stay locked (0 completed points < 1) while still allowing
// startGame with any selected quest. Point-system tests override this value.
export async function setupLobbyGame(ctx: TestContext) {
  const owner = await createGameWithOwner(ctx)
  const survivor = await joinSurvivor(ctx, owner.state.code, 'Survivor')

  // Keep exits locked but don't gate startGame on expensive quest selection.
  await ctx.gamesService.updateSettings(
    owner.state.code,
    owner.sessionToken,
    3600,
    1,
  )

  // At least one exit is required to start the game.
  await ctx.exitsService.select(
    owner.state.code,
    owner.sessionToken,
    ['main-gate'],
  )

  await ctx.charactersService.assignRole(
    owner.state.code,
    owner.playerId,
    owner.sessionToken,
    PlayerRole.SURVIVOR,
  )
  await ctx.charactersService.assignCharacter(
    owner.state.code,
    owner.playerId,
    owner.sessionToken,
    'medic',
  )

  await ctx.charactersService.assignRole(
    owner.state.code,
    survivor.playerId,
    owner.sessionToken,
    PlayerRole.KILLER,
  )
  await ctx.charactersService.assignCharacter(
    owner.state.code,
    survivor.playerId,
    owner.sessionToken,
    'stalker',
  )

  return { owner, survivor }
}

// Helper: start a game after assigning characters to all players.
// Sets requiredQuestPoints to 0 — combat/effects tests don't select quests
// and don't care about the exits gate.
export async function setupRunningGame(ctx: TestContext) {
  const { owner, survivor } = await setupLobbyGame(ctx)
  await ctx.gamesService.updateSettings(
    owner.state.code,
    owner.sessionToken,
    3600,
    0,
  )
  await ctx.gamesService.startGame(owner.state.code, owner.sessionToken)
  return { owner, survivor }
}
