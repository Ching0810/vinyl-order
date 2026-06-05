import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // Parse the Cookie header into req.cookies (JwtStrategy reads the JWT cookie).
  app.use(cookieParser());

  // Browser allowlist: only these origins may make cross-origin calls and read
  // responses. Comma-separated, e.g. WEB_ORIGIN=http://localhost:3000
  // Unset -> empty list -> all cross-origin browser requests are blocked.
  // (Note: this only constrains browsers; it does not stop curl/server calls.)
  const webOrigin = config.get<string>('WEB_ORIGIN');
  app.enableCors({
    origin: webOrigin ? webOrigin.split(',').map((o) => o.trim()) : [],
    credentials: true,
  });

  await app.listen(config.get<string>('PORT') ?? 3001);
}
void bootstrap();
