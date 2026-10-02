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

type AuthenticatedSocket = Socket & {
  data: {
    gameId?: string
    playerId?: string
    sessionToken?: string
  }
}

@WebSocketGateway({ cors: { origin: true, credentials: false } })
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server

  private readonly logger = new Logger(GameGateway.name)
  private readonly socketsBySession = new Map<string, Set<string>>()

  constructor(private readonly gamesService: GamesService) {}

  async handleConnection(socket: AuthenticatedSocket) {
    const sessionToken = this.readSessionToken(socket)
    if (!sessionToken) {
      socket.emit('connection:error', { message: 'SESSION_REQUIRED' })
      socket.disconnect(true)
      return
    }

    try {
      const player = await this.gamesService.markConnected(sessionToken)
      socket.data.sessionToken = sessionToken
      socket.data.gameId = player.gameId
      socket.data.playerId = player.id
      await socket.join(this.gameRoom(player.gameId))
      this.trackSocket(sessionToken, socket.id)
      await this.emitState(socket)
      this.server.to(this.gameRoom(player.gameId)).emit('player:reconnected', { playerId: player.id })
      await this.broadcastGameState(player.gameId)
    } catch (error) {
      this.logger.warn(`Socket rejected: ${error instanceof Error ? error.message : 'unknown error'}`)
      socket.emit('connection:error', { message: 'SESSION_INVALID' })
      socket.disconnect(true)
    }
  }

  async handleDisconnect(socket: AuthenticatedSocket) {
    const sessionToken = socket.data.sessionToken
    const gameId = socket.data.gameId
    if (!sessionToken || !gameId) return
    this.untrackSocket(sessionToken, socket.id)
    if (this.socketsBySession.has(sessionToken)) return

    try {
      const player = await this.gamesService.markDisconnected(sessionToken)
      this.server.to(this.gameRoom(gameId)).emit('player:disconnected', { playerId: player.id })
      await this.broadcastGameState(gameId)
    } catch (error) {
      this.logger.warn(`Could not mark socket player disconnected: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  @SubscribeMessage('state:request')
  async requestState(@ConnectedSocket() socket: AuthenticatedSocket) {
    await this.emitState(socket)
  }

  async broadcastGameState(gameId: string) {
    const room = this.gameRoom(gameId)
    const sockets = await this.server.in(room).fetchSockets()
    await Promise.all(sockets.map((socket) => this.emitState(socket as unknown as AuthenticatedSocket)))
  }

  private async emitState(socket: AuthenticatedSocket) {
    if (!socket.data.gameId || !socket.data.sessionToken) return
    const state = await this.gamesService.getStateById(socket.data.gameId, socket.data.sessionToken)
    socket.emit('game:state', state)
  }

  private readSessionToken(socket: Socket) {
    const authToken = socket.handshake.auth?.sessionToken
    const headerToken = socket.handshake.headers['x-session-token']
    const token = typeof authToken === 'string' ? authToken : headerToken
    return typeof token === 'string' && token.length > 0 ? token : null
  }

  private trackSocket(sessionToken: string, socketId: string) {
    const sockets = this.socketsBySession.get(sessionToken) ?? new Set<string>()
    sockets.add(socketId)
    this.socketsBySession.set(sessionToken, sockets)
  }

  private untrackSocket(sessionToken: string, socketId: string) {
    const sockets = this.socketsBySession.get(sessionToken)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) this.socketsBySession.delete(sessionToken)
  }

  private gameRoom(gameId: string) {
    return `game:${gameId}`
  }
}
