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
    @Body('targetQuestNumber') targetQuestNumber?: number,
  ) {
    const result = await this.abilitiesService.use(
      code,
      abilityId,
      targetPlayerId,
      sessionToken,
      targetQuestNumber,
    )

    const state = await this.gamesService.getState(
      code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(state.id)

    return {
      state,
      appliedEffects: result.appliedEffects,
      appliedQuestBlocks: result.appliedQuestBlocks,
    }
  }

  // Manual self-application by typed buff id (instructed during play).
  @Post('games/:code/buffs/self')
  async applySelfBuff(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('buffId') buffId?: string,
  ) {
    await this.abilitiesService.applyBuffToSelf(
      code,
      buffId ?? '',
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
