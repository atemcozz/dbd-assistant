import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
} from '@nestjs/common'
import { ChatService } from './chat.service'
import { GameGateway } from './game.gateway'
import { GamesService } from './games.service'

@Controller()
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly gamesService: GamesService,
    private readonly gameGateway: GameGateway,
  ) {}

  @Post('games/:code/chat')
  async send(
    @Param('code') code: string,
    @Headers('x-session-token') sessionToken: string,
    @Body('text') text: string,
  ) {
    await this.chatService.send(
      code,
      sessionToken,
      text,
    )

    const state = await this.gamesService.getState(
      code,
      sessionToken,
    )

    await this.gameGateway.broadcastGameState(state.id)

    return state
  }
}