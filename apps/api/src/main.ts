import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { executarComContexto } from './common/contexto';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Atrás do Caddy, o IP real vem no X-Forwarded-For; sem isso o limite de tentativas
  // de login valeria para todos os usuários juntos.
  if (process.env.TRUST_PROXY) {
    app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY));
  }
  // Abre um contexto por requisição; o JwtAuthGuard preenche o autor nele.
  app.use((_req: unknown, _res: unknown, next: () => void) => executarComContexto({}, next));
  app.use(cookieParser());
  app.enableShutdownHooks();
  // O PWA acessa a API pela mesma origem (proxy do Nuxt em dev, Caddy em produção),
  // então CORS fica desligado.
  await app.listen(process.env.PORT ?? 4000);
}

bootstrap();
