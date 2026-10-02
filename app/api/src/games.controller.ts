import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
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