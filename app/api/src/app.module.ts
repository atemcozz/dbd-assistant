import { Controller, Get, Module } from '@nestjs/common'

@Controller()
class AppController {
  @Get('health')
  health() {
    return { status: 'ok' }
  }
}

@Module({
  controllers: [AppController],
})
export class AppModule {}
