import { Controller, Get, Module } from '@nestjs/common'
import { GamesController } from './games.controller'
import { GamesService } from './games.service'
import { PrismaService } from './prisma.service'
import { GameGateway } from './game.gateway'
import { ChatController } from './chat.controller'
import { QuestsService } from './quests.service'
import { CharactersController } from './characters.controller'
import { QuestsController } from './quests.controller'
import { EffectsController } from './effects.controller'
import { CharactersService } from './characters.service'
import { EffectsService } from './effects.service'
import { ChatService } from './chat.service'
import { CombatService } from './combat.service'
import { CombatController } from './combat.controller'

@Controller()
class AppController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}

@Module({
 controllers: [
  GamesController,
  CharactersController,
  QuestsController,
  EffectsController,
  CombatController,
  ChatController,
],

providers: [
  GamesService,
  CharactersService,
  QuestsService,
  EffectsService,
  CombatService,
  ChatService,
  GameGateway,
  PrismaService,
],
})
export class AppModule {}
