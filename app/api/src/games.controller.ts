import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'

@Controller()
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Post('games')
  async create(
    @Body('name') name: string,
    @Body('playerName') playerName: string,
  ) {
    const result = await this.gamesService.createGame(
      name,
      playerName,
    )

    // Broadcast after create so any pre-connected sockets (unlikely but possible)
    // get the new state. New players connect via Socket.IO after receiving the response.
    await this.gameGateway.broadcastGameState(result.state.id)

    return result
  }

  @Post('games/join')
  async join(
    @Body('code') code: string,
    @Body('playerName') playerName: string,
  ) {
    const result = await this.gamesService.joinGame(
      code,
      playerName,
    )

    await this.gameGateway.broadcastGameState(result.state.id)

    return result
  }

  @Get('games/:code')
  state(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken?: string,
  ) {
    return this.gamesService.getState(code, sessionToken)
  }

  @Post('games/:code/start')
  async start(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const state = await this.gamesService.startGame(code, sessionToken)

    await this.gameGateway.broadcastGameState(state.id)

    return state
  }

  @Post('games/:code/finish')
  async finish(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const state = await this.gamesService.finishGame(code, sessionToken)

    await this.gameGateway.broadcastGameState(state.id)

    return state
  }

  @Patch('games/:code/settings')
  async updateSettings(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('durationSeconds') durationSeconds: number,
    @Body('requiredQuestPoints') requiredQuestPoints: number,
  ) {
    const state = await this.gamesService.updateSettings(
      code,
      sessionToken,
      durationSeconds,
      requiredQuestPoints,
    )

    await this.gameGateway.broadcastGameState(state.id)

    return state
  }
}