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
import { ExitsService } from './exits.service'

@Controller()
export class ExitsController {
  constructor(
    private readonly exitsService: ExitsService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Get('exit-definitions')
  listDefinitions(
    @Headers('x-session-token') sessionToken: string,
    @Query('code') code?: string,
  ) {
    return this.exitsService.listDefinitions(
      code ?? '',
      sessionToken,
    )
  }

  @Put('games/:code/exits')
  async select(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('exitDefinitionIds') exitDefinitionIds: string[],
  ) {
    const game = await this.exitsService.select(
      code,
      sessionToken,
      exitDefinitionIds,
    )

    const state = await this.gamesService.getState(
      game.code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(game.id)

    return state
  }

  @Post('games/:code/exits/:exitDefinitionId/use')
  async use(
    @Param('code') code: string,
    @Param('exitDefinitionId') exitDefinitionId: string,
    @Headers('x-session-token') sessionToken: string,
  ) {
    const game = await this.exitsService.use(
      code,
      exitDefinitionId,
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
