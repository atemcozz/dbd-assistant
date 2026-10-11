import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  // CORS open so LAN players can connect from their phones/browsers.
  app.enableCors()

  const PORT = process.env.PORT;
  if (!PORT) {
    throw new Error('PORT environment variable is not defined')
  }

  const globalPrefix = process.env.API_GLOBAL_PREFIX || '';

  app.setGlobalPrefix(globalPrefix);

  await app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`)

  })


  console.log(`API base URL: ${await app.getUrl()}/${globalPrefix}`);

}

void bootstrap()
