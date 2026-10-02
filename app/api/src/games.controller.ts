import { Body, Controller, Get, Headers, Param, Patch, Post, Put, Query } from '@nestjs/common'
import { PlayerRole } from '@prisma/client'
import { GamesService } from './games.service'
import { GameGateway } from './game.gateway'

@Controller()
export class GamesController {
  constructor(private readonly gamesService: GamesService, private readonly gameGateway: GameGateway) {}

  @Get('character-types')
  characterTypes(@Query('role') role?: PlayerRole) {
    return this.gamesService.listCharacterTypes(role)
  }

  @Get('quest-definitions')
  questDefinitions() {
    return this.gamesService.listQuestDefinitions()
  }

  @Post('games')
  async createGame(@Body() body: Record<string, unknown>) {
    const result = await this.gamesService.createGame(body)
    await this.gameGateway.broadcastGameState(result.state.id)
    return result
  }

  @Post('games/join')
  async joinGame(@Body() body: Record<string, unknown>) {
    const result = await this.gamesService.joinGame(body)
    await this.gameGateway.broadcastGameState(result.state.id)
    return result
  }

  @Get('games/:code')
  state(@Param('code') code: string, @Headers('x-session-token') sessionToken?: string) {
    return this.gamesService.getState(code, sessionToken)
  }

  @Put('games/:code/quests')
  async selectQuests(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
    @Body() body: Record<string, unknown>,
  ) {
    const state = await this.gamesService.selectQuests(code, sessionToken, body)
    await this.gameGateway.broadcastGameState(state.id)
    return state
  }

  @Post('games/:code/quests/:questId/complete')
  async completeQuest(
    @Param('code') code: string,
    @Param('questId') questId: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const state = await this.gamesService.completeQuest(code, questId, sessionToken)
    await this.gameGateway.broadcastGameState(state.id)
    return state
  }

  @Patch('games/:code/players/:playerId/role')
  async assignRole(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('role') role: unknown,
  ): Promise<unknown> {
    const state = await this.gamesService.assignRole(code, playerId, sessionToken, role)
    await this.gameGateway.broadcastGameState(state.id)
    return state
  }

  @Patch('games/:code/players/:playerId/character')
  async assignCharacter(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('characterTypeId') characterTypeId: unknown,
  ): Promise<unknown> {
    const state = await this.gamesService.assignCharacter(code, playerId, sessionToken, characterTypeId)
    await this.gameGateway.broadcastGameState(state.id)
    return state
  }
}