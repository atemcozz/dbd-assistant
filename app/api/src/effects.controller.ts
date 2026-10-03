import {
  Controller,
  Headers,
  Param,
  Post,
  Body,
} from '@nestjs/common'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'
import { EffectsService } from './effects.service'

@Controller()
export class EffectsController {
  constructor(
    private readonly effectsService: EffectsService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Post('games/:code/effects/:effectId/use')
  async use(
    @Param('code') code: string,
    @Param('effectId') effectId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('targetPlayerId') targetPlayerId?: string,
  ) {
    await this.effectsService.use(
      code,
      effectId,
      targetPlayerId,
      sessionToken,
    )

    const state = await this.gamesService.getState(
      code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(state.id)

    return state
  }
}