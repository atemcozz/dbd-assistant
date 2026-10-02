import { Controller, Get, Module } from '@nestjs/common'
import { GamesController } from './games.controller'
import { GamesService } from './games.service'
import { PrismaService } from './prisma.service'

@Controller()
class AppController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}

@Module({
  controllers: [AppController, GamesController],
  providers: [GamesService, PrismaService],
})
export class AppModule {}
