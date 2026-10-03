import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // CORS open so LAN players can connect from their phones/browsers.
  app.enableCors()

  // Bind to 0.0.0.0 so the app is reachable from other devices on the local network.
  await app.listen(process.env.PORT ?? 3000, '0.0.0.0', () => {
    console.log(`Server is running on port ${process.env.PORT ?? 3000}`)
  })
}

void bootstrap()
