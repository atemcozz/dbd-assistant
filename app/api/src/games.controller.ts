import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from '@nestjs/common'
import { PlayerRole } from '@prisma/client'
import { GamesService } from './games.service'

@Controller()
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Get('character-types')
  characterTypes(@Query('role') role?: PlayerRole) {
    return this.gamesService.listCharacterTypes(role)
  }

  @Post('games')
  createGame(@Body() body: Record<string, unknown>) {
    return this.gamesService.createGame(body)
  }

  @Post('games/join')
  joinGame(@Body() body: Record<string, unknown>) {
    return this.gamesService.joinGame(body)
  }

  @Get('games/:code')
  state(@Param('code') code: string, @Headers('x-session-token') sessionToken?: string) {
    return this.gamesService.getState(code, sessionToken)
  }

  @Patch('games/:code/players/:playerId/role')
  assignRole(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('role') role: unknown,
  ) {
    return this.gamesService.assignRole(code, playerId, sessionToken, role)
  }

  @Patch('games/:code/players/:playerId/character')
  assignCharacter(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('characterTypeId') characterTypeId: unknown,
  ) {
    return this.gamesService.assignCharacter(code, playerId, sessionToken, characterTypeId)
  }
}