import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common'
import { PlayerRole } from '@prisma/client'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'
import { CharactersService } from './characters.service'

@Controller()
export class CharactersController {
  constructor(
    private readonly charactersService: CharactersService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Get('character-types')
  list(@Query('role') role?: PlayerRole) {
    return this.charactersService.list(role)
  }

  @Patch('games/:code/players/:playerId/role')
  async assignRole(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('role') role: PlayerRole,
  ) {
    const game = await this.charactersService.assignRole(
      code,
      playerId,
      sessionToken,
      role,
    )

    const state = await this.gamesService.getState(
      game.code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(game.id)

    return state
  }

  @Patch('games/:code/players/:playerId/character')
  async assignCharacter(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('characterTypeId') characterTypeId: string,
  ) {
    const game = await this.charactersService.assignCharacter(
      code,
      playerId,
      sessionToken,
      characterTypeId,
    )

    const state = await this.gamesService.getState(
      game.code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(game.id)

    return state
  }

  @Post('games/:code/roll-survivors')
  async rollSurvivors(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const game = await this.charactersService.rollSurvivors(
      code,
      sessionToken,
    )

    const state = await this.gamesService.getState(
      game.code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(game.id)

    return state
  }
}