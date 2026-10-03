import {
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets'
import { Logger } from '@nestjs/common'
import type { Server, Socket } from 'socket.io'
import { GamesService } from './games.service'

type SocketData = {
  gameId?: string
  playerId?: string
  sessionToken?: string
}

type GameSocket = Socket & {
  data: SocketData
}

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: false,
  },
})
export class GameGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(GameGateway.name)
  private readonly socketsBySession = new Map<string, Set<string>>()

  constructor(private readonly gamesService: GamesService) {}

  async handleConnection(socket: GameSocket) {
    const sessionToken = this.getSessionToken(socket)

    if (!sessionToken) {
      socket.emit('connection:error', {
        message: 'SESSION_REQUIRED',
      })
      socket.disconnect(true)
      return
    }

    try {
      const player =
        await this.gamesService.markConnected(sessionToken)

      socket.data.sessionToken = sessionToken
      socket.data.gameId = player.gameId
      socket.data.playerId = player.id

      await socket.join(this.gameRoom(player.gameId))

      this.addSocket(sessionToken, socket.id)

      // После подключения сразу отправляем актуальное состояние.
      await this.sendState(socket)

      this.server
        .to(this.gameRoom(player.gameId))
        .emit('player:reconnected', {
          playerId: player.id,
        })

      await this.broadcastGameState(player.gameId)
    } catch (error) {
      this.logger.warn(
        `Socket rejected: ${
          error instanceof Error
            ? error.message
            : 'unknown error'
        }`,
      )

      socket.emit('connection:error', {
        message: 'SESSION_INVALID',
      })

      socket.disconnect(true)
    }
  }

  async handleDisconnect(socket: GameSocket) {
    const sessionToken = socket.data.sessionToken
    const gameId = socket.data.gameId

    if (!sessionToken || !gameId) {
      return
    }

    this.removeSocket(sessionToken, socket.id)

    // У игрока может быть несколько вкладок/соединений.
    if (this.socketsBySession.has(sessionToken)) {
      return
    }

    try {
      const player =
        await this.gamesService.markDisconnected(sessionToken)

      this.server
        .to(this.gameRoom(gameId))
        .emit('player:disconnected', {
          playerId: player.id,
        })

      await this.broadcastGameState(gameId)
    } catch (error) {
      this.logger.warn(
        `Could not mark player disconnected: ${
          error instanceof Error
            ? error.message
            : 'unknown error'
        }`,
      )
    }
  }

  @SubscribeMessage('state:request')
  async requestState(
    @ConnectedSocket() socket: GameSocket,
  ) {
    await this.sendState(socket)
  }

  async broadcastGameState(gameId: string) {
    // Ищем обычные локальные Socket, поэтому не нужен RemoteSocket и каст.
    for (const socket of this.server.sockets.sockets.values()) {
      if (socket.data.gameId !== gameId) {
        continue
      }

      await this.sendState(socket as GameSocket)
    }
  }

  private async sendState(socket: GameSocket) {
    const gameId = socket.data.gameId
    const sessionToken = socket.data.sessionToken

    if (!gameId || !sessionToken) {
      return
    }

    const state = await this.gamesService.getStateById(
      gameId,
      sessionToken,
    )

    // State персональный: killer и survivor получают разные данные.
    socket.emit('game:state', state)
  }

  private getSessionToken(socket: Socket) {
    const authToken = socket.handshake.auth?.sessionToken

    if (
      typeof authToken === 'string' &&
      authToken.length > 0
    ) {
      return authToken
    }

    const headerToken =
      socket.handshake.headers['x-session-token']

    if (
      typeof headerToken === 'string' &&
      headerToken.length > 0
    ) {
      return headerToken
    }

    return null
  }

  private addSocket(
    sessionToken: string,
    socketId: string,
  ) {
    let sockets = this.socketsBySession.get(sessionToken)

    if (!sockets) {
      sockets = new Set<string>()
      this.socketsBySession.set(sessionToken, sockets)
    }

    sockets.add(socketId)
  }

  private removeSocket(
    sessionToken: string,
    socketId: string,
  ) {
    const sockets =
      this.socketsBySession.get(sessionToken)

    if (!sockets) {
      return
    }

    sockets.delete(socketId)

    if (sockets.size === 0) {
      this.socketsBySession.delete(sessionToken)
    }
  }

  private gameRoom(gameId: string) {
    return `game:${gameId}`
  }
}