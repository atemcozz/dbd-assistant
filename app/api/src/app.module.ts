import { Controller, Get, Module } from '@nestjs/common'
import { GamesController } from './games.controller'
import { GamesService } from './games.service'
import { PrismaService } from './prisma.service'
import { GameGateway } from './game.gateway'
import { ChatController } from './chat.controller'
import { QuestsService } from './quests.service'
import { CharactersController } from './characters.controller'
import { QuestsController } from './quests.controller'
import { AbilitiesController } from './abilities.controller'
import { CharactersService } from './characters.service'
import { AbilitiesService } from './abilities.service'
import { ChatService } from './chat.service'
import { CombatService } from './combat.service'
import { CombatController } from './combat.controller'
import { ExitsService } from './exits.service'
import { ExitsController } from './exits.controller'

// Simple health-check endpoint — useful for manual verification and LAN checks.
@Controller()
class AppController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}

@Module({
  controllers: [
    AppController,
    GamesController,
    CharactersController,
    QuestsController,
    ExitsController,
    AbilitiesController,
    CombatController,
    ChatController,
  ],

  providers: [
    GamesService,
    CharactersService,
    QuestsService,
    ExitsService,
    AbilitiesService,
    CombatService,
    ChatService,
    GameGateway,
    PrismaService,
  ],
})
export class AppModule {}
