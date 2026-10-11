import 'dotenv/config'
import { join } from 'node:path'
import { NestFactory } from '@nestjs/core'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  // CORS open so LAN players can connect from their phones/browsers.
  app.enableCors()

  // Character covers — small files versioned with config, served as-is.
  // Default resolves from the backend location so it works for src (dev),
  // dist (prod) and the docker layout; IMAGES_DIR overrides it.
  // Mounted under /static/ so future static categories (sounds, maps,
  // ...) live alongside images without touching routes. Only the images
  // dir is exposed — never the whole config dir.
  // Note: /static stays outside API_GLOBAL_PREFIX (middleware, not a route).
  const imagesDir =
    process.env.IMAGES_DIR ?? join(__dirname, '..', '..', '..', 'config', 'images')
  app.useStaticAssets(imagesDir, { prefix: '/static/images/' })

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
