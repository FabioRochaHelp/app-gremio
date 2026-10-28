import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AssociadosModule } from './associados/associados.module';
import { AuthModule } from './auth/auth.module';
import { Publico } from './auth/decorators';
import { JwtAuthGuard, PerfilGuard, TermoGuard } from './auth/guards';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { ComprovantesModule } from './comprovantes/comprovantes.module';
import { ConfiguracaoModule } from './configuracao/configuracao.module';
import { FechamentosModule } from './fechamentos/fechamentos.module';
import { processarFilasNesteProcesso } from './filas/filas';
import { FilasModule } from './filas/filas.module';
import { ProcessadoresModule } from './filas/processadores';
import { LancamentosModule } from './lancamentos/lancamentos.module';
import { MensalidadesModule } from './mensalidades/mensalidades.module';
import { NotificacoesModule } from './notificacoes/notificacoes.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';

@Controller('health')
class HealthController {
  @Publico()
  @Get()
  ok() {
    return { ok: true };
  }
}

/** Infraestrutura comum à API e ao worker. */
export const MODULOS_BASE = [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, StorageModule, FilasModule];

@Module({
  imports: [
    ...MODULOS_BASE,
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    AssociadosModule,
    ConfiguracaoModule,
    MensalidadesModule,
    ComprovantesModule,
    LancamentosModule,
    NotificacoesModule,
    FechamentosModule,
    ...(processarFilasNesteProcesso() ? [ProcessadoresModule] : []),
  ],
  controllers: [HealthController],
  providers: [
    // A ordem importa: autentica, depois checa perfil e aceite do termo.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PerfilGuard },
    { provide: APP_GUARD, useClass: TermoGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
