import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FILA_AGENDADOS, FILA_COMPROVANTES, FILA_NOTIFICACOES, FILA_RELATORIOS } from './filas';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = new URL(config.get('REDIS_URL', 'redis://localhost:6379'));
        return {
          prefix: config.get('FILAS_PREFIXO', 'gremio'),
          connection: {
            host: url.hostname,
            port: Number(url.port || 6379),
            password: url.password || undefined,
            db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
          },
          defaultJobOptions: {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5_000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          },
        };
      },
    }),
    BullModule.registerQueue(
      { name: FILA_COMPROVANTES },
      { name: FILA_AGENDADOS },
      { name: FILA_NOTIFICACOES },
      { name: FILA_RELATORIOS },
    ),
  ],
  exports: [BullModule],
})
export class FilasModule {}
