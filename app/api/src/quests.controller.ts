import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'
import { QuestsService } from './quests.service'

@Controller()
export class QuestsController {
  constructor(
    private readonly questsService: QuestsService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Get('quest-definitions')
  listDefinitions(
    @Headers('x-session-token') sessionToken: string,
    // GET requests send the game code as a query parameter, not body/params.
    @Query('code') code?: string,
  ) {
    return this.questsService.listDefinitions(
      code ?? '',
      sessionToken,
    )
  }

  @Put('games/:code/quests')
  async select(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('questDefinitionIds') questDefinitionIds: string[],
  ) {
    const game = await this.questsService.select(
      code,
      sessionToken,
      questDefinitionIds,
    )

    const state = await this.gamesService.getState(
      game.code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(game.id)

    return state
  }

  @Post('games/:code/quests/:questId/complete')
  async complete(
    @Param('code') code: string,
    @Param('questId') questId: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const game = await this.questsService.complete(
      code,
      questId,
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