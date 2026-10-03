import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { GameStatus, PlayerRole, PlayerStatus } from '@prisma/client'
import { PrismaService } from './prisma.service'

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async send(
    codeInput: string,
    sessionToken: string,
    text: string,
  ) {
    const code = codeInput.toUpperCase()

    const player = await this.prisma.player.findUnique({
      where: { sessionToken },
      include: { game: true },
    })

    if (!player) {
      throw new NotFoundException('PLAYER_NOT_FOUND')
    }

    if (
      player.role !== PlayerRole.SURVIVOR ||
      player.status !== PlayerStatus.ALIVE
    ) {
      throw new ForbiddenException('SURVIVOR_CHAT_RESTRICTED')
    }

    if (player.game.code !== code) {
      throw new NotFoundException('GAME_NOT_FOUND')
    }

    if (player.game.status !== GameStatus.RUNNING) {
      throw new ConflictException('GAME_NOT_RUNNING')
    }

    const value = text.trim()

    if (!value) {
      throw new ConflictException('MESSAGE_EMPTY')
    }

    await this.prisma.chatMessage.create({
      data: {
        gameId: player.gameId,
        playerId: player.id,
        text: value.slice(0, 500),
      },
    })

    return true
  }
}