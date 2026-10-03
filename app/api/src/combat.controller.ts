import {
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'
import { CombatService } from './combat.service'

@Controller()
export class CombatController {
  constructor(
    private readonly combatService: CombatService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Post('games/:code/players/:playerId/attack')
  async attack(
    @Param('code') code: string,
    @Param('playerId') playerId: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const game = await this.combatService.attack(
      code,
      playerId,
      sessionToken,
    )

    const state = await this.gamesService.getState(
      code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(game.id)

    return state
  }
}