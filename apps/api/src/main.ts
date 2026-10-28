import { resolve } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { applyTrustProxy } from './common/trust-proxy';

async function bootstrap() {
  // rawBody keeps each request's exact bytes on req.rawBody beside the parsed
  // req.body: a webhook's signature is computed over those bytes, and
  // re-serialising the parsed JSON would not reproduce them.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  // Behind a proxy, the client's address is in X-Forwarded-For; the rate limit
  // needs it (docs/design/deploy.md §6.2).
  applyTrustProxy(app, config.getOrThrow<number>('TRUST_PROXY'));

  // Parse the Cookie header into req.cookies (JwtStrategy reads the JWT cookie).
  app.use(cookieParser());

  // Serve locally-uploaded images at /uploads/<file> (dev StorageService writes
  // here). In production this is replaced by GCS, so this route is dev-only.
  const uploadDir = resolve(process.cwd(), config.get<string>('UPLOAD_DIR') ?? './uploads');
  app.useStaticAssets(uploadDir, { prefix: '/uploads' });

  // Browser allowlist: only these origins may make cross-origin calls and read
  // responses. Comma-separated, e.g. WEB_ORIGIN=http://localhost:3000
  // Unset -> empty list -> all cross-origin browser requests are blocked.
  // (Note: this only constrains browsers; it does not stop curl/server calls.)
  const webOrigin = config.get<string>('WEB_ORIGIN');
  app.enableCors({
    origin: webOrigin ? webOrigin.split(',').map((o) => o.trim()) : [],
    credentials: true,
  });

  // On SIGTERM — a platform stopping the container — close the app: each
  // module's onModuleDestroy runs (database connections, MockPay's webhook
  // timers) and the process exits. Without a handler, Node running as the
  // container's PID 1 ignores the signal, and the platform has to kill it.
  app.enableShutdownHooks();

  await app.listen(config.get<string>('PORT') ?? 3001);
}
void bootstrap();
