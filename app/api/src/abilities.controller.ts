import {
  Controller,
  Headers,
  Param,
  Post,
  Body,
} from '@nestjs/common'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'
import { AbilitiesService } from './abilities.service'

@Controller()
export class AbilitiesController {
  constructor(
    private readonly abilitiesService: AbilitiesService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Post('games/:code/abilities/:abilityId/use')
  async use(
    @Param('code') code: string,
    @Param('abilityId') abilityId: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('targetPlayerId') targetPlayerId?: string,
  ) {
    await this.abilitiesService.use(
      code,
      abilityId,
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
