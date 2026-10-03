import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { GamesService } from './games.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.enableCors()

  const gamesService = app.get(GamesService)


  await app.listen(process.env.PORT ?? 3000, '0.0.0.0', () => {
    console.log(`Server is running on port ${process.env.PORT ?? 3000}`)
  })
}

void bootstrap()
